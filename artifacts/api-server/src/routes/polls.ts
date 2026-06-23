import { Router } from "express";
import { db, pollsTable, pollQuestionsTable, pollOptionsTable, pollSubmissionsTable, usersTable, auditLogsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";
import { getAIProvider } from "../lib/ai-provider";

const router = Router();

function requireRole(...roles: string[]) {
  return requireAuth;
}

// GET /polls — list polls
router.get("/polls", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  let polls;
  if (user.role === "owner" || user.role === "teacher") {
    polls = await db.select().from(pollsTable).orderBy(desc(pollsTable.createdAt));
  } else {
    polls = await db.select().from(pollsTable)
      .where(eq(pollsTable.status, "active"))
      .orderBy(desc(pollsTable.createdAt));
  }
  res.json(polls);
});

// POST /polls — create poll (teacher/owner)
router.post("/polls", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role === "student") { res.status(403).json({ error: "Forbidden" }); return; }
  const { title, topic, type = "manual", grade, subject, mode = "practice", timerSeconds, questions } = req.body as {
    title: string; topic?: string; type?: string; grade?: string; subject?: string;
    mode?: string; timerSeconds?: number;
    questions?: { question: string; difficulty?: string; explanation?: string; options: { text: string; isCorrect: boolean }[] }[];
  };
  if (!title) { res.status(400).json({ error: "title required" }); return; }

  const [poll] = await db.insert(pollsTable).values({ title, topic, type, grade, subject, mode, timerSeconds, createdBy: user.id, status: "draft" }).returning();

  if (questions && questions.length > 0) {
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const [pq] = await db.insert(pollQuestionsTable).values({ pollId: poll.id, question: q.question, difficulty: q.difficulty ?? "medium", explanation: q.explanation, orderIndex: i }).returning();
      for (const opt of q.options) {
        await db.insert(pollOptionsTable).values({ questionId: pq.id, text: opt.text, isCorrect: opt.isCorrect });
      }
    }
  }

  await db.insert(auditLogsTable).values({ action: `Created poll: ${title}`, category: "admin", performedBy: user.id, targetType: "poll", targetId: poll.id, details: JSON.stringify({ type, mode }) });
  res.status(201).json(poll);
});

// POST /polls/ai-generate — generate poll questions with AI
router.post("/polls/ai-generate", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role === "student") { res.status(403).json({ error: "Forbidden" }); return; }
  const { topic, grade, subject, count = 5 } = req.body as { topic: string; grade?: string; subject?: string; count?: number };
  if (!topic) { res.status(400).json({ error: "topic required" }); return; }
  try {
    const ai = await getAIProvider();
    const generated = await ai.generatePoll(topic, grade, subject, count);
    res.json({ provider: ai.name, ...generated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI generation failed";
    res.status(500).json({ error: msg });
  }
});

// GET /polls/:id — get poll with questions and options
router.get("/polls/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [poll] = await db.select().from(pollsTable).where(eq(pollsTable.id, id));
  if (!poll) { res.status(404).json({ error: "Not found" }); return; }
  const questions = await db.select().from(pollQuestionsTable).where(eq(pollQuestionsTable.pollId, id)).orderBy(pollQuestionsTable.orderIndex);
  const questionsWithOptions = await Promise.all(questions.map(async q => {
    const options = await db.select().from(pollOptionsTable).where(eq(pollOptionsTable.questionId, q.id));
    const user = req.currentUser!;
    // Hide isCorrect from students unless poll is closed
    const safeOptions = (user.role === "student" && poll.status !== "closed")
      ? options.map(o => ({ ...o, isCorrect: undefined }))
      : options;
    return { ...q, options: safeOptions };
  }));
  res.json({ ...poll, questions: questionsWithOptions });
});

// PATCH /polls/:id — update poll status / metadata
router.patch("/polls/:id", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role === "student") { res.status(403).json({ error: "Forbidden" }); return; }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { status, title, timerSeconds } = req.body as { status?: string; title?: string; timerSeconds?: number };
  const update: Record<string, unknown> = {};
  if (status) update.status = status;
  if (title) update.title = title;
  if (timerSeconds !== undefined) update.timerSeconds = timerSeconds;
  const [updated] = await db.update(pollsTable).set(update).where(eq(pollsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

// DELETE /polls/:id
router.delete("/polls/:id", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role === "student") { res.status(403).json({ error: "Forbidden" }); return; }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(pollsTable).where(eq(pollsTable.id, id));
  res.sendStatus(204);
});

// POST /polls/:id/submit — student submits answers
router.post("/polls/:id/submit", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [poll] = await db.select().from(pollsTable).where(eq(pollsTable.id, id));
  if (!poll || poll.status !== "active") { res.status(400).json({ error: "Poll not available" }); return; }

  // Check already submitted
  const [existing] = await db.select().from(pollSubmissionsTable)
    .where(and(eq(pollSubmissionsTable.pollId, id), eq(pollSubmissionsTable.studentId, user.id)));
  if (existing) { res.status(400).json({ error: "Already submitted" }); return; }

  const { answers } = req.body as { answers: { questionId: number; optionId: number }[] };
  if (!answers || !Array.isArray(answers)) { res.status(400).json({ error: "answers required" }); return; }

  // Score calculation
  const questions = await db.select().from(pollQuestionsTable).where(eq(pollQuestionsTable.pollId, id));
  let score = 0;
  const detailedAnswers: { questionId: number; optionId: number; isCorrect: boolean }[] = [];

  for (const ans of answers) {
    const [correctOpt] = await db.select().from(pollOptionsTable)
      .where(and(eq(pollOptionsTable.questionId, ans.questionId), eq(pollOptionsTable.isCorrect, true)));
    const isCorrect = correctOpt?.id === ans.optionId;
    if (isCorrect) score++;
    detailedAnswers.push({ ...ans, isCorrect });
  }

  const [submission] = await db.insert(pollSubmissionsTable).values({
    pollId: id, studentId: user.id,
    answers: JSON.stringify(detailedAnswers),
    score, totalQuestions: questions.length,
  }).returning();

  // Build feedback with correct answers
  const feedback = await Promise.all(questions.map(async q => {
    const options = await db.select().from(pollOptionsTable).where(eq(pollOptionsTable.questionId, q.id));
    const correct = options.find(o => o.isCorrect);
    const submitted = detailedAnswers.find(a => a.questionId === q.id);
    return { questionId: q.id, question: q.question, explanation: q.explanation, correctOptionId: correct?.id, correctText: correct?.text, submittedOptionId: submitted?.optionId, isCorrect: submitted?.isCorrect ?? false };
  }));

  res.json({ submission, score, totalQuestions: questions.length, percentage: Math.round((score / questions.length) * 100), feedback });
});

// GET /polls/:id/results — leaderboard + analytics
router.get("/polls/:id/results", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const submissions = await db.select({
    id: pollSubmissionsTable.id, score: pollSubmissionsTable.score,
    totalQuestions: pollSubmissionsTable.totalQuestions, completedAt: pollSubmissionsTable.completedAt,
    studentName: usersTable.name, studentId: usersTable.id,
  }).from(pollSubmissionsTable)
    .leftJoin(usersTable, eq(pollSubmissionsTable.studentId, usersTable.id))
    .where(eq(pollSubmissionsTable.pollId, id))
    .orderBy(desc(pollSubmissionsTable.score));

  const total = submissions.length;
  const avgScore = total > 0 ? submissions.reduce((s, r) => s + (r.totalQuestions > 0 ? r.score / r.totalQuestions : 0), 0) / total * 100 : 0;
  res.json({ submissions, total, avgScore: Math.round(avgScore) });
});

export default router;
