import { Router } from "express";
import { db, pool } from "@workspace/db";
import { usersTable, classesTable, lessonsTable, paymentsTable, ownerAlertsTable, assignmentsTable, assignmentSubmissionsTable, pollsTable, exercisesTable, auditLogsTable, attendanceTable, userAchievementsTable, achievementsTable, exerciseSubmissionsTable, pollSubmissionsTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
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
  const [teachers, students, classes, lessons, alerts, assignments, exercises, exerciseSubmissions, assignmentSubmissions, allClasses, learnerAwards] = await Promise.all([
    db.select({ id: usersTable.id, name: usersTable.name, subject: usersTable.subject, performanceScore: usersTable.performanceScore, isManager: usersTable.isManager, isBlocked: usersTable.isBlocked, isSuspended: usersTable.isSuspended })
      .from(usersTable).where(eq(usersTable.role, "teacher")),
    db.select({ id: usersTable.id, name: usersTable.name, grade: usersTable.grade, performanceScore: usersTable.performanceScore, badgeCount: usersTable.badgeCount })
      .from(usersTable).where(eq(usersTable.role, "student")),
    db.select().from(classesTable).orderBy(desc(classesTable.createdAt)),
    db.select().from(lessonsTable),
    db.select().from(ownerAlertsTable).where(eq(ownerAlertsTable.status, "open")).orderBy(desc(ownerAlertsTable.createdAt)).limit(100),
    db.select().from(assignmentsTable),
    db.select().from(exercisesTable),
    db.select().from(exerciseSubmissionsTable),
    db.select().from(assignmentSubmissionsTable),
    db.select().from(classesTable),
    db.select({ userId: userAchievementsTable.userId }).from(userAchievementsTable),
  ]);

  // Rank from observed work, marking, and learner engagement rather than the manually editable score.
  const [transferRows, reportRows, qualificationRows, enrollmentRows] = await Promise.all([
    pool.query("SELECT r.id,r.learner_id,u.name AS learner_name,r.reason,r.status,r.created_at FROM academic_transfer_requests r JOIN users u ON u.id=r.learner_id WHERE r.status='pending' ORDER BY r.created_at ASC LIMIT 100"),
    pool.query("SELECT d.id,d.learner_id,u.name AS learner_name,d.report_type,d.term_label,d.status,d.created_at FROM academic_report_drafts d JOIN users u ON u.id=d.learner_id WHERE d.status='pending_review' ORDER BY d.created_at ASC LIMIT 100"),
    String(req.currentUser!.role).toLowerCase() === "owner"
      ? pool.query("SELECT q.id,q.user_id,u.name AS teacher_name,q.title,q.institution,q.created_at FROM teacher_qualifications q JOIN users u ON u.id=q.user_id WHERE q.verification_status='pending' ORDER BY q.created_at ASC LIMIT 100")
      : Promise.resolve({ rows: [] as any[] }),
    pool.query("SELECT c.teacher_id, COUNT(DISTINCT e.learner_id)::int AS learners_joined FROM classes c LEFT JOIN enrollments e ON e.class_id=c.id GROUP BY c.teacher_id"),
  ]);

  const activeTeachers = teachers.filter((t: any) => !t.isManager && !t.isBlocked && !t.isSuspended);
  const teacherRanks = activeTeachers.map((teacher: any) => {
    const teacherLessons = lessons.filter((x: any) => x.teacherId === teacher.id);
    const teacherAssignments = assignments.filter((x: any) => x.teacherId === teacher.id);
    const teacherExercises = exercises.filter((x: any) => x.createdBy === teacher.id);
    const assignmentIds = new Set(teacherAssignments.map((x: any) => x.id));
    const exerciseIds = new Set(teacherExercises.map((x: any) => x.id));
    const markedAssignments = assignmentSubmissions.filter((s: any) => assignmentIds.has(s.assignmentId) && (s.gradedAt || s.gradedBy || s.marks !== null)).length;
    const markedExercises = exerciseSubmissions.filter((s: any) => exerciseIds.has(s.exerciseId) && (s.markedAt || s.returnedAt || ["marked","returned","graded"].includes(String(s.status).toLowerCase()))).length;
    const learnersJoined = Number(enrollmentRows.rows.find((r: any) => Number(r.teacher_id) === teacher.id)?.learners_joined || 0);
    const learnerSubmissions = assignmentSubmissions.filter((s: any) => assignmentIds.has(s.assignmentId)).length
      + exerciseSubmissions.filter((s: any) => exerciseIds.has(s.exerciseId)).length;
    const score = teacherLessons.length + teacherExercises.length * 2 + teacherAssignments.length * 2
      + (markedAssignments + markedExercises) * 3 + learnersJoined * 2 + learnerSubmissions;
    return { ...teacher, lessonsCount: teacherLessons.length, exercisesCount: teacherExercises.length,
      assignmentsCount: teacherAssignments.length, markedCount: markedAssignments + markedExercises,
      learnersJoined, learnerSubmissions, activityScore: score };
  }).sort((a: any, b: any) => b.activityScore - a.activityScore || b.learnersJoined - a.learnersJoined || a.name.localeCompare(b.name)).slice(0, 5);

  const reviewQueue = [
    ...transferRows.rows.map((r: any) => ({ id: "transfer-" + r.id, type: "transfer_request", title: "Transfer letter approval", description: r.reason, targetId: Number(r.id), learnerId: Number(r.learner_id), learnerName: r.learner_name, status: "pending", createdAt: r.created_at, href: "/manager/transfer-requests" })),
    ...reportRows.rows.map((r: any) => ({ id: "report-" + r.id, type: "academic_report", title: "Performance report review", description: r.report_type + " · " + r.term_label, targetId: Number(r.id), learnerId: Number(r.learner_id), learnerName: r.learner_name, status: "pending_review", createdAt: r.created_at, href: "/manager/reports/review" })),
    ...qualificationRows.rows.map((r: any) => ({ id: "qualification-" + r.id, type: "qualification_verification", title: "Teacher qualification verification", description: r.title + (r.institution ? " · " + r.institution : ""), targetId: Number(r.id), learnerName: r.teacher_name, status: "pending", createdAt: r.created_at, href: "/admin/users" })),
    ...alerts.map((a: any) => ({ id: "alert-" + a.id, type: "alert", title: a.title, description: a.description, targetId: a.id, learnerName: a.reporterName, status: a.status, severity: a.severity, createdAt: a.createdAt, href: "/manager/notifications" })),
  ].sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const totalMarkedAssignments = assignmentSubmissions.filter((s: any) => s.gradedAt || s.gradedBy || s.marks !== null).length;
  const totalMarkedExercises = exerciseSubmissions.filter((s: any) => s.markedAt || s.returnedAt || ["marked","returned","graded"].includes(String(s.status).toLowerCase())).length;
  res.json({
    stats: { teachers: activeTeachers.length, students: students.length, classes: allClasses.length, lessons: lessons.length },
    recentClasses: classes.slice(0, 10),
    recentLessons: lessons.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10),
    openAlerts: reviewQueue.slice(0, 12),
    reviewQueue,
    reviewCounts: { transferRequests: transferRows.rows.length, performanceReports: reportRows.rows.length, qualificationVerifications: qualificationRows.rows.length, alerts: alerts.length },
    recentAssignments: assignments.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10),
    topTeachers: teacherRanks,
    markingStats: { markedAssignments: totalMarkedAssignments, markedExercises: totalMarkedExercises },
    topLearners: students.map((student: any) => {
      const submissions = exerciseSubmissions.filter((s: any) => s.learnerId === student.id);
      const assignmentCount = assignmentSubmissions.filter((s: any) => s.studentId === student.id).length;
      const awards = learnerAwards.filter((a: any) => a.userId === student.id).length;
      return { id: student.id, name: student.name, grade: student.grade, performanceScore: student.performanceScore ?? 0, badgeCount: student.badgeCount ?? awards, exerciseSubmissions: submissions.length, assignmentSubmissions: assignmentCount, activityScore: submissions.length + assignmentCount + Number(student.performanceScore ?? 0) };
    }).sort((a: any,b: any) => b.activityScore-a.activityScore).slice(0,5),
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

router.get("/users/:id/activity", requireAuth, requireManager, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid user id" }); return; }
  const [target] = await db.select({
    id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role,
    isPrefect: usersTable.isPrefect, isManager: usersTable.isManager, grade: usersTable.grade, subject: usersTable.subject,
    performanceScore: usersTable.performanceScore, badgeCount: usersTable.badgeCount, streakDays: usersTable.streakDays,
  }).from(usersTable).where(eq(usersTable.id, id));
  if (!target || !["student", "teacher"].includes(target.role) || (target.role === "teacher" && target.isManager === true)) { res.status(404).json({ error: "User activity is not available" }); return; }

  const audit = await db.select({
    id: auditLogsTable.id, action: auditLogsTable.action, category: auditLogsTable.category,
    targetType: auditLogsTable.targetType, targetId: auditLogsTable.targetId, createdAt: auditLogsTable.createdAt,
  }).from(auditLogsTable).where(eq(auditLogsTable.performedBy, id)).orderBy(desc(auditLogsTable.createdAt)).limit(200);

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
