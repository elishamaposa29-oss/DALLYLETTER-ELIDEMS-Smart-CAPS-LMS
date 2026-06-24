import { Router } from "express";
import { db } from "@workspace/db";
import { achievementsTable, userAchievementsTable, usersTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";

const router = Router();

router.get("/", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(achievementsTable).where(eq(achievementsTable.isActive, true));
  res.json(rows);
});

router.get("/my", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
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
  const user = (req as any).user;
  if (user.role !== "owner") { res.status(403).json({ error: "Forbidden" }); return; }
  const { name, description, icon, category, pointsValue, criteria } = req.body;
  if (!name || !description) { res.status(400).json({ error: "name and description required" }); return; }
  const [row] = await db.insert(achievementsTable).values({
    name, description, icon: icon ?? "🏆", category: category ?? "learning", pointsValue: pointsValue ?? 10, criteria,
  }).returning();
  res.status(201).json(row);
});

router.post("/award", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  if (user.role !== "owner" && !(user as any).isManager) { res.status(403).json({ error: "Forbidden" }); return; }
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

router.get("/prefect-leaderboard", requireAuth, async (_req, res): Promise<void> => {
  const prefects = await db.select({
    id: usersTable.id, name: usersTable.name, grade: usersTable.grade,
    performanceScore: usersTable.performanceScore, badgeCount: usersTable.badgeCount,
    streakDays: usersTable.streakDays,
  }).from(usersTable).where(and(eq(usersTable.isPrefect, true), eq(usersTable.role, "student")));
  prefects.sort((a: any, b: any) => (b.performanceScore ?? 0) - (a.performanceScore ?? 0));
  res.json(prefects);
});

export default router;
