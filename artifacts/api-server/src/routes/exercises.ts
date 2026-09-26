import { Router } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  exercisesTable,
  exerciseAnswersTable,
  exerciseOptionsTable,
  exerciseQuestionsTable,
  exerciseSubmissionsTable,
  lessonsTable,
} from "@workspace/db/schema";
import { requireAuth } from "../lib/auth-middleware";

const router = Router();
const teacherRoles = ["teacher", "owner", "admin"];
const learnerRole = "student";
const questionTypes = new Set(["input", "poll", "drawbox"]);

function parseId(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function canEditExercise(user: NonNullable<Express.Request["currentUser"]>, createdBy: number): boolean {
  return user.role === "owner" || user.role === "admin" || (user.role === "teacher" && createdBy === user.id);
}

router.get("/lessons/:lessonId/exercises", requireAuth, async (req, res): Promise<void> => {
  const lessonId = parseId(req.params.lessonId);
  if (!lessonId) { res.status(400).json({ error: "Invalid lesson id" }); return; }

  const exercises = await db.select().from(exercisesTable)
    .where(and(eq(exercisesTable.lessonId, lessonId), eq(exercisesTable.status, "published")))
    .orderBy(desc(exercisesTable.createdAt));

  if (req.currentUser && teacherRoles.includes(req.currentUser.role)) {
    const own = await db.select().from(exercisesTable).where(eq(exercisesTable.lessonId, lessonId)).orderBy(desc(exercisesTable.createdAt));
    res.json(own); return;
  }
  res.json(exercises);
});

router.get("/:id", requireAuth, async (req, res): Promise<void> => {
  const exerciseId = parseId(req.params.id);
  if (!exerciseId) { res.status(400).json({ error: "Invalid exercise id" }); return; }
  const [exercise] = await db.select().from(exercisesTable).where(eq(exercisesTable.id, exerciseId));
  if (!exercise) { res.status(404).json({ error: "Exercise not found" }); return; }
  if (exercise.status !== "published" && !canEditExercise(req.currentUser!, exercise.createdBy)) {
    res.status(404).json({ error: "Exercise not found" }); return;
  }
  const questions = await db.select().from(exerciseQuestionsTable).where(eq(exerciseQuestionsTable.exerciseId, exercise.id)).orderBy(asc(exerciseQuestionsTable.position));
  const options = questions.length
    ? await db.select().from(exerciseOptionsTable).where(eq(exerciseOptionsTable.questionId, questions[0].id))
    : [];
  const allOptions = questions.length > 1
    ? await Promise.all(questions.map((q) => db.select().from(exerciseOptionsTable).where(eq(exerciseOptionsTable.questionId, q.id))))
    : [options];
  const safeOptions = allOptions.flat().map(({ isCorrect: _isCorrect, ...option }) => option);
  res.json({ exercise, questions, options: safeOptions });
});

router.post("/lessons/:lessonId/exercises", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!teacherRoles.includes(user.role)) { res.status(403).json({ error: "Teacher or owner access required" }); return; }
  const lessonId = parseId(req.params.lessonId);
  if (!lessonId) { res.status(400).json({ error: "Invalid lesson id" }); return; }
  const [lesson] = await db.select({ id: lessonsTable.id }).from(lessonsTable).where(eq(lessonsTable.id, lessonId));
  if (!lesson) { res.status(404).json({ error: "Lesson not found" }); return; }
  const { title, instructions, grade, stream, layout } = req.body ?? {};
  if (typeof title !== "string" || !title.trim() || title.length > 300) { res.status(400).json({ error: "title is required" }); return; }
  const [exercise] = await db.insert(exercisesTable).values({
    lessonId,
    createdBy: user.id,
    title: title.trim(),
    instructions: typeof instructions === "string" ? instructions : null,
    grade: typeof grade === "string" && grade.trim() ? grade.trim() : null,
    stream: typeof stream === "string" && stream.trim() ? stream.trim() : null,
    layout: layout && typeof layout === "object" ? layout : { version: 1, page: "book" },
  }).returning();
  res.status(201).json(exercise);
});

router.post("/:id/questions", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!teacherRoles.includes(user.role)) { res.status(403).json({ error: "Teacher or owner access required" }); return; }
  const exerciseId = parseId(req.params.id);
  if (!exerciseId) { res.status(400).json({ error: "Invalid exercise id" }); return; }
  const [exercise] = await db.select().from(exercisesTable).where(eq(exercisesTable.id, exerciseId));
  if (!exercise) { res.status(404).json({ error: "Exercise not found" }); return; }
  if (!canEditExercise(user, exercise.createdBy)) { res.status(403).json({ error: "You can only edit your own exercise" }); return; }
  const { prompt, type, marksAllocated, position, config, options } = req.body ?? {};
  const marks = Number(marksAllocated ?? 1);
  if (typeof prompt !== "string" || !prompt.trim() || !questionTypes.has(type) || !Number.isFinite(marks) || marks < 0 || marks > 10000) {
    res.status(400).json({ error: "prompt, type (input|poll|drawbox), and valid marksAllocated are required" }); return;
  }
  const [question] = await db.insert(exerciseQuestionsTable).values({
    exerciseId, prompt: prompt.trim(), type, marksAllocated: marks.toString(),
    position: Number.isInteger(position) && position >= 0 ? position : 0,
    config: config && typeof config === "object" ? config : {},
  }).returning();

  if (type === "poll" && Array.isArray(options)) {
    const rows = options.filter((item) => item && typeof item.label === "string" && typeof item.value === "string").map((item, index) => ({
      questionId: question.id,
      label: item.label.trim(),
      value: item.value.trim(),
      position: index,
      isCorrect: Boolean(item.isCorrect),
    }));
    if (rows.length) await db.insert(exerciseOptionsTable).values(rows);
  }
  res.status(201).json(question);
});

router.post("/:id/publish", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!teacherRoles.includes(user.role)) { res.status(403).json({ error: "Teacher or owner access required" }); return; }
  const exerciseId = parseId(req.params.id);
  if (!exerciseId) { res.status(400).json({ error: "Invalid exercise id" }); return; }
  const [exercise] = await db.select().from(exercisesTable).where(eq(exercisesTable.id, exerciseId));
  if (!exercise) { res.status(404).json({ error: "Exercise not found" }); return; }
  if (!canEditExercise(user, exercise.createdBy)) { res.status(403).json({ error: "You can only publish your own exercise" }); return; }
  const questions = await db.select().from(exerciseQuestionsTable).where(eq(exerciseQuestionsTable.exerciseId, exercise.id));
  if (!questions.length) { res.status(409).json({ error: "Add at least one question before publishing" }); return; }
  const totalMarks = questions.reduce((sum, q) => sum + Number(q.marksAllocated), 0);
  const [updated] = await db.update(exercisesTable).set({ status: "published", totalMarks: totalMarks.toString(), publishedAt: new Date() }).where(eq(exercisesTable.id, exercise.id)).returning();
  res.json(updated);
});

router.post("/:id/submit", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role !== learnerRole) { res.status(403).json({ error: "Student access required" }); return; }
  const exerciseId = parseId(req.params.id);
  if (!exerciseId) { res.status(400).json({ error: "Invalid exercise id" }); return; }
  const [exercise] = await db.select().from(exercisesTable).where(eq(exercisesTable.id, exerciseId));
  if (!exercise || exercise.status !== "published") { res.status(404).json({ error: "Exercise not found" }); return; }
  const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
  const [existing] = await db.select().from(exerciseSubmissionsTable).where(and(eq(exerciseSubmissionsTable.exerciseId, exercise.id), eq(exerciseSubmissionsTable.learnerId, user.id)));
  const [submission] = existing
    ? await db.update(exerciseSubmissionsTable).set({ status: "submitted", submittedAt: new Date() }).where(eq(exerciseSubmissionsTable.id, existing.id)).returning()
    : await db.insert(exerciseSubmissionsTable).values({ exerciseId: exercise.id, learnerId: user.id }).returning();

  for (const answer of answers) {
    const questionId = parseId(answer?.questionId);
    if (!questionId) continue;
    const [question] = await db.select({ id: exerciseQuestionsTable.id }).from(exerciseQuestionsTable).where(and(eq(exerciseQuestionsTable.id, questionId), eq(exerciseQuestionsTable.exerciseId, exercise.id)));
    if (!question) continue;
    const values = {
      textAnswer: typeof answer.textAnswer === "string" ? answer.textAnswer : null,
      selectedValue: typeof answer.selectedValue === "string" ? answer.selectedValue : null,
      drawData: answer.drawData && typeof answer.drawData === "object" ? answer.drawData : null,
      mediaReference: typeof answer.mediaReference === "string" ? answer.mediaReference : null,
    };
    const [existingAnswer] = await db.select().from(exerciseAnswersTable).where(and(eq(exerciseAnswersTable.submissionId, submission.id), eq(exerciseAnswersTable.questionId, questionId)));
    if (existingAnswer) await db.update(exerciseAnswersTable).set(values).where(eq(exerciseAnswersTable.id, existingAnswer.id));
    else await db.insert(exerciseAnswersTable).values({ submissionId: submission.id, questionId, ...values });
  }
  res.status(existing ? 200 : 201).json({ submissionId: submission.id, status: submission.status });
});

router.get("/:id/submissions", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!teacherRoles.includes(user.role)) { res.status(403).json({ error: "Teacher or owner access required" }); return; }
  const exerciseId = parseId(req.params.id);
  if (!exerciseId) { res.status(400).json({ error: "Invalid exercise id" }); return; }
  const [exercise] = await db.select().from(exercisesTable).where(eq(exercisesTable.id, exerciseId));
  if (!exercise) { res.status(404).json({ error: "Exercise not found" }); return; }
  if (!canEditExercise(user, exercise.createdBy)) { res.status(403).json({ error: "You can only view your own exercise submissions" }); return; }
  const submissions = await db.select().from(exerciseSubmissionsTable).where(eq(exerciseSubmissionsTable.exerciseId, exercise.id)).orderBy(desc(exerciseSubmissionsTable.submittedAt));
  res.json(submissions);
});

export default router;
