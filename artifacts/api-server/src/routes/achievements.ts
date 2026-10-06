import { Router } from "express";
import { db } from "@workspace/db";
import { achievementsTable, userAchievementsTable, usersTable, lessonRequestsTable, notificationsTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";

const router = Router();

router.get("/", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(achievementsTable).where(eq(achievementsTable.isActive, true));
  res.json(rows);
});

router.get("/my", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const rows = await db.select().from(userAchievementsTable)
    .where(eq(userAchievementsTable.userId, user.id))
    .orderBy(desc(userAchievementsTable.earnedAt));
  if (rows.length === 0) { res.json([]); return; }
  const achievements = await db.select().from(achievementsTable);
  const result = rows.map((ua: any) => ({
    ...ua,
    achievement: achievements.find((a: any) => a.id === ua.achievementId),
  }));
  res.json(result);
});

router.get("/leaderboard", requireAuth, async (_req, res): Promise<void> => {
  const users = await db.select({
    id: usersTable.id, name: usersTable.name, role: usersTable.role,
    grade: usersTable.grade, performanceScore: usersTable.performanceScore,
    badgeCount: usersTable.badgeCount, streakDays: usersTable.streakDays,
    isPrefect: usersTable.isPrefect,
  }).from(usersTable).where(eq(usersTable.role, "student"));
  users.sort((a: any, b: any) => (b.performanceScore ?? 0) - (a.performanceScore ?? 0));
  res.json(users.slice(0, 20));
});

router.get("/user/:userId", requireAuth, async (req, res): Promise<void> => {
  const userId = parseInt(String(req.params.userId));
  const rows = await db.select().from(userAchievementsTable)
    .where(eq(userAchievementsTable.userId, userId))
    .orderBy(desc(userAchievementsTable.earnedAt));
  const achievements = await db.select().from(achievementsTable);
  const result = rows.map((ua: any) => ({
    ...ua,
    achievement: achievements.find((a: any) => a.id === ua.achievementId),
  }));
  res.json(result);
});

router.post("/", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role !== "owner") { res.status(403).json({ error: "Forbidden" }); return; }
  const { name, description, icon, category, pointsValue, criteria } = req.body;
  if (!name || !description) { res.status(400).json({ error: "name and description required" }); return; }
  const [row] = await db.insert(achievementsTable).values({
    name, description, icon: icon ?? "🏆", category: category ?? "learning", pointsValue: pointsValue ?? 10, criteria,
  }).returning();
  res.status(201).json(row);
});

router.post("/award", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role !== "owner" && !user.isManager) { res.status(403).json({ error: "Forbidden" }); return; }
  const { userId, achievementId, note } = req.body;
  if (!userId || !achievementId) { res.status(400).json({ error: "userId and achievementId required" }); return; }
  const existing = await db.select().from(userAchievementsTable)
    .where(and(eq(userAchievementsTable.userId, userId), eq(userAchievementsTable.achievementId, achievementId)));
  if (existing.length > 0) { res.status(409).json({ error: "Already awarded" }); return; }
  const [achievement] = await db.select().from(achievementsTable).where(eq(achievementsTable.id, achievementId));
  const [ua] = await db.insert(userAchievementsTable).values({
    userId, achievementId, awardedBy: user.id, awardedByName: user.name, note,
  }).returning();
  const currentUser = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const currentScore = currentUser[0]?.performanceScore ?? 0;
  const currentBadges = currentUser[0]?.badgeCount ?? 0;
  await db.update(usersTable).set({
    badgeCount: currentBadges + 1,
    performanceScore: currentScore + (achievement?.pointsValue ?? 10),
  }).where(eq(usersTable.id, userId));
  res.status(201).json(ua);
});

router.get("/prefect-teachers", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!user.isPrefect) { res.status(403).json({ error: "Prefect access required" }); return; }
  const teachers = await db.select({ id: usersTable.id, name: usersTable.name, subject: usersTable.subject })
    .from(usersTable).where(eq(usersTable.role, "teacher"));
  res.json(teachers);
});

router.get("/lesson-requests", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const rows = user.isPrefect
    ? await db.select().from(lessonRequestsTable).where(eq(lessonRequestsTable.prefectId, user.id)).orderBy(desc(lessonRequestsTable.createdAt))
    : user.role === "teacher"
      ? await db.select().from(lessonRequestsTable).where(and(eq(lessonRequestsTable.teacherId, user.id), eq(lessonRequestsTable.status, "pending"))).orderBy(desc(lessonRequestsTable.createdAt))
      : [];
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString(), responseAt: r.responseAt?.toISOString() ?? null })));
});

router.post("/lesson-requests", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!user.isPrefect) { res.status(403).json({ error: "Prefect access required" }); return; }
  const { teacherId, topic, notes, preferredDate } = req.body ?? {};
  const teacher = Number(teacherId);
  if (!Number.isInteger(teacher) || !topic?.trim()) { res.status(400).json({ error: "teacherId and topic are required" }); return; }
  const [target] = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(and(eq(usersTable.id, teacher), eq(usersTable.role, "teacher")));
  if (!target) { res.status(404).json({ error: "Teacher not found" }); return; }
  const [request] = await db.insert(lessonRequestsTable).values({
    prefectId: user.id, teacherId: target.id, topic: topic.trim(), notes: notes?.trim() || null, preferredDate: preferredDate || null,
  }).returning();
  await db.insert(notificationsTable).values({
    title: `Lesson request: ${topic.trim()}`,
    message: `Prefect ${user.name} requested "${topic.trim()}". Open Prefect Requests to respond.`,
    type: "lesson_request", recipientId: target.id, isRead: false,
  });
  res.status(201).json(request);
});

router.patch("/lesson-requests/:id", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const id = Number(req.params.id);
  const [request] = await db.select().from(lessonRequestsTable).where(eq(lessonRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Lesson request not found" }); return; }
  if (user.id !== request.teacherId && user.id !== request.prefectId && user.role !== "owner" && !user.isManager) { res.status(403).json({ error: "Forbidden" }); return; }
  const status = String(req.body?.status ?? request.status);
  const allowed = ["pending","accepted","declined","completed","cancelled","dismissed"];
  if (!allowed.includes(status)) { res.status(400).json({ error: "Invalid status" }); return; }
  const reply = typeof req.body?.teacherReply === "string" ? req.body.teacherReply.trim() : request.teacherReply;
  const [updated] = await db.update(lessonRequestsTable).set({ status, teacherReply: reply, responseAt: user.id === request.teacherId ? new Date() : request.responseAt }).where(eq(lessonRequestsTable.id,id)).returning();
  if (user.id === request.teacherId) {
    await db.insert(notificationsTable).values({
      title: `Lesson request ${status}`,
      message: reply ? `Teacher reply: ${reply}` : `Your lesson request is now ${status}.`,
      type: "lesson_request", recipientId: request.prefectId, isRead: false,
      link: `/student/prefect?request=${request.id}`,
    });
  }
  res.json(updated);
});

router.get("/prefect-leaderboard", requireAuth, async (_req, res): Promise<void> => {
  const prefects = await db.select({
    id: usersTable.id, name: usersTable.name, grade: usersTable.grade,
    performanceScore: usersTable.performanceScore, badgeCount: usersTable.badgeCount,
    streakDays: usersTable.streakDays,
  }).from(usersTable).where(and(eq(usersTable.isPrefect, true), eq(usersTable.role, "student")));
  prefects.sort((a: any, b: any) => (b.performanceScore ?? 0) - (a.performanceScore ?? 0));
  res.json(prefects);
});

router.delete("/lesson-requests/:id", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid request id" }); return; }
  const [request] = await db.select().from(lessonRequestsTable).where(eq(lessonRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Lesson request not found" }); return; }
  if (user.id !== request.teacherId && user.id !== request.prefectId && user.role !== "owner" && !user.isManager) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  await db.update(lessonRequestsTable).set({
    status: "dismissed",
    responseAt: user.id === request.teacherId ? new Date() : request.responseAt,
  }).where(eq(lessonRequestsTable.id, id));
  res.sendStatus(204);
});

export default router;
