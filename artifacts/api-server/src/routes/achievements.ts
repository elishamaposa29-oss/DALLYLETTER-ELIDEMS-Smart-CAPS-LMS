import { Router } from "express";
import { db, pool, auditLogsTable } from "@workspace/db";
import { achievementsTable, userAchievementsTable, usersTable, lessonRequestsTable, notificationsTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth, isOwnerRole, canAccessManager } from "../lib/auth-middleware";

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
    id: usersTable.id, name: usersTable.name, role: usersTable.role, avatarUrl: usersTable.avatarUrl,
    grade: usersTable.grade, performanceScore: usersTable.performanceScore,
    badgeCount: usersTable.badgeCount, streakDays: usersTable.streakDays,
    isPrefect: usersTable.isPrefect,
  }).from(usersTable).where(eq(usersTable.role, "student"));
  users.sort((a: any, b: any) => (b.performanceScore ?? 0) - (a.performanceScore ?? 0));
  res.json(users.slice(0, 20));
});

router.get("/user/:userId", requireAuth, async (req, res): Promise<void> => {
  const userId = Number(req.params.userId);
  if (!Number.isSafeInteger(userId) || userId <= 0) { res.status(400).json({ error: "Invalid user id." }); return; }
  const rows = await db.select().from(userAchievementsTable)
    .where(eq(userAchievementsTable.userId, userId))
    .orderBy(desc(userAchievementsTable.earnedAt));
  const achievements = await db.select().from(achievementsTable);
  const isOwn = req.currentUser!.id === userId;
  const result = rows.map((ua: any) => {
    const achievement = achievements.find((a: any) => a.id === ua.achievementId);
    if (isOwn) return { ...ua, achievement };
    return {
      id: ua.id,
      earnedAt: ua.earnedAt,
      achievementId: ua.achievementId,
      achievement: achievement ? {
        id: achievement.id, name: achievement.name, description: achievement.description,
        icon: achievement.icon, pointsValue: achievement.pointsValue, category: achievement.category,
      } : null,
    };
  });
  res.json(result);
});

router.post("/", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!isOwnerRole(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const { name, description, icon, category, pointsValue, criteria } = req.body;
  if (!name || !description) { res.status(400).json({ error: "name and description required" }); return; }
  const [row] = await db.insert(achievementsTable).values({
    name, description, icon: icon ?? "🏆", category: category ?? "learning", pointsValue: pointsValue ?? 10, criteria,
  }).returning();
  res.status(201).json(row);
});

function isJuniorAwardRecommender(user: { role: string; isManager: boolean }): boolean {
  const role = String(user.role || "").toLowerCase().replace(/[\s-]+/g, "_");
  return role === "manager" || (role === "teacher" && user.isManager === true);
}

function isSeniorAwardApprover(user: { role: string }): boolean {
  const role = String(user.role || "").toLowerCase().replace(/[\s-]+/g, "_");
  return isOwnerRole(role) || role === "senior_manager";
}

// Junior managers submit recommendations. They cannot directly award or approve them.
router.post("/award/recommendations", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!isJuniorAwardRecommender(user)) { res.status(403).json({ error: "Junior manager recommendation access required." }); return; }
  const learnerId = Number(req.body?.userId);
  const achievementId = Number(req.body?.achievementId);
  const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 2000) : "";
  if (!Number.isSafeInteger(learnerId) || learnerId < 1 || !Number.isSafeInteger(achievementId) || achievementId < 1) {
    res.status(400).json({ error: "A valid learner and achievement are required." }); return;
  }
  const learner = await pool.query("SELECT id FROM users WHERE id=$1 AND role IN ('student','learner') AND COALESCE(is_blocked,false)=false", [learnerId]);
  if (!learner.rowCount) { res.status(404).json({ error: "Learner not found." }); return; }
  const achievement = await pool.query("SELECT id FROM achievements WHERE id=$1 AND is_active=true", [achievementId]);
  if (!achievement.rowCount) { res.status(404).json({ error: "Active achievement not found." }); return; }
  try {
    const result = await pool.query(
      "INSERT INTO achievement_award_recommendations (learner_id,achievement_id,recommended_by,recommendation_note) VALUES ($1,$2,$3,$4) RETURNING *",
      [learnerId, achievementId, user.id, note || null],
    );
    await db.insert(auditLogsTable).values({ performedBy: user.id, action: "achievement.award_recommended", category: "academic", targetType: "achievement_award_recommendation", targetId: Number(result.rows[0].id), details: JSON.stringify({ learnerId, achievementId }) });
    const reviewers = await pool.query("SELECT id FROM users WHERE (role IN ('senior_manager','owner','admin','platform_owner')) AND COALESCE(is_blocked,false)=false");
    for (const reviewer of reviewers.rows) {
      await db.insert(notificationsTable).values({ title: "Achievement award recommendation", message: user.name + " recommended an achievement for learner account #" + learnerId + ". Senior review is required.", type: "achievement_award_review", recipientId: Number(reviewer.id), isRead: false });
    }
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    if (error?.code === "23505") { res.status(409).json({ error: "A pending recommendation already exists for this learner and achievement." }); return; }
    throw error;
  }
});

router.get("/award/recommendations", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!canAccessManager(user)) { res.status(403).json({ error: "Manager access required." }); return; }
  const senior = isSeniorAwardApprover(user);
  const result = await pool.query(
    "SELECT r.*,u.name AS learner_name,a.name AS achievement_name,a.icon AS achievement_icon,a.points_value,m.name AS recommender_name,reviewer.name AS reviewer_name FROM achievement_award_recommendations r JOIN users u ON u.id=r.learner_id JOIN achievements a ON a.id=r.achievement_id JOIN users m ON m.id=r.recommended_by LEFT JOIN users reviewer ON reviewer.id=r.reviewed_by WHERE ($1::boolean=true OR r.recommended_by=$2) ORDER BY CASE WHEN r.status='pending_senior_review' THEN 0 ELSE 1 END,r.created_at DESC LIMIT 200",
    [senior, user.id],
  );
  res.json({ items: result.rows, canApprove: senior, canDirectAward: isOwnerRole(user.role), canRecommend: isJuniorAwardRecommender(user) });
});

router.post("/award/recommendations/:id/review", requireAuth, async (req, res): Promise<void> => {
  const reviewer = req.currentUser!;
  if (!isSeniorAwardApprover(reviewer)) { res.status(403).json({ error: "Senior manager or owner approval is required." }); return; }
  const id = Number(req.params.id);
  const decision = req.body?.status;
  const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 2000) : "";
  if (!Number.isSafeInteger(id) || id < 1 || !["approved", "rejected"].includes(decision)) {
    res.status(400).json({ error: "A valid recommendation ID and approved/rejected decision are required." }); return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query("SELECT * FROM achievement_award_recommendations WHERE id=$1 FOR UPDATE", [id]);
    const recommendation = found.rows[0];
    if (!recommendation || recommendation.status !== "pending_senior_review") {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Pending award recommendation not found or already reviewed." }); return;
    }
    if (Number(recommendation.recommended_by) === Number(reviewer.id)) {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "A recommender cannot approve their own recommendation." }); return;
    }
    let award: any = null;
    if (decision === "approved") {
      const existing = await client.query("SELECT id FROM user_achievements WHERE user_id=$1 AND achievement_id=$2 FOR UPDATE", [recommendation.learner_id, recommendation.achievement_id]);
      if (existing.rowCount) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "This achievement has already been awarded to the learner." }); return;
      }
      const achievement = await client.query("SELECT points_value FROM achievements WHERE id=$1 AND is_active=true", [recommendation.achievement_id]);
      if (!achievement.rowCount) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "The recommended achievement is no longer active." }); return;
      }
      const inserted = await client.query(
        "INSERT INTO user_achievements (user_id,achievement_id,awarded_by,awarded_by_name,note) VALUES ($1,$2,$3,$4,$5) RETURNING *",
        [recommendation.learner_id, recommendation.achievement_id, reviewer.id, reviewer.name, recommendation.recommendation_note || note || null],
      );
      award = inserted.rows[0];
      await client.query("UPDATE users SET badge_count=COALESCE(badge_count,0)+1, performance_score=COALESCE(performance_score,0)+$2 WHERE id=$1", [recommendation.learner_id, Number(achievement.rows[0].points_value ?? 10)]);
    }
    const updated = await client.query(
      "UPDATE achievement_award_recommendations SET status=$1,reviewed_by=$2,review_note=$3,reviewed_at=now(),awarded_at=CASE WHEN $1='approved' THEN now() ELSE NULL END,updated_at=now() WHERE id=$4 RETURNING *",
      [decision, reviewer.id, note || null, id],
    );
    await client.query("COMMIT");
    await db.insert(auditLogsTable).values({ performedBy: reviewer.id, action: "achievement.award_recommendation_" + decision, category: "academic", targetType: "achievement_award_recommendation", targetId: id, details: JSON.stringify({ learnerId: recommendation.learner_id, achievementId: recommendation.achievement_id }) });
    await db.insert(notificationsTable).values({ title: decision === "approved" ? "Achievement awarded" : "Achievement recommendation declined", message: decision === "approved" ? "A senior reviewer approved your achievement recommendation." : "Your achievement recommendation was declined." + (note ? " Reviewer note: " + note : ""), type: "achievement_award_decision", recipientId: Number(recommendation.learner_id), isRead: false });
    res.json({ recommendation: updated.rows[0], award });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
});

// Legacy direct-award route remains for owner-class emergency administration only.
// Junior managers must use recommendation -> independent senior approval.
router.post("/award", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!isOwnerRole(user.role)) { res.status(403).json({ error: "Use the junior recommendation and senior approval workflow." }); return; }
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
      ? await db.select().from(lessonRequestsTable).where(eq(lessonRequestsTable.teacherId, user.id)).orderBy(desc(lessonRequestsTable.createdAt))
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
    id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl, grade: usersTable.grade,
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
  await db.delete(lessonRequestsTable).where(eq(lessonRequestsTable.id, id));
  res.sendStatus(204);
});

export default router;
