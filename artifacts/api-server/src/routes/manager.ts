import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, classesTable, lessonsTable, paymentsTable, ownerAlertsTable, assignmentsTable, pollsTable, exercisesTable, auditLogsTable, attendanceTable, userAchievementsTable, achievementsTable, exerciseSubmissionsTable, pollSubmissionsTable } from "@workspace/db/schema";
import { eq, desc, and, inArray } from "drizzle-orm";
import { requireAuth, canAccessManager } from "../lib/auth-middleware";

const router = Router();

function requireManager(req: any, res: any, next: any) {
  const user = req.currentUser;
  if (!user || !canAccessManager(user)) {
    return res.status(403).json({ error: "Manager access required" });
  }
  next();
}

router.get("/dashboard", requireAuth, requireManager, async (req, res) => {
  const [teachers, students, classes, lessons, alerts, assignments] = await Promise.all([
    db.select({ id: usersTable.id, name: usersTable.name, subject: usersTable.subject, performanceScore: usersTable.performanceScore })
      .from(usersTable).where(eq(usersTable.role, "teacher")),
    db.select({ id: usersTable.id, name: usersTable.name, grade: usersTable.grade })
      .from(usersTable).where(eq(usersTable.role, "student")),
    db.select().from(classesTable).orderBy(desc(classesTable.createdAt)).limit(10),
    db.select().from(lessonsTable).orderBy(desc(lessonsTable.createdAt)).limit(10),
    db.select().from(ownerAlertsTable).where(eq(ownerAlertsTable.status, "open")).orderBy(desc(ownerAlertsTable.createdAt)).limit(5),
    db.select().from(assignmentsTable).orderBy(desc(assignmentsTable.createdAt)).limit(5),
  ]);
  res.json({
    stats: { teachers: teachers.length, students: students.length, classes: classes.length, lessons: lessons.length },
    recentClasses: classes,
    recentLessons: lessons,
    openAlerts: alerts,
    recentAssignments: assignments,
    topTeachers: teachers.sort((a: any, b: any) => (b.performanceScore ?? 0) - (a.performanceScore ?? 0)).slice(0, 5),
  });
});

router.get("/teachers", requireAuth, requireManager, async (req, res) => {
  const teachers = await db.select({
    id: usersTable.id, name: usersTable.name, email: usersTable.email,
    subject: usersTable.subject, performanceScore: usersTable.performanceScore,
    badgeCount: usersTable.badgeCount, createdAt: usersTable.createdAt,
    teacherApplicationStatus: usersTable.teacherApplicationStatus, teacherReviewDeadline: usersTable.teacherReviewDeadline,
  }).from(usersTable).where(eq(usersTable.role, "teacher"));
  const lessonCounts = await db.select().from(lessonsTable);
  const classCounts = await db.select().from(classesTable);
  const result = teachers.map((t: any) => ({
    ...t,
    lessonsCount: lessonCounts.filter((l: any) => l.teacherId === t.id).length,
    classesCount: classCounts.filter((c: any) => c.teacherId === t.id).length,
  }));
  res.json(result);
});

router.get("/students", requireAuth, requireManager, async (req, res) => {
  const students = await db.select({
    id: usersTable.id, name: usersTable.name, email: usersTable.email,
    grade: usersTable.grade, isPrefect: usersTable.isPrefect,
    performanceScore: usersTable.performanceScore, badgeCount: usersTable.badgeCount,
    streakDays: usersTable.streakDays, isSuspended: usersTable.isSuspended,
    isBlocked: usersTable.isBlocked, lastActiveDate: usersTable.lastActiveDate,
  }).from(usersTable).where(eq(usersTable.role, "student"));
  res.json(students);
});

router.get("/prefects", requireAuth, requireManager, async (req, res) => {
  const prefects = await db.select().from(usersTable)
    .where(and(eq(usersTable.role, "student"), eq(usersTable.isPrefect, true)));
  res.json(prefects);
});

router.put("/teacher/:id/score", requireAuth, requireManager, async (req, res): Promise<void> => {
  const { performanceScore } = req.body;
  const [row] = await db.update(usersTable).set({ performanceScore })
    .where(eq(usersTable.id, parseInt(String(req.params.id)))).returning();
  res.json(row);
});

router.get("/users/:id/activity", requireAuth, requireManager, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid user id" }); return; }
  const [target] = await db.select({
    id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role,
    isPrefect: usersTable.isPrefect, isManager: usersTable.isManager, grade: usersTable.grade, subject: usersTable.subject,
    performanceScore: usersTable.performanceScore, badgeCount: usersTable.badgeCount, streakDays: usersTable.streakDays,
  }).from(usersTable).where(eq(usersTable.id, id));
  if (!target || !["student", "teacher"].includes(target.role) || (target.role === "teacher" && target.isManager === true)) { res.status(404).json({ error: "User activity is not available" }); return; }

  const managerVisibleCategories = ["academic", "attendance", "content", "activity", "staff", "moderation"] as const;
  const audit = await db.select({
    id: auditLogsTable.id, action: auditLogsTable.action, category: auditLogsTable.category,
    targetType: auditLogsTable.targetType, targetId: auditLogsTable.targetId, createdAt: auditLogsTable.createdAt,
  }).from(auditLogsTable)
    .where(and(eq(auditLogsTable.performedBy, id), inArray(auditLogsTable.category, managerVisibleCategories)))
    .orderBy(desc(auditLogsTable.createdAt)).limit(200);

  if (target.role === "teacher") {
    const [lessons, classes, assignments, polls, exercises] = await Promise.all([
      db.select().from(lessonsTable).where(eq(lessonsTable.teacherId, id)).orderBy(desc(lessonsTable.createdAt)),
      db.select().from(classesTable).where(eq(classesTable.teacherId, id)).orderBy(desc(classesTable.createdAt)),
      db.select().from(assignmentsTable).where(eq(assignmentsTable.teacherId, id)).orderBy(desc(assignmentsTable.createdAt)),
      db.select().from(pollsTable).where(eq(pollsTable.createdBy, id)).orderBy(desc(pollsTable.createdAt)),
      db.select().from(exercisesTable).where(eq(exercisesTable.createdBy, id)).orderBy(desc(exercisesTable.createdAt)),
    ]);
    res.json({ user: target, activities: audit, created: { lessons, classes, assignments, polls, exercises }, counts: { lessons: lessons.length, classes: classes.length, assignments: assignments.length, polls: polls.length, exercises: exercises.length } });
    return;
  }

  const [attendance, achievements, exerciseResults, pollResults, leaderboardUsers] = await Promise.all([
    db.select().from(attendanceTable).where(eq(attendanceTable.studentId, id)).orderBy(desc(attendanceTable.joinedAt)).limit(200),
    db.select({ id: userAchievementsTable.id, name: achievementsTable.name, icon: achievementsTable.icon, pointsValue: achievementsTable.pointsValue, note: userAchievementsTable.note, earnedAt: userAchievementsTable.earnedAt }).from(userAchievementsTable).innerJoin(achievementsTable, eq(userAchievementsTable.achievementId, achievementsTable.id)).where(eq(userAchievementsTable.userId, id)).orderBy(desc(userAchievementsTable.earnedAt)),
    db.select().from(exerciseSubmissionsTable).where(eq(exerciseSubmissionsTable.learnerId, id)).orderBy(desc(exerciseSubmissionsTable.submittedAt)).limit(200),
    db.select().from(pollSubmissionsTable).where(eq(pollSubmissionsTable.studentId, id)).orderBy(desc(pollSubmissionsTable.completedAt)).limit(200),
    db.select({ id: usersTable.id, performanceScore: usersTable.performanceScore }).from(usersTable).where(eq(usersTable.role, "student")).orderBy(desc(usersTable.performanceScore)),
  ]);
  const leaderboardPosition = leaderboardUsers.findIndex(row => row.id === id) + 1;
  res.json({ user: target, activities: audit, learning: { attendance, achievements, exerciseResults, pollResults, leaderboardPosition }, counts: { attendance: attendance.length, achievements: achievements.length, exerciseResults: exerciseResults.length, pollResults: pollResults.length } });
});

router.get("/reports/overview", requireAuth, requireManager, async (req, res) => {
  const [teachers, students, managers, payments, lessons, classes] = await Promise.all([
    db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "teacher")),
    db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "student")),
    db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.isManager, true)),
    db.select().from(paymentsTable),
    db.select({ id: lessonsTable.id }).from(lessonsTable),
    db.select({ id: classesTable.id }).from(classesTable),
  ]);
  const totalRevenue = payments.reduce((s: number, p: any) => s + parseFloat(p.amount ?? "0"), 0);
  res.json({
    teacherCount: teachers.length,
    studentCount: students.length,
    managerCount: managers.length,
    totalRevenue,
    lessonCount: lessons.length,
    classCount: classes.length,
    paidPayments: payments.filter((p: any) => p.status === "paid").length,
    pendingPayments: payments.filter((p: any) => p.status === "pending").length,
  });
});

export default router;
