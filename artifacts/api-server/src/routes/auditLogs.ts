import { Router } from "express";
import { db, auditLogsTable, usersTable, pool } from "@workspace/db";
import { eq, desc, inArray, and } from "drizzle-orm";
import { getAIProvider } from "../lib/ai-provider";
import { requireAuth, canAccessManager, isOwnerRole } from "../lib/auth-middleware";
import { enqueueEmailNotification } from "../lib/email-notification-queue";

const router = Router();

function canReviewAcademicTransfer(user: { role: unknown; isManager?: unknown; teacherApplicationStatus?: unknown }): boolean {
  const role = String(user.role || "").trim().toLowerCase().replace(/[ -]+/g, "_");
  return role === "owner" || (!isOwnerRole(role) && canAccessManager(user));
}

// GET /audit-logs — list audit logs (owner only)
router.get("/audit-logs", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!canAccessManager(user)) { res.status(403).json({ error: "Manager or owner access required" }); return; }
  const isOwner = isOwnerRole(user.role);
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
  const formData = req.body?.formData && typeof req.body.formData === "object" && !Array.isArray(req.body.formData) ? req.body.formData : {};
  if (reason.length < 3 || reason.length > 2000) { res.status(400).json({ error: "Provide a transfer reason between 3 and 2000 characters." }); return; }
  const requiredFormFields: Array<[string, string]> = [
    ["learnerName", "Learner full name"], ["receivingSchool", "Receiving school"],
    ["guardianName", "Parent/guardian name"], ["guardianPhone", "Parent/guardian phone"],
    ["reasonDetail", "Transfer reason details"],
  ];
  const missingField = requiredFormFields.find(([key]) => typeof formData[key] !== "string" || !String(formData[key]).trim());
  if (missingField) { res.status(400).json({ error: missingField[1] + " is required." }); return; }
  if (JSON.stringify(formData).length > 180_000) { res.status(413).json({ error: "Transfer application attachments or form data exceed the allowed size." }); return; }
  // Serialize submissions per learner so rapid taps/retries cannot create duplicate pending requests.
  const client = await pool.connect();
  let requestRow: any;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [user.id]);
    const pending = await client.query(
      "SELECT id FROM academic_transfer_requests WHERE learner_id=$1 AND status='pending' LIMIT 1",
      [user.id],
    );
    if (pending.rowCount) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "You already have a transfer request awaiting review.", requestId: pending.rows[0].id });
      return;
    }
    const inserted = await client.query(
      "INSERT INTO academic_transfer_requests (learner_id, requested_by, reason, form_data) VALUES ($1,$1,$2,$3::jsonb) RETURNING id, learner_id, reason, status, created_at",
      [user.id, reason, JSON.stringify(formData)],
    );
    requestRow = inserted.rows[0];
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  await db.insert(auditLogsTable).values({ performedBy: user.id, action: "transfer_letter.requested", category: "academic", targetType: "transfer_request", targetId: Number(requestRow.id), details: JSON.stringify({ status: "pending" }) });
  // Queue reviewer email alerts; the audit event above is also the admin-dashboard alert.
  try {
    const reviewers = await pool.query(
      "SELECT id FROM users WHERE (lower(role)=ANY($1::text[]) OR (lower(role)='teacher' AND is_manager=true AND teacher_application_status<>'pending_review')) AND is_blocked=false AND is_suspended=false ORDER BY id",
      [["manager", "senior_manager", "owner"]],
    );
    await Promise.all(reviewers.rows.map((reviewer: { id: number }) =>
      enqueueEmailNotification(Number(reviewer.id), "Transfer letter request awaiting review",
        "A learner submitted transfer letter request #" + requestRow.id + ". Sign in to Dallyletter Elidems and open the transfer requests queue to review it. The request remains pending until an authorized reviewer decides.")
    ));
  } catch (error) {
    // Do not report a saved request as failed if notification infrastructure is temporarily unavailable.
    console.error("Transfer request reviewer notification queue failed", error instanceof Error ? error.message : "unknown");
  }
  res.status(201).json(requestRow);
});

router.get("/academic-records/transfer-requests", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const manager = canReviewAcademicTransfer(user);
  const result = manager
    ? await pool.query("SELECT r.id,r.learner_id,u.name AS learner_name,r.requested_by,r.reason,r.status,r.review_note,r.reviewed_by,r.reviewed_at,r.created_at FROM academic_transfer_requests r JOIN users u ON u.id=r.learner_id ORDER BY r.created_at DESC LIMIT 200")
    : await pool.query("SELECT id,learner_id,reason,status,review_note,reviewed_at,created_at FROM academic_transfer_requests WHERE learner_id=$1 ORDER BY created_at DESC LIMIT 100", [user.id]);
  res.json(result.rows);
});

router.post("/academic-records/transfer-requests/:id/review", requireAuth, async (req, res): Promise<void> => {
  const reviewer = req.currentUser!;
  if (!canReviewAcademicTransfer(reviewer)) { res.status(403).json({ error: "Only authorized managers and owners can review transfer requests." }); return; }
  const id = Number(req.params.id);
  const status = req.body?.status;
  const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 2000) : "";
  if (!Number.isSafeInteger(id) || id < 1 || !["approved","rejected"].includes(status)) { res.status(400).json({ error: "A valid request ID and approved/rejected decision are required." }); return; }
  if (status === "rejected" && note.length < 3) { res.status(400).json({ error: "A clear rejection reason of at least 3 characters is required." }); return; }
  const result = await pool.query("UPDATE academic_transfer_requests SET status=$1,reviewed_by=$2,review_note=$3,reviewed_at=now(),updated_at=now() WHERE id=$4 AND status='pending' RETURNING id,learner_id,status,review_note,reviewed_by,reviewed_at", [status, reviewer.id, note || null, id]);
  if (!result.rowCount) { res.status(404).json({ error: "Pending transfer request not found or already reviewed." }); return; }
  await db.insert(auditLogsTable).values({ performedBy: reviewer.id, action: "transfer_letter.reviewed", category: "academic", targetType: "transfer_request", targetId: id, details: JSON.stringify({ status, note }) });
  // Notify the applicant after the committed decision; email failures must not undo the review.
  try {
    await enqueueEmailNotification(
      Number(result.rows[0].learner_id),
      status === "approved" ? "Your transfer letter request was approved" : "Your transfer letter request was declined",
      status === "approved"
        ? "Your transfer letter request #" + id + " was approved. Sign in to Dallyletter Elidems to view and download your protected PDF."
        : "Your transfer letter request #" + id + " was declined. Reviewer feedback: " + note + ". Sign in to Dallyletter Elidems to review the decision."
    );
  } catch (error) {
    console.error("Transfer decision applicant notification queue failed", error instanceof Error ? error.message : "unknown");
  }
  res.json(result.rows[0]);
});

router.get("/academic-records/transfer-requests/:id/download", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) { res.status(400).json({ error: "Invalid request ID." }); return; }
  const result = await pool.query(
    "SELECT r.*,u.name AS learner_name,u.email,u.grade FROM academic_transfer_requests r JOIN users u ON u.id=r.learner_id WHERE r.id=$1",
    [id],
  );
  const row = result.rows[0];
  if (!row || (Number(row.learner_id) !== Number(user.id) && !canReviewAcademicTransfer(user))) { res.status(404).json({ error: "Approved transfer letter not found." }); return; }
  if (row.status !== "approved") { res.status(403).json({ error: "The transfer letter cannot be downloaded until an authorized manager approves the request." }); return; }
  const [enrollmentRows, attendanceRows, awardRows, subjectRows, reportRows] = await Promise.all([
    pool.query("SELECT c.title,c.subject,c.grade,e.enrolled_at,e.progress_percent,e.status FROM enrollments e JOIN classes c ON c.id=e.class_id WHERE e.learner_id=$1 ORDER BY e.enrolled_at DESC LIMIT 12", [row.learner_id]),
    pool.query("SELECT count(*)::int AS sessions,count(*) FILTER (WHERE lower(status)='present')::int AS present,count(*) FILTER (WHERE lower(status)='absent')::int AS absent FROM attendance WHERE student_id=$1", [row.learner_id]),
    pool.query("SELECT a.name,ua.earned_at FROM user_achievements ua JOIN achievements a ON a.id=ua.achievement_id WHERE ua.user_id=$1 ORDER BY ua.earned_at DESC LIMIT 8", [row.learner_id]),
    pool.query("SELECT subjects FROM learner_subjects WHERE user_id=$1", [row.learner_id]),
    pool.query("SELECT report_type,term_label,reviewed_at,draft_content FROM academic_report_drafts WHERE learner_id=$1 AND status='approved' ORDER BY reviewed_at DESC NULLS LAST,created_at DESC LIMIT 1", [row.learner_id]),
  ]);
  const fmt = (value: unknown) => value == null || value === "" ? "Not recorded" : String(value);
  const lines = [
    "DALLYLETTER ELIDEMS",
    "OFFICIAL TRANSFER LETTER",
    "",
    "Learner: " + fmt(row.learner_name),
    "Account email: " + fmt(row.email),
    "Grade/Form: " + fmt(row.grade),
    "Current school: " + fmt(row.form_data?.currentSchool),
    "Request date: " + new Date(row.created_at).toISOString().slice(0,10),
    "Approval date: " + (row.reviewed_at ? new Date(row.reviewed_at).toISOString().slice(0,10) : "Not recorded"),
    "Transfer reason: " + fmt(row.reason),
    "Receiving school: " + fmt(row.form_data?.receivingSchool),
    "Learner full name: " + fmt(row.form_data?.learnerName || row.learner_name),
    "Date of birth: " + fmt(row.form_data?.dob),
    "Gender: " + fmt(row.form_data?.gender),
    "Admission number: " + fmt(row.form_data?.admissionNo),
    "EMIS number: " + fmt(row.form_data?.emisNo),
    "Academic year: " + fmt(row.form_data?.academicYear),
    "Last term average: " + fmt(row.form_data?.average),
    "Conduct: " + fmt(row.form_data?.conduct),
    "Parent/guardian: " + fmt(row.form_data?.guardianName) + " (" + fmt(row.form_data?.relationship) + ")",
    "Guardian ID: " + fmt(row.form_data?.guardianId),
    "Guardian phone: " + fmt(row.form_data?.guardianPhone),
    "Guardian email: " + fmt(row.form_data?.guardianEmail),
    "Physical address: " + fmt(row.form_data?.address),
    "Effective transfer date: " + fmt(row.form_data?.effectiveDate),
    "Reason details: " + fmt(row.form_data?.reasonDetail),
    "Parent/guardian signature: " + fmt(row.form_data?.guardianSignatureName),
    "Current-school headmaster: " + fmt(row.form_data?.headmasterName),
    "Signature and official stamp: To be completed by the authorized school representative; no signature or stamp is fabricated.",
    row.review_note ? "Manager note: " + row.review_note : "",
    "",
    "ACADEMIC RECORD SUMMARY",
    "Subjects: " + fmt((subjectRows.rows[0]?.subjects || []).join(", ")),
    "Latest approved report: " + (reportRows.rows[0] ? String(reportRows.rows[0].term_label) + " (" + String(reportRows.rows[0].report_type) + ", " + (reportRows.rows[0].reviewed_at ? new Date(reportRows.rows[0].reviewed_at).toISOString().slice(0,10) : "approval date unavailable") + ")" : "No approved report recorded"),
    "Performance/marks: Included only where available in an approved report; no marks are inferred.",
    "Attendance sessions recorded: " + String(attendanceRows.rows[0]?.sessions ?? 0),
    "Present sessions: " + String(attendanceRows.rows[0]?.present ?? 0),
    "Absent sessions recorded: " + String(attendanceRows.rows[0]?.absent ?? 0),
    "Enrollments: " + (enrollmentRows.rows.length ? enrollmentRows.rows.map((e: any) => [e.title,e.subject,e.grade ? "Grade " + e.grade : "",e.progress_percent + "% complete"].filter(Boolean).join(" | ")).join("; ") : "No enrollment records available"),
    "Achievements: " + (awardRows.rows.length ? awardRows.rows.map((a: any) => a.name).join(", ") : "No achievements recorded"),
    "",
    "Generated from available Dallyletter Elidems account and academic records.",
    "This document does not certify fee clearance or replace a school stamp/signature not present in the system.",
    "Approved by authorized reviewer account ID: " + fmt(row.reviewed_by),
    "Document reference: DL-TR-" + id + " | Protected authenticated download",
  ].filter(Boolean);
  const escapePdf = (value: string) => value.normalize("NFKD").replace(/[^\x20-\x7E]/g, "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const wrapped = lines.flatMap(line => {
    const words = line.split(/\s+/); const out: string[] = []; let current = "";
    for (const word of words) {
      if ((current + " " + word).trim().length > 88) { if (current) out.push(current); current = word; }
      else current = (current + " " + word).trim();
    }
    if (current) out.push(current);
    return out;
  });
  const pageLines = Array.from({ length: Math.max(1, Math.ceil(wrapped.length / 48)) }, (_, index) => wrapped.slice(index * 48, (index + 1) * 48));
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [" + pageLines.map((_, index) => (5 + index * 2) + " 0 R").join(" ") + "] /Count " + pageLines.length + " >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];
  pageLines.forEach((page, pageIndex) => {
    const pageObject = 5 + pageIndex * 2;
    const contentObject = pageObject + 1;
    const textCommands = page.map((line, index) => {
      const isHeading = /^(DALLYLETTER ELIDEMS|OFFICIAL TRANSFER LETTER|ACADEMIC RECORD SUMMARY)$/.test(line);
      return (index ? "0 -14 Td\n" : "") + (isHeading ? "/F2 11 Tf\n" : "/F1 9 Tf\n") + "(" + escapePdf(line) + ") Tj";
    }).join("\n");
    const stream = [
      "0.055 0.13 0.29 rg 0 790 595 52 re f",
      "1 1 1 rg BT /F2 18 Tf 48 808 Td (DALLYLETTER ELIDEMS) Tj ET",
      "0.72 0.55 0.08 rg 0 786 595 4 re f",
      "0 0 0 rg BT 48 760 Td",
      textCommands,
      "ET",
      "0.055 0.13 0.29 rg 48 34 499 1 re f",
      "0 0 0 rg BT /F1 8 Tf 48 20 Td (Protected academic document - DL-TR-" + id + ") Tj 440 0 Td (Page " + (pageIndex + 1) + " of " + pageLines.length + ") Tj ET",
    ].join("\n");
    objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents " + contentObject + " 0 R >>");
    objects.push("<< /Length " + new TextEncoder().encode(stream).length + " >>\nstream\n" + stream + "\nendstream");
  });
  let pdf = "%PDF-1.4\n"; const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(new TextEncoder().encode(pdf).length);
    pdf += (i+1) + " 0 obj\n" + objects[i] + "\nendobj\n";
  }
  const xref = new TextEncoder().encode(pdf).length;
  pdf += "xref\n0 " + (objects.length+1) + "\n0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) pdf += String(offset).padStart(10,"0") + " 00000 n \n";
  pdf += "trailer\n<< /Size " + (objects.length+1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", 'attachment; filename="dallyletter-transfer-letter-' + id + '.pdf"');
  res.send(Buffer.from(pdf, "binary"));
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
  if (!canAccessManager(creator)) { res.status(403).json({ error: "Manager review access is required to create academic report drafts." }); return; }
  const learnerId = Number(req.body?.learnerId);
  const reportType = req.body?.reportType;
  const termLabel = typeof req.body?.termLabel === "string" ? req.body.termLabel.trim().slice(0,80) : "";
  if (!Number.isSafeInteger(learnerId) || learnerId < 1 || !["attendance_register","term_performance"].includes(reportType) || !termLabel) { res.status(400).json({ error: "learnerId, reportType and termLabel are required." }); return; }
  const [learner, enrollments, attendance, awards, events] = await Promise.all([
    pool.query("SELECT id,name,role,grade FROM users WHERE id=$1 AND role IN ('student','learner') AND is_blocked=false", [learnerId]),
    pool.query("SELECT e.id,e.class_id,e.enrolled_at,e.progress_percent,e.status,c.title AS class_title,c.subject FROM enrollments e JOIN classes c ON c.id=e.class_id WHERE e.learner_id=$1 ORDER BY e.enrolled_at", [learnerId]),
    pool.query("SELECT class_id,status,joined_at,duration_minutes,is_late FROM attendance WHERE student_id=$1 AND joined_at >= date_trunc('year',now()) ORDER BY joined_at DESC LIMIT 1000", [learnerId]),
    pool.query("SELECT ua.earned_at,a.name,a.description FROM user_achievements ua JOIN achievements a ON a.id=ua.achievement_id WHERE ua.user_id=$1 ORDER BY ua.earned_at DESC", [learnerId]),
    pool.query("SELECT action,category,target_type,created_at FROM audit_logs WHERE target_id=$1 ORDER BY created_at DESC LIMIT 200", [String(learnerId)]),
  ]);
  if (!learner.rows[0]) { res.status(404).json({ error: "Learner not found." }); return; }
  const sourceSnapshot = { learner: learner.rows[0], termLabel, enrollments: enrollments.rows, attendance: attendance.rows, awards: awards.rows, relevantAuditEvents: events.rows };
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
    draftContent = { label: termLabel, learner: learner.rows[0].name, records: [...byClass.values()], sourceCount: attendance.rows.length, warning: "Draft only. Verify the term dates and attendance entries before approval." };
  } else {
    try {
      const ai = await getAIProvider();
      if (ai.name === "mock") { res.status(503).json({ error: "A live AI provider must be configured to draft term-performance commentary. No mock AI report was created." }); return; }
      provider = ai.name;
      draftContent = { label: termLabel, learner: learner.rows[0].name, factualRecords: { enrollments: enrollments.rows, attendanceCount: attendance.rows.length, awards: awards.rows }, commentary: await ai.analyzeData(sourceSnapshot, "Draft a CAPS-aligned term performance report using only the supplied verified records. Separate measured facts from interpretations, identify missing data, do not invent marks or attendance, and clearly label this as an unapproved draft. Return concise structured prose.") };
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
  if (!canAccessManager(user)) { res.status(403).json({ error: "Manager review access is required." }); return; }
  const result = await pool.query("SELECT id,learner_id,created_by,report_type,term_label,draft_content,status,reviewed_by,review_note,reviewed_at,created_at FROM academic_report_drafts ORDER BY created_at DESC LIMIT 200");
  res.json(result.rows);
});

router.post("/academic-records/reports/drafts/:id/review", requireAuth, async (req, res): Promise<void> => {
  const reviewer = req.currentUser!;
  if (!canAccessManager(reviewer)) { res.status(403).json({ error: "Authorized manager review is required." }); return; }
  const id = Number(req.params.id);
  const status = req.body?.status;
  const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0,2000) : null;
  if (!Number.isSafeInteger(id) || id < 1 || !["approved","rejected"].includes(status)) { res.status(400).json({ error: "A valid draft ID and approved/rejected decision are required." }); return; }
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
  if (row.status !== "approved") { res.status(403).json({ error: "Academic reports cannot be downloaded until an authorized manager approves the draft." }); return; }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="dallyletter-' + row.report_type + '-' + id + '.json"');
  res.send(JSON.stringify({ reportType: row.report_type, termLabel: row.term_label, report: row.draft_content, reviewedAt: row.reviewed_at, reviewedBy: row.reviewed_by }, null, 2));
});
