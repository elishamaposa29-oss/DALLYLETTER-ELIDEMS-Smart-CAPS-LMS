// Dashboard routes — analytics, stats, and activity feed
import { Router, type IRouter } from "express";
import { eq, count, sum, sql } from "drizzle-orm";
import { db, usersTable, lessonsTable, classesTable, studyGroupsTable, paymentsTable, messagesTable, activityLogTable } from "@workspace/db";
import { canManageAcademicContent, requireAuth, requireOwner } from "../lib/auth-middleware";

const router: IRouter = Router();
router.use(requireAuth);

// GET /dashboard/stats — Safe platform statistics for authenticated dashboards.
// Financial/payment totals remain owner-only; academic dashboards must not 403
// simply because they also use this shared stats endpoint.
router.get("/dashboard/stats", async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const [studentCount] = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.role, "student"));
  const [teacherCount] = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.role, "teacher"));
  const [lessonCount] = await db.select({ count: count() }).from(lessonsTable);
  const [classCount] = await db.select({ count: count() }).from(classesTable);
  const [groupCount] = await db.select({ count: count() }).from(studyGroupsTable);
  const [recentMsgCount] = await db.select({ count: count() }).from(messagesTable);

  const baseStats = {
    totalStudents: studentCount.count,
    totalTeachers: teacherCount.count,
    totalLessons: lessonCount.count,
    totalClasses: classCount.count,
    activeStudyGroups: groupCount.count,
    recentMessages: recentMsgCount.count,
  };

  if (!canManageAcademicContent(user) && user.role !== "student") {
    res.json(baseStats);
    return;
  }

  if (user.role === "student") {
    res.json(baseStats);
    return;
  }

  const currentMonth = new Date().toLocaleString("default", { month: "long" });
  const [paidThisMonth] = await db.select({ count: count() }).from(paymentsTable)
    .where(sql`${paymentsTable.status} = 'paid' AND ${paymentsTable.month} = ${currentMonth}`);
  const [overdueCount] = await db.select({ count: count() }).from(paymentsTable).where(eq(paymentsTable.status, "overdue"));
  const [pendingCount] = await db.select({ count: count() }).from(paymentsTable).where(eq(paymentsTable.status, "pending"));
  const [revenueRow] = await db.select({ total: sum(paymentsTable.amount) }).from(paymentsTable).where(eq(paymentsTable.status, "paid"));

  res.json({
    ...baseStats,
    paidThisMonth: paidThisMonth.count,
    overduePayments: overdueCount.count,
    pendingPayments: pendingCount.count,
    totalRevenue: Number(revenueRow?.total ?? 0),
  });
});

// GET /dashboard/activity — academic staff activity feed.
router.get("/dashboard/activity", async (req, res): Promise<void> => {
  if (!canManageAcademicContent(req.currentUser!)) {
    res.status(403).json({ error: "Academic staff access required" });
    return;
  }

  const activities = await db.select().from(activityLogTable)
    .orderBy(sql`${activityLogTable.createdAt} DESC`)
    .limit(20);

  res.json(activities.map(a => ({ ...a, createdAt: a.createdAt.toISOString() })));
});

// GET /dashboard/payment-summary — owner/admin-only payment breakdown.
router.get("/dashboard/payment-summary", requireOwner, async (_req, res): Promise<void> => {
  const [paidRow] = await db.select({ count: count(), total: sum(paymentsTable.amount) })
    .from(paymentsTable).where(eq(paymentsTable.status, "paid"));
  const [overdueRow] = await db.select({ count: count() })
    .from(paymentsTable).where(eq(paymentsTable.status, "overdue"));
  const [pendingRow] = await db.select({ count: count() })
    .from(paymentsTable).where(eq(paymentsTable.status, "pending"));

  const overduePayments = await db.select({ studentId: paymentsTable.studentId })
    .from(paymentsTable)
    .where(eq(paymentsTable.status, "overdue"));

  const overdueStudentIds = [...new Set(overduePayments.map(p => p.studentId))];

  const overdueStudents = overdueStudentIds.length > 0
    ? await Promise.all(overdueStudentIds.map(async (id) => {
        const [u] = await db.select({
          id: usersTable.id,
          email: usersTable.email,
          name: usersTable.name,
          role: usersTable.role,
          isPrefect: usersTable.isPrefect,
          isBlocked: usersTable.isBlocked,
          phone: usersTable.phone,
          grade: usersTable.grade,
          subject: usersTable.subject,
          avatarUrl: usersTable.avatarUrl,
          lastPaymentDate: usersTable.lastPaymentDate,
          createdAt: usersTable.createdAt,
        }).from(usersTable).where(eq(usersTable.id, id));
        return u ? { ...u, createdAt: u.createdAt.toISOString() } : null;
      }))
    : [];

  res.json({
    totalRevenue: Number(paidRow?.total ?? 0),
    paidCount: paidRow.count,
    overdueCount: overdueRow.count,
    pendingCount: pendingRow.count,
    overdueStudents: overdueStudents.filter(Boolean),
  });
});

export default router;
