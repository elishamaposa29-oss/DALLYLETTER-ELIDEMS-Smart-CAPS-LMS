import { Router } from "express";
import { db, pool } from "@workspace/db";
import { usersTable, classesTable, lessonsTable, paymentsTable, ownerAlertsTable, assignmentsTable, assignmentSubmissionsTable, pollsTable, exercisesTable, auditLogsTable, attendanceTable, userAchievementsTable, achievementsTable, exerciseSubmissionsTable, pollSubmissionsTable, contentFlagsTable } from "@workspace/db/schema";
import { eq, desc, and, inArray } from "drizzle-orm";
import { requireAuth, canAccessManager, isOwnerRole } from "../lib/auth-middleware";

const router = Router();
const managerVisibleAlertCategories = ["academic", "attendance", "content", "student", "teacher", "moderation", "general"];

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
    isOwnerRole(req.currentUser!.role) ? db.select().from(ownerAlertsTable).where(eq(ownerAlertsTable.status, "open")).orderBy(desc(ownerAlertsTable.createdAt)).limit(100) : db.select().from(ownerAlertsTable).where(and(eq(ownerAlertsTable.status, "open"), inArray(ownerAlertsTable.category, managerVisibleAlertCategories))).orderBy(desc(ownerAlertsTable.createdAt)).limit(100),
    db.select().from(assignmentsTable),
    db.select().from(exercisesTable),
    db.select().from(exerciseSubmissionsTable),
    db.select().from(assignmentSubmissionsTable),
    db.select().from(classesTable),
    db.select({ userId: userAchievementsTable.userId }).from(userAchievementsTable),
  ]);

  // Rank from observed work, marking, and learner engagement rather than the manually editable score.
  const [transferRows, reportRows, qualificationRows, enrollmentRows, contentFlags, teacherApplications] = await Promise.all([
    pool.query("SELECT r.id,r.learner_id,u.name AS learner_name,r.reason,r.status,r.created_at FROM academic_transfer_requests r JOIN users u ON u.id=r.learner_id WHERE r.status='pending' ORDER BY r.created_at ASC LIMIT 100"),
    pool.query("SELECT d.id,d.learner_id,u.name AS learner_name,d.report_type,d.term_label,d.status,d.created_at FROM academic_report_drafts d JOIN users u ON u.id=d.learner_id WHERE d.status='pending_review' ORDER BY d.created_at ASC LIMIT 100"),
    isOwnerRole(req.currentUser!.role)
      ? pool.query("SELECT q.id,q.user_id,u.name AS teacher_name,q.title,q.institution,q.created_at FROM teacher_qualifications q JOIN users u ON u.id=q.user_id WHERE q.verification_status='pending' ORDER BY q.created_at ASC LIMIT 100")
      : Promise.resolve({ rows: [] as any[] }),
    pool.query("SELECT c.teacher_id, COUNT(DISTINCT e.learner_id)::int AS learners_joined FROM classes c LEFT JOIN enrollments e ON e.class_id=c.id GROUP BY c.teacher_id"),
    db.select().from(contentFlagsTable).where(eq(contentFlagsTable.status, "pending")).orderBy(desc(contentFlagsTable.createdAt)).limit(100),
    isOwnerRole(req.currentUser!.role) ? pool.query("SELECT id,name,email,created_at,teacher_review_deadline FROM users WHERE role=$1 AND teacher_application_status=$2 ORDER BY created_at ASC LIMIT 100", ["teacher", "pending_review"]) : Promise.resolve({ rows: [] as any[] }),
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
    ...contentFlags.map((r: any) => ({ id: "content-flag-" + r.id, type: "content_moderation", title: "Content moderation review", description: r.reason, targetId: r.id, learnerName: r.contentType + " #" + r.contentId, status: r.status, severity: r.severity, createdAt: r.createdAt, href: "/manager/safety" })),
    ...teacherApplications.rows.map((r: any) => ({ id: "teacher-application-" + r.id, type: "teacher_application", title: "Teacher application review", description: r.email || "Teacher applicant", targetId: Number(r.id), learnerName: r.name, status: "pending_review", createdAt: r.created_at, href: "/admin/users" })),
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
    reviewCounts: { transferRequests: transferRows.rows.length, performanceReports: reportRows.rows.length, qualificationVerifications: qualificationRows.rows.length, contentFlags: contentFlags.length, teacherApplications: teacherApplications.rows.length, alerts: alerts.length },
    recentAssignments: assignments.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10),
    topTeachers: teacherRanks,
    markingStats: { markedAssignments: totalMarkedAssignments, markedExercises: totalMarkedExercises },
    topLearners: students.map((student: any) => {
      const submissions = exerciseSubmissions.filter((s: any) => s.learnerId === student.id);
      const learnerAssignmentSubmissions = assignmentSubmissions.filter((s: any) => s.studentId === student.id);
      const awards = learnerAwards.filter((a: any) => a.userId === student.id).length;
      const percentages = [
        ...submissions.map((s: any) => s.percentage == null ? null : Number(s.percentage)),
        ...learnerAssignmentSubmissions.map((s: any) => {
          if (s.marks == null) return null;
          const assignment = assignments.find((a: any) => a.id === s.assignmentId);
          return assignment?.totalMarks ? Number(s.marks) / Number(assignment.totalMarks) * 100 : null;
        }),
      ].filter((value: number | null): value is number => value !== null && Number.isFinite(value));
      const averageMarkPercentage = percentages.length ? Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length) : null;
      const assignmentCount = learnerAssignmentSubmissions.length;
      const activityScore = submissions.length + assignmentCount + awards * 2 + Number(student.performanceScore ?? 0) + (averageMarkPercentage ?? 0);
      return { id: student.id, name: student.name, grade: student.grade, performanceScore: student.performanceScore ?? 0, badgeCount: awards, exerciseSubmissions: submissions.length, assignmentSubmissions: assignmentCount, averageMarkPercentage, activityScore };
    }).sort((a: any,b: any) => b.activityScore-a.activityScore).slice(0,5),
  });
});

router.get("/teachers", requireAuth, requireManager, async (req, res) => {
  const [teachers, lessonCounts, classCounts, assignments, exercises, assignmentSubmissions, exerciseSubmissions, enrollments, alerts] = await Promise.all([
    db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, subject: usersTable.subject, performanceScore: usersTable.performanceScore, badgeCount: usersTable.badgeCount, createdAt: usersTable.createdAt, isManager: usersTable.isManager, isBlocked: usersTable.isBlocked, isSuspended: usersTable.isSuspended }).from(usersTable).where(eq(usersTable.role, "teacher")),
    db.select().from(lessonsTable),
    db.select().from(classesTable),
    db.select().from(assignmentsTable),
    db.select().from(exercisesTable),
    db.select().from(assignmentSubmissionsTable),
    db.select().from(exerciseSubmissionsTable),
    pool.query("SELECT c.teacher_id, COUNT(DISTINCT e.learner_id)::int AS learners_joined FROM classes c LEFT JOIN enrollments e ON e.class_id=c.id GROUP BY c.teacher_id"),
    isOwnerRole(req.currentUser!.role) ? db.select().from(ownerAlertsTable).where(eq(ownerAlertsTable.status, "open")) : db.select().from(ownerAlertsTable).where(and(eq(ownerAlertsTable.status, "open"), inArray(ownerAlertsTable.category, managerVisibleAlertCategories))),
  ]);
  const ranked = teachers.filter((t: any) => !t.isManager && !t.isBlocked && !t.isSuspended).map((teacher: any) => {
    const teacherLessons = lessonCounts.filter((l: any) => l.teacherId === teacher.id);
    const teacherAssignments = assignments.filter((a: any) => a.teacherId === teacher.id);
    const teacherExercises = exercises.filter((e: any) => e.createdBy === teacher.id);
    const assignmentIds = new Set(teacherAssignments.map((a: any) => a.id));
    const exerciseIds = new Set(teacherExercises.map((e: any) => e.id));
    const teacherAssignmentSubmissions = assignmentSubmissions.filter((s: any) => assignmentIds.has(s.assignmentId));
    const teacherExerciseSubmissions = exerciseSubmissions.filter((s: any) => exerciseIds.has(s.exerciseId));
    const markedAssignments = teacherAssignmentSubmissions.filter((s: any) => s.gradedAt || s.gradedBy || s.marks !== null).length;
    const markedExercises = teacherExerciseSubmissions.filter((s: any) => s.markedAt || s.returnedAt || ["marked","returned","graded"].includes(String(s.status).toLowerCase())).length;
    const learnersJoined = Number(enrollments.rows.find((r: any) => Number(r.teacher_id) === teacher.id)?.learners_joined || 0);
    const activityScore = teacherLessons.length + teacherExercises.length * 2 + teacherAssignments.length * 2
      + (markedAssignments + markedExercises) * 3 + learnersJoined * 2 + teacherAssignmentSubmissions.length + teacherExerciseSubmissions.length;
    return { ...teacher, lessonsCount: teacherLessons.length, classesCount: classCounts.filter((cl: any) => cl.teacherId === teacher.id).length,
      exercisesCount: teacherExercises.length, assignmentsCount: teacherAssignments.length, markedCount: markedAssignments + markedExercises,
      learnersJoined, learnerSubmissions: teacherAssignmentSubmissions.length + teacherExerciseSubmissions.length, activityScore,
      alerts: alerts.filter((alert: any) => alert.reportedBy === teacher.id || (Number(alert.targetId) === teacher.id && ["teacher","user"].includes(String(alert.targetType || "").toLowerCase()))),
      alertsCount: alerts.filter((alert: any) => alert.reportedBy === teacher.id || (Number(alert.targetId) === teacher.id && ["teacher","user"].includes(String(alert.targetType || "").toLowerCase()))).length };
  }).sort((a: any,b: any)=>b.activityScore-a.activityScore||b.learnersJoined-a.learnersJoined||a.name.localeCompare(b.name));
  res.json(ranked);
});

router.get("/students", requireAuth, requireManager, async (req, res) => {
  const students = await db.select({
    id: usersTable.id, name: usersTable.name, email: usersTable.email,
    grade: usersTable.grade, isPrefect: usersTable.isPrefect,
    performanceScore: usersTable.performanceScore, badgeCount: usersTable.badgeCount,
    streakDays: usersTable.streakDays, isSuspended: usersTable.isSuspended,
    isBlocked: usersTable.isBlocked, lastActiveDate: usersTable.lastActiveDate,
  }).from(usersTable).where(eq(usersTable.role, "student"));
  const [awards, alerts, exercises, assignments, transfers, reports] = await Promise.all([
    db.select({ userId: userAchievementsTable.userId }).from(userAchievementsTable),
    isOwnerRole(req.currentUser!.role) ? db.select().from(ownerAlertsTable).where(eq(ownerAlertsTable.status, "open")) : db.select().from(ownerAlertsTable).where(and(eq(ownerAlertsTable.status, "open"), inArray(ownerAlertsTable.category, managerVisibleAlertCategories))),
    db.select().from(exerciseSubmissionsTable),
    db.select().from(assignmentSubmissionsTable),
    pool.query("SELECT learner_id, COUNT(*)::int AS count FROM academic_transfer_requests WHERE status='pending' GROUP BY learner_id"),
    pool.query("SELECT learner_id, COUNT(*)::int AS count FROM academic_report_drafts WHERE status='pending_review' GROUP BY learner_id"),
  ]);
  res.json(students.map((student: any) => {
    const learnerAlerts = alerts.filter((alert: any) => alert.reportedBy === student.id || (Number(alert.targetId) === student.id && ["student","learner","user"].includes(String(alert.targetType || "").toLowerCase())));
    return { ...student, awardsCount: awards.filter((award: any) => award.userId === student.id).length,
      alerts: learnerAlerts, alertsCount: learnerAlerts.length,
      exerciseSubmissions: exercises.filter((submission: any) => submission.learnerId === student.id).length,
      assignmentSubmissions: assignments.filter((submission: any) => submission.studentId === student.id).length,
      pendingTransferRequests: Number(transfers.rows.find((row: any) => Number(row.learner_id) === student.id)?.count || 0),
      pendingReportReviews: Number(reports.rows.find((row: any) => Number(row.learner_id) === student.id)?.count || 0) };
  }));
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
  const [users, payments, lessons, classes, assignments, exercises, assignmentSubmissions, exerciseSubmissions, awards, attendance, alerts, pendingFlags] = await Promise.all([
    db.select({ id: usersTable.id, role: usersTable.role, isManager: usersTable.isManager, isPrefect: usersTable.isPrefect }).from(usersTable),
    db.select().from(paymentsTable),
    db.select({ id: lessonsTable.id }).from(lessonsTable),
    db.select({ id: classesTable.id }).from(classesTable),
    db.select({ id: assignmentsTable.id }).from(assignmentsTable),
    db.select({ id: exercisesTable.id }).from(exercisesTable),
    db.select().from(assignmentSubmissionsTable),
    db.select().from(exerciseSubmissionsTable),
    db.select({ id: userAchievementsTable.id }).from(userAchievementsTable),
    db.select({ id: attendanceTable.id, status: attendanceTable.status }).from(attendanceTable),
    isOwnerRole(req.currentUser!.role) ? db.select({ id: ownerAlertsTable.id }).from(ownerAlertsTable).where(eq(ownerAlertsTable.status, "open")) : db.select({ id: ownerAlertsTable.id }).from(ownerAlertsTable).where(and(eq(ownerAlertsTable.status, "open"), inArray(ownerAlertsTable.category, managerVisibleAlertCategories))),
    db.select({ id: contentFlagsTable.id }).from(contentFlagsTable).where(eq(contentFlagsTable.status, "pending")),
  ]);
  const countRole = (roles: string[]) => users.filter((u: any) => roles.includes(String(u.role).toLowerCase())).length;
  const totalRevenue = payments.reduce((sum: number, payment: any) => sum + (payment.status === "paid" ? parseFloat(payment.amount ?? "0") : 0), 0);
  const [transferQueue, reportQueue] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS count FROM academic_transfer_requests WHERE status='pending'"),
    pool.query("SELECT COUNT(*)::int AS count FROM academic_report_drafts WHERE status='pending_review'"),
  ]);
  res.json({
    teacherCount: countRole(["teacher"]),
    studentCount: countRole(["student","learner","prefect"]),
    learnerCount: countRole(["student","learner","prefect"]),
    prefectCount: users.filter((u: any) => u.isPrefect === true).length,
    managerCount: users.filter((u: any) => u.isManager === true || ["manager","senior_manager"].includes(String(u.role).toLowerCase())).length,
    ownerCount: countRole(["owner","admin","platform_owner"]),
    totalUsers: users.length,
    totalRevenue,
    lessonCount: lessons.length,
    classCount: classes.length,
    assignmentCount: assignments.length,
    exerciseCount: exercises.length,
    assignmentSubmissionCount: assignmentSubmissions.length,
    exerciseSubmissionCount: exerciseSubmissions.length,
    markedAssignmentCount: assignmentSubmissions.filter((s: any) => s.gradedAt || s.gradedBy || s.marks !== null).length,
    markedExerciseCount: exerciseSubmissions.filter((s: any) => s.markedAt || s.returnedAt || ["marked","returned","graded"].includes(String(s.status).toLowerCase())).length,
    awardCount: awards.length,
    attendanceRecordCount: attendance.length,
    presentAttendanceCount: attendance.filter((a: any) => String(a.status).toLowerCase() === "present").length,
    openAlertCount: alerts.length,
    pendingContentModerationCount: pendingFlags.length,
    pendingTransferCount: Number(transferQueue.rows[0]?.count ?? 0),
    pendingReportReviewCount: Number(reportQueue.rows[0]?.count ?? 0),
    paidPayments: payments.filter((p: any) => p.status === "paid").length,
    pendingPayments: payments.filter((p: any) => p.status === "pending").length,
  });
});

export default router;
