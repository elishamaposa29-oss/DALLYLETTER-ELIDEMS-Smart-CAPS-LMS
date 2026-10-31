import { Router } from "express";
import { db, auditLogsTable, usersTable, pool } from "@workspace/db";
import { eq, desc, inArray, and } from "drizzle-orm";
import { getAIProvider } from "../lib/ai-provider";
import { requireAuth, canAccessManager } from "../lib/auth-middleware";
import { hasManagerPermission } from "../lib/manager-permissions";
import { createTransferLetterPdf } from "../lib/transfer-letter-pdf";

const router = Router();

// GET /audit-logs — list audit logs (owner only)
router.get("/audit-logs", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!canAccessManager(user)) { res.status(403).json({ error: "Manager or owner access required" }); return; }
  const isOwner = user.role === "owner";
  const limit = Math.min(parseInt(String(req.query.limit ?? "200")), 500);
  const base = db.select({
    id: auditLogsTable.id,
    action: auditLogsTable.action,
    category: auditLogsTable.category,
    targetType: auditLogsTable.targetType,
    targetId: auditLogsTable.targetId,
    details: auditLogsTable.details,
    createdAt: auditLogsTable.createdAt,
    performerName: usersTable.name,
    performerRole: usersTable.role,
    performerId: usersTable.id,
    performerIsPrefect: usersTable.isPrefect,
  }).from(auditLogsTable).leftJoin(usersTable, eq(auditLogsTable.performedBy, usersTable.id));
  // Managers may monitor academic/user activity only. Never expose operational,
  // owner/admin, payment, app/system, auth, security, or data-management logs.
  const managerVisibleCategories = [
    "academic", "attendance", "content", "activity", "staff", "moderation",
  ];
  const logs = isOwner
    ? await base.orderBy(desc(auditLogsTable.createdAt)).limit(limit)
    : await base.where(and(
        inArray(usersTable.role, ["student", "teacher"]),
        eq(usersTable.isManager, false),
        eq(usersTable.isBlocked, false),
        inArray(auditLogsTable.category, managerVisibleCategories),
      )).orderBy(desc(auditLogsTable.createdAt)).limit(limit);
  res.json(logs.map(({ details, performerIsPrefect, ...log }) => ({
    ...log,
    // Never expose raw audit details to managers: details can contain sensitive operational data.
    details: isOwner ? details : null,
    performerIsPrefect,
  })));
});

// POST /audit-logs — create manual audit entry
router.post("/audit-logs", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role !== "owner") { res.status(403).json({ error: "Owner only" }); return; }
  const { action, category = "system", targetType, targetId, details } = req.body as { action: string; category?: string; targetType?: string; targetId?: number; details?: string };
  if (!action) { res.status(400).json({ error: "action required" }); return; }
  const [log] = await db.insert(auditLogsTable).values({ action, category, performedBy: user.id, targetType, targetId, details }).returning();
  res.status(201).json(log);
});

export default router;


router.post("/audit-logs/delete", requireAuth, async (req, res): Promise<void> => {
  if (req.currentUser!.role !== "owner") { res.status(403).json({ error: "Owner only" }); return; }
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter((id: number) => Number.isInteger(id) && id > 0) : [];
  if (ids.length === 0) { res.status(400).json({ error: "Select at least one audit log" }); return; }
  const uniqueIds: number[] = [...new Set<number>(ids)].slice(0, 500);
  await db.delete(auditLogsTable).where(inArray(auditLogsTable.id, uniqueIds));
  res.json({ ok: true, deleted: uniqueIds.length });
});

router.post("/audit-logs/summarize", requireAuth, async (req, res): Promise<void> => {
  if (req.currentUser!.role !== "owner") { res.status(403).json({ error: "Owner only" }); return; }
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter((id: number) => Number.isInteger(id) && id > 0) : [];
  if (ids.length === 0) { res.status(400).json({ error: "Select at least one audit log" }); return; }
  const uniqueIds: number[] = [...new Set<number>(ids)].slice(0, 100);
  const rows = await db.select({ id: auditLogsTable.id, action: auditLogsTable.action, category: auditLogsTable.category, details: auditLogsTable.details, createdAt: auditLogsTable.createdAt, performerName: usersTable.name, performerRole: usersTable.role }).from(auditLogsTable).leftJoin(usersTable, eq(auditLogsTable.performedBy, usersTable.id)).where(inArray(auditLogsTable.id, uniqueIds));
  try {
    const ai = await getAIProvider();
    const summary = await ai.analyzeData({ events: rows }, "Summarize these DALLYLETTER audit events for the project owner. Identify important activity, failures, moderation/security concerns, and role patterns. Do not invent facts. Return concise bullet points.");
    res.json({ provider: ai.name, summary });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "AI summary unavailable" }); }
});


// Academic documents are built only from authoritative records. Transfer letters and
// AI-assisted reports remain unavailable to learners until an authorized manager approves.
router.post("/academic-records/transfer-requests", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (reason.length < 3 || reason.length > 2000) { res.status(400).json({ error: "Provide a transfer reason between 3 and 2000 characters." }); return; }
  const result = await pool.query(
    "INSERT INTO academic_transfer_requests (learner_id, requested_by, reason) VALUES ($1,$1,$2) RETURNING id, learner_id, reason, status, created_at",
    [user.id, reason],
  );
  await db.insert(auditLogsTable).values({ performedBy: user.id, action: "transfer_letter.requested", category: "academic", targetType: "transfer_request", targetId: Number(result.rows[0].id), details: JSON.stringify({ status: "pending" }) });
  res.status(201).json(result.rows[0]);
});

router.get("/academic-records/transfer-requests", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const manager = canAccessManager(user);
  if (manager && !(await hasManagerPermission(user, "transferView"))) { res.status(403).json({ error: "You do not have permission to view transfer requests." }); return; }
  const result = manager
    ? await pool.query("SELECT r.id,r.learner_id,u.name AS learner_name,r.requested_by,r.reason,r.status,r.review_note,r.reviewed_by,r.reviewed_at,r.created_at FROM academic_transfer_requests r JOIN users u ON u.id=r.learner_id ORDER BY r.created_at DESC LIMIT 200")
    : await pool.query("SELECT id,learner_id,reason,status,review_note,reviewed_at,created_at FROM academic_transfer_requests WHERE learner_id=$1 ORDER BY created_at DESC LIMIT 100", [user.id]);
  res.json(result.rows);
});

router.post("/academic-records/transfer-requests/:id/review", requireAuth, async (req, res): Promise<void> => {
  const reviewer = req.currentUser!;
  if (!(await hasManagerPermission(reviewer, "transferReview"))) { res.status(403).json({ error: "Transfer approval permission is required." }); return; }
  const id = Number(req.params.id);
  const status = req.body?.status;
  const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 2000) : null;
  if (!Number.isSafeInteger(id) || id < 1 || !["approved","rejected"].includes(status)) { res.status(400).json({ error: "A valid request ID and approved/rejected decision are required." }); return; }
  if (status === "rejected" && !note) { res.status(400).json({ error: "A reviewer comment is required when rejecting a transfer request." }); return; }
  const result = await pool.query("UPDATE academic_transfer_requests SET status=$1,reviewed_by=$2,review_note=$3,reviewed_at=now(),updated_at=now() WHERE id=$4 AND status='pending' RETURNING id,learner_id,status,review_note,reviewed_by,reviewed_at", [status, reviewer.id, note, id]);
  if (!result.rowCount) { res.status(404).json({ error: "Pending transfer request not found or already reviewed." }); return; }
  await db.insert(auditLogsTable).values({ performedBy: reviewer.id, action: "transfer_letter.reviewed", category: "academic", targetType: "transfer_request", targetId: id, details: JSON.stringify({ status, note }) });
  res.json(result.rows[0]);
});

router.get("/academic-records/transfer-requests/:id/download", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) { res.status(400).json({ error: "Invalid request ID." }); return; }
  const result = await pool.query(
    "SELECT r.*,u.name AS learner_name,u.email,reviewer.name AS reviewer_name,reviewer.role AS reviewer_role FROM academic_transfer_requests r JOIN users u ON u.id=r.learner_id LEFT JOIN users reviewer ON reviewer.id=r.reviewed_by WHERE r.id=$1",
    [id],
  );
  const row = result.rows[0];
  if (!row || (Number(row.learner_id) !== Number(user.id) && !canAccessManager(user))) { res.status(404).json({ error: "Approved transfer letter not found." }); return; }
  if (row.status !== "approved") { res.status(403).json({ error: "The transfer letter cannot be downloaded until an authorized manager approves the request." }); return; }
  if (canAccessManager(user) && !(await hasManagerPermission(user, "transferView"))) { res.status(403).json({ error: "You do not have permission to download transfer letters." }); return; }
  const approvalRef = "DL-TR-" + String(id).padStart(6, "0") + "-" + new Date(row.reviewed_at).toISOString().slice(0,10).replace(/-/g, "");
  const pdf = createTransferLetterPdf([
    "DALLYLETTER ELIDEMS",
    "OFFICIAL LEARNER TRANSFER LETTER",
    "CONFIDENTIAL - FOR AUTHORIZED SCHOOL USE",
    "",
    "Transfer reference: " + approvalRef,
    "Learner full name: " + row.learner_name,
    "Learner account email: " + row.email,
    "Request date: " + new Date(row.created_at).toISOString().slice(0,10),
    "Approval date: " + new Date(row.reviewed_at).toISOString().slice(0,10),
    "",
    "TRANSFER REQUEST REASON",
    row.reason,
    row.review_note ? "Reviewer comments: " + row.review_note : "Reviewer comments: None supplied",
    "",
    "AUTHORIZATION RECORD",
    "Approved by: " + (row.reviewer_name || "Authorized manager"),
    "Role at approval: " + (row.reviewer_role || "manager"),
    "Reviewer account ID: " + row.reviewed_by,
    "Approval status: APPROVED",
    "Approval recorded in the Dallyletter academic transfer register.",
    "",
    "AUTHORIZED SIGNATURE",
    (row.reviewer_name || "Authorized manager") + " / " + (row.reviewer_role || "manager"),
    "Electronic approval record: " + approvalRef,
    "Signature identity is the authenticated reviewer recorded by the server.",
    "",
    "Protected document: do not alter. Verify the reference against the academic transfer register.",
    "Generated at: " + new Date().toISOString(),
    "DALLYLETTER ELIDEMS | APPROVED TRANSFER | " + approvalRef,
  ]);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=dallyletter-transfer-letter-" + id + ".pdf");
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(pdf);
});

router.get("/academic-records/me", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const [enrollments, awards, attendance] = await Promise.all([
    pool.query("SELECT e.id,e.class_id,e.enrolled_at,e.progress_percent,e.status,c.title AS class_title,c.subject,c.teacher_id FROM enrollments e JOIN classes c ON c.id=e.class_id WHERE e.learner_id=$1 ORDER BY e.enrolled_at DESC", [user.id]),
    pool.query("SELECT ua.id,ua.earned_at,a.name,a.description,a.icon,a.category,ua.awarded_by_name,ua.note FROM user_achievements ua JOIN achievements a ON a.id=ua.achievement_id WHERE ua.user_id=$1 ORDER BY ua.earned_at DESC", [user.id]),
    pool.query("SELECT class_id,status,joined_at,left_at,duration_minutes,is_late FROM attendance WHERE student_id=$1 ORDER BY joined_at DESC LIMIT 500", [user.id]),
  ]);
  res.json({ enrollments: enrollments.rows, awards: awards.rows, attendance: attendance.rows });
});

router.post("/academic-records/reports/drafts", requireAuth, async (req, res): Promise<void> => {
  const creator = req.currentUser!;
  if (!(await hasManagerPermission(creator, "reportCreate"))) { res.status(403).json({ error: "Report-draft creation permission is required." }); return; }
  const learnerId = Number(req.body?.learnerId);
  const reportType = req.body?.reportType;
  const termLabel = typeof req.body?.termLabel === "string" ? req.body.termLabel.trim().slice(0,80) : "";
  if (!Number.isSafeInteger(learnerId) || learnerId < 1 || !["attendance_register","term_performance"].includes(reportType) || !termLabel) { res.status(400).json({ error: "learnerId, reportType and termLabel are required." }); return; }
  const [learner, enrollments, attendance, awards, events, assignmentMarks, exerciseMarks] = await Promise.all([
    pool.query("SELECT id,name,role,grade FROM users WHERE id=$1 AND role IN ('student','learner') AND is_blocked=false", [learnerId]),
    pool.query("SELECT e.id,e.class_id,e.enrolled_at,e.progress_percent,e.status,c.title AS class_title,c.subject FROM enrollments e JOIN classes c ON c.id=e.class_id WHERE e.learner_id=$1 ORDER BY e.enrolled_at", [learnerId]),
    pool.query("SELECT class_id,status,joined_at,duration_minutes,is_late FROM attendance WHERE student_id=$1 AND joined_at >= date_trunc('year',now()) ORDER BY joined_at DESC LIMIT 1000", [learnerId]),
    pool.query("SELECT ua.earned_at,a.name,a.description FROM user_achievements ua JOIN achievements a ON a.id=ua.achievement_id WHERE ua.user_id=$1 ORDER BY ua.earned_at DESC", [learnerId]),
    pool.query("SELECT action,category,target_type,created_at FROM audit_logs WHERE target_id=$1 ORDER BY created_at DESC LIMIT 200", [String(learnerId)]),
    pool.query("SELECT a.subject,a.title,s.marks AS earned_marks,a.total_marks AS possible_marks,s.graded_at AS marked_at,'assignment' AS source FROM assignment_submissions s JOIN assignments a ON a.id=s.assignment_id WHERE s.student_id=$1 AND s.graded_at IS NOT NULL AND s.marks IS NOT NULL ORDER BY s.graded_at DESC LIMIT 1000", [learnerId]),
    pool.query("SELECT l.subject,e.title,s.total_score AS earned_marks,e.total_marks AS possible_marks,s.marked_at,'exercise' AS source FROM exercise_submissions s JOIN exercises e ON e.id=s.exercise_id JOIN lessons l ON l.id=e.lesson_id WHERE s.learner_id=$1 AND s.marked_at IS NOT NULL AND e.total_marks > 0 ORDER BY s.marked_at DESC LIMIT 1000", [learnerId]),
  ]);
  if (!learner.rows[0]) { res.status(404).json({ error: "Learner not found." }); return; }
  const allMarkRows = [...assignmentMarks.rows, ...exerciseMarks.rows];
  const subjectTotals = new Map<string, { subject: string; earnedMarks: number; possibleMarks: number; markedRecords: number }>();
  let excludedInvalidMarkRecords = 0;
  for (const row of allMarkRows) {
    const earned = Number(row.earned_marks);
    const possible = Number(row.possible_marks);
    const subject = typeof row.subject === "string" && row.subject.trim() ? row.subject.trim() : "Unspecified subject";
    if (!Number.isFinite(earned) || !Number.isFinite(possible) || possible <= 0 || earned < 0 || earned > possible) {
      excludedInvalidMarkRecords++;
      continue;
    }
    const total = subjectTotals.get(subject) || { subject, earnedMarks: 0, possibleMarks: 0, markedRecords: 0 };
    total.earnedMarks += earned;
    total.possibleMarks += possible;
    total.markedRecords++;
    subjectTotals.set(subject, total);
  }
  const subjectPerformance = [...subjectTotals.values()].map(item => ({
    ...item,
    percentage: Math.round((item.earnedMarks / item.possibleMarks) * 10000) / 100,
  })).sort((a,b) => a.subject.localeCompare(b.subject));
  const marksSummary = {
    scope: "All valid marked assignment and exercise records currently saved for this learner; term dates were not supplied, so this is not represented as term-only data.",
    subjectPerformance,
    markedRecordCount: subjectPerformance.reduce((sum, item) => sum + item.markedRecords, 0),
    excludedInvalidMarkRecords,
  };
  const sourceSnapshot = { learner: learner.rows[0], termLabel, enrollments: enrollments.rows, attendance: attendance.rows, awards: awards.rows, marksSummary, markedAssignments: assignmentMarks.rows, markedExercises: exerciseMarks.rows, relevantAuditEvents: events.rows };
  let draftContent: unknown;
  let provider = "record-based";
  if (reportType === "attendance_register") {
    const byClass = new Map<number, { classId: number; sessions: number; present: number; late: number; absent: number }>();
    for (const row of attendance.rows) {
      const item = byClass.get(Number(row.class_id)) || { classId: Number(row.class_id), sessions: 0, present: 0, late: 0, absent: 0 };
      item.sessions++;
      if (String(row.status).toLowerCase() === "present") item.present++;
      else if (row.is_late) item.late++;
      else if (String(row.status).toLowerCase() === "absent") item.absent++;
      byClass.set(item.classId, item);
    }
    draftContent = { label: termLabel, learner: learner.rows[0].name, records: [...byClass.values()], subjectPerformance: marksSummary.subjectPerformance, marksScope: marksSummary.scope, sourceCount: attendance.rows.length, warning: "Draft only. Verify the term dates and attendance entries before approval." };
  } else {
    try {
      const ai = await getAIProvider();
      if (ai.name === "mock") { res.status(503).json({ error: "A live AI provider must be configured to draft term-performance commentary. No mock AI report was created." }); return; }
      provider = ai.name;
      draftContent = { label: termLabel, learner: learner.rows[0].name, subjectPerformance: marksSummary.subjectPerformance, marksScope: marksSummary.scope, factualRecords: { enrollments: enrollments.rows, attendanceCount: attendance.rows.length, awards: awards.rows, marksSummary }, commentary: await ai.analyzeData(sourceSnapshot, "Draft a CAPS-aligned academic performance report using only the supplied verified records. Include subject percentages only from marksSummary, clearly state that mark percentages cover all saved marked records because term dates were not supplied, separate measured facts from interpretations, identify missing data, do not invent marks or attendance, and label this as an unapproved draft. Return concise structured prose.") };
    } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "Live AI report drafting unavailable." }); return; }
  }
  const saved = await pool.query("INSERT INTO academic_report_drafts (learner_id,created_by,report_type,term_label,source_snapshot,draft_content) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb) RETURNING id,learner_id,created_by,report_type,term_label,draft_content,status,created_at", [learnerId, creator.id, reportType, termLabel, JSON.stringify(sourceSnapshot), JSON.stringify(draftContent)]);
  await db.insert(auditLogsTable).values({ performedBy: creator.id, action: "academic_report.draft_created", category: "academic", targetType: "academic_report_draft", targetId: Number(saved.rows[0].id), details: JSON.stringify({ learnerId, reportType, termLabel, provider }) });
  res.status(201).json(saved.rows[0]);
});

router.get("/academic-records/reports/me", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const result = await pool.query("SELECT id,report_type,term_label,draft_content,reviewed_at,created_at FROM academic_report_drafts WHERE learner_id=$1 AND status='approved' ORDER BY reviewed_at DESC NULLS LAST,created_at DESC LIMIT 100", [user.id]);
  res.json(result.rows);
});

router.get("/academic-records/reports/drafts", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!(await hasManagerPermission(user, "reportView"))) { res.status(403).json({ error: "Report-review access is required." }); return; }
  const result = await pool.query("SELECT d.id,d.learner_id,u.name AS learner_name,u.grade AS learner_grade,d.created_by,d.report_type,d.term_label,d.draft_content,d.status,d.reviewed_by,d.review_note,d.reviewed_at,d.created_at FROM academic_report_drafts d JOIN users u ON u.id=d.learner_id ORDER BY d.created_at DESC LIMIT 200");
  res.json(result.rows);
});

router.post("/academic-records/reports/drafts/:id/review", requireAuth, async (req, res): Promise<void> => {
  const reviewer = req.currentUser!;
  if (!(await hasManagerPermission(reviewer, "reportReview"))) { res.status(403).json({ error: "Academic report approval permission is required." }); return; }
  const id = Number(req.params.id);
  const status = req.body?.status;
  const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0,2000) : null;
  if (!Number.isSafeInteger(id) || id < 1 || !["approved","rejected"].includes(status)) { res.status(400).json({ error: "A valid draft ID and approved/rejected decision are required." }); return; }
  if (status === "rejected" && !note) { res.status(400).json({ error: "A reviewer comment is required when rejecting an academic report." }); return; }
  const result = await pool.query("UPDATE academic_report_drafts SET status=$1,reviewed_by=$2,review_note=$3,reviewed_at=now(),updated_at=now() WHERE id=$4 AND status='pending_review' RETURNING id,learner_id,report_type,term_label,status,reviewed_by,review_note,reviewed_at", [status, reviewer.id, note, id]);
  if (!result.rowCount) { res.status(404).json({ error: "Pending report draft not found or already reviewed." }); return; }
  await db.insert(auditLogsTable).values({ performedBy: reviewer.id, action: "academic_report.reviewed", category: "academic", targetType: "academic_report_draft", targetId: id, details: JSON.stringify({ status, note }) });
  res.json(result.rows[0]);
});

router.get("/academic-records/reports/drafts/:id/download", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) { res.status(400).json({ error: "Invalid draft ID." }); return; }
  const result = await pool.query("SELECT * FROM academic_report_drafts WHERE id=$1", [id]);
  const row = result.rows[0];
  if (!row || (Number(row.learner_id) !== Number(user.id) && !canAccessManager(user))) { res.status(404).json({ error: "Approved academic report not found." }); return; }
  if (canAccessManager(user) && !(await hasManagerPermission(user, "reportView"))) { res.status(403).json({ error: "You do not have permission to download reports." }); return; }
  if (row.status !== "approved") { res.status(403).json({ error: "Academic reports cannot be downloaded until an authorized manager approves the draft." }); return; }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="dallyletter-' + row.report_type + '-' + id + '.json"');
  res.send(JSON.stringify({ reportType: row.report_type, termLabel: row.term_label, report: row.draft_content, reviewedAt: row.reviewed_at, reviewedBy: row.reviewed_by }, null, 2));
});
