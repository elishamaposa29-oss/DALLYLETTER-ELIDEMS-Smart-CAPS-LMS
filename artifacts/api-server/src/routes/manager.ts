import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, classesTable, lessonsTable, paymentsTable, ownerAlertsTable, assignmentsTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";

const router = Router();

function requireManager(req: any, res: any, next: any) {
  const user = req.user;
  if (!user || (user.role !== "owner" && !user.isManager)) {
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
