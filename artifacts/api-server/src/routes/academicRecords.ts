import { Router, type Request, type Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import { db, auditLogsTable, pool } from "@workspace/db";
import { getAIProvider } from "../lib/ai-provider";
import { requireAuth, canAccessManager, isOwnerRole } from "../lib/auth-middleware";
import { isSeniorManager, isJuniorManager } from "../lib/role-access";
import { requireManagerPermission, requireManagerPermissionForRequest, requireManagerPermissionIfManager } from "../lib/manager-permission-policy";
import { enqueueEmailNotification } from "../lib/email-notification-queue";
import { calculateAgeOnDate, getCurrentAcademicYear } from "../lib/academic-year";
import { canViewProfileSection } from "./profileConnections";

const router = Router();

const currentAcademicYearHandler = (_req: Request, res: Response): void => {
  const academicYear = getCurrentAcademicYear();
  // Preserve the numeric field expected by older config clients while exposing
  // the canonical year/date/time-zone contract to newer academic-record clients.
  res.json({ ...academicYear, currentYear: Number(academicYear.academicYear) });
};

// Keep the older config path compatible while both paths share one authoritative source.
router.get("/config/currentYear", requireAuth, currentAcademicYearHandler);
router.get("/academic-records/current-year", requireAuth, currentAcademicYearHandler);
function isReportMarkExercise(row: any): boolean {
  const layout = row?.exercise_layout ?? row?.layout;
  if (!layout || typeof layout !== "object" || Array.isArray(layout)) return true;
  return (layout as Record<string, unknown>).recordForReport !== false;
}

function summarizeAcademicMarks(assignmentRows: any[], exerciseRows: any[]) {
  const exempt = (status: unknown) => ["exempt", "excused"].includes(String(status || "").trim().toLowerCase());
  const assignmentMarked = assignmentRows.filter(row => row.marks !== null && row.marks !== undefined && !exempt(row.status));
  const reportableExerciseRows = exerciseRows.filter(isReportMarkExercise);
  const exerciseMarked = reportableExerciseRows.filter(row =>
    !exempt(row.status) && (row.marked_at || row.returned_at || ["marked", "returned", "graded"].includes(String(row.status || "").toLowerCase()))
  );
  const summarize = (rows: any[], earnedKey: string, possibleKey: string) => {
    const earned = rows.reduce((sum, row) => sum + (Number.isFinite(Number(row[earnedKey])) ? Number(row[earnedKey]) : 0), 0);
    const possible = rows.reduce((sum, row) => sum + (Number.isFinite(Number(row[possibleKey])) ? Number(row[possibleKey]) : 0), 0);
    return { markedCount: rows.length, earnedMarks: Number(earned.toFixed(2)), possibleMarks: Number(possible.toFixed(2)), percentage: possible > 0 ? Number((earned / possible * 100).toFixed(2)) : null };
  };
  const assignmentSummary = summarize(assignmentMarked, "marks", "total_marks");
  const exerciseSummary = summarize(exerciseMarked, "total_score", "total_marks");
  const combinedEarned = assignmentSummary.earnedMarks + exerciseSummary.earnedMarks;
  const combinedPossible = assignmentSummary.possibleMarks + exerciseSummary.possibleMarks;
  return {
    assignments: { ...assignmentSummary, unmarkedCount: assignmentRows.filter(row => (row.marks === null || row.marks === undefined) && !exempt(row.status)).length, exemptCount: assignmentRows.filter(row => exempt(row.status)).length },
    exercises: { ...exerciseSummary, unmarkedCount: reportableExerciseRows.filter(row => !row.marked_at && !row.returned_at && !["marked", "returned", "graded", "exempt", "excused"].includes(String(row.status || "").toLowerCase())).length, exemptCount: reportableExerciseRows.filter(row => exempt(row.status)).length },
    overall: { markedCount: assignmentSummary.markedCount + exerciseSummary.markedCount, earnedMarks: Number(combinedEarned.toFixed(2)), possibleMarks: Number(combinedPossible.toFixed(2)), percentage: combinedPossible > 0 ? Number((combinedEarned / combinedPossible * 100).toFixed(2)) : null },
  };
}

function buildAcademicReportPdf(input: { id: number; reportType: string; termLabel: string; periodStart?: unknown; periodEnd?: unknown; learnerName: string; reviewedAt: unknown; reviewedBy: unknown; reviewNote?: unknown; report: unknown }): Buffer {
  const report = input.report && typeof input.report === "object" ? input.report as Record<string, any> : {};
  const facts = report.factualRecords && typeof report.factualRecords === "object" ? report.factualRecords : {};
  const summary = facts.markSummary?.overall || report.markSummary?.overall || {};
  const assignments = Array.isArray(facts.assignmentMarks) ? facts.assignmentMarks : [];
  const exercises = Array.isArray(facts.exerciseMarks) ? facts.exerciseMarks : [];
  const attendanceRows = Array.isArray(report.records) ? report.records : [];
  const formatDate = (value: unknown) => {
    if (!value) return "Not recorded";
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toISOString().slice(0, 10);
  };
  // The embedded standard PDF font uses WinAnsi: preserve Latin-1 names/diacritics
  // and replace unsupported glyphs visibly rather than silently deleting them.
  const escapePdf = (value: unknown) => String(value ?? "Not recorded")
    .replace(/[^\x20-\xFF]/g, "?")
    .replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const raw: string[] = [
    "DALLYLETTER ELIDEMS",
    "OFFICIAL ACADEMIC REPORT",
    "SMART CAPS LEARNER REPORT CARD",
    "",
    "LEARNER DETAILS",
    "Learner name: " + input.learnerName,
    "Learner grade / form: " + (report.learnerGrade || "Not recorded"),
    "Admission number: " + (report.admissionNumber || "Not recorded"),
    "Date of birth: " + (report.dateOfBirth || "Not recorded"),
    "Age at period end: " + (report.ageOnPeriodEnd == null ? "Not calculated" : report.ageOnPeriodEnd),
    "Report type: " + input.reportType.replace(/_/g, " "),
    "Academic year: " + (report.academicYear || "Not recorded"),
    "Term: " + input.termLabel,
    "Period dates: " + formatDate(input.periodStart) + " to " + formatDate(input.periodEnd),
    "Document reference: DL-AR-" + input.id,
    "Approval date: " + formatDate(input.reviewedAt),
    "Approved by account: " + (input.reviewedBy ?? "Not recorded"),
    "",
  ];
  if (input.reportType === "attendance_register") {
    raw.push("ATTENDANCE SUMMARY");
    raw.push("Class ID | Sessions | Present | Absent | Late");
    if (attendanceRows.length) {
      for (const row of attendanceRows) raw.push([row.classId, row.sessions, row.present, row.absent, row.late].map(value => value ?? "0").join(" | "));
    } else raw.push("No attendance sessions were recorded in this period.");
    raw.push("Total attendance records: " + (report.sourceCount ?? attendanceRows.reduce((sum: number, row: any) => sum + Number(row.sessions || 0), 0)));
  } else {
    raw.push("ACADEMIC PERFORMANCE");
    raw.push("Recorded marks: " + (summary.markedCount ?? "Not available"));
    raw.push("Earned marks: " + (summary.earnedMarks ?? "Not available"));
    raw.push("Possible marks: " + (summary.possibleMarks ?? "Not available"));
    raw.push("Overall percentage: " + (summary.percentage == null ? "Not available" : summary.percentage + "%"));
    raw.push("");
    raw.push("SUBJECTS / CLASSES");
    const enrollments = Array.isArray(facts.enrollments) ? facts.enrollments : [];
    if (enrollments.length) for (const entry of enrollments) raw.push([entry.subject || "Subject not recorded", entry.class_title || "Class not recorded", entry.grade ? "Grade " + entry.grade : ""].filter(Boolean).join(" | "));
    else raw.push("No subject or class enrollment was recorded in this period.");
    raw.push("ASSIGNMENT MARKS");
    raw.push("Subject / activity | Mark | Status");
    if (assignments.length) for (const row of assignments) raw.push([row.subject || row.title || "Assignment", row.marks == null ? "Not marked" : String(row.marks) + " / " + String(row.total_marks ?? "?"), row.status || "Recorded"].join(" | "));
    else raw.push("No assignment marks were recorded in this period.");
    raw.push("");
    raw.push("REPORT-ENABLED EXERCISE MARKS");
    if (exercises.length) for (const row of exercises) raw.push([row.title || "Exercise", row.total_score == null ? "Not marked" : String(row.total_score) + " / " + String(row.total_marks ?? "?"), row.status || "Recorded"].join(" | "));
    else raw.push("No marked report-enabled exercises were recorded in this period.");
    raw.push("");
    raw.push("");
    raw.push("POLL / QUIZ ACTIVITIES");
    const polls = Array.isArray(facts.pollSubmissions) ? facts.pollSubmissions : [];
    if (polls.length) for (const poll of polls) raw.push([poll.title || "Learning poll", poll.subject || "Subject not recorded", poll.score == null || poll.total_questions == null ? "Score not available" : String(poll.score) + " / " + String(poll.total_questions), poll.completed_at ? formatDate(poll.completed_at) : "Date not recorded"].join(" | "));
    else raw.push("No completed learning poll submissions were recorded in this period.");
    raw.push("CLASS PROGRESS");
    if (enrollments.length) for (const entry of enrollments) raw.push([entry.subject || "Subject not recorded", entry.class_title || "Class not recorded", entry.progress_percent == null ? "Progress not recorded" : String(entry.progress_percent) + "%", entry.status || "Status not recorded"].join(" | "));
    else raw.push("No active or completed class enrollment was recorded before the end of this period.");
    raw.push("ATTENDANCE");
    raw.push("Recorded attendance sessions: " + (facts.attendanceCount ?? "Not available"));
    raw.push("Present: " + (facts.attendanceSummary?.present ?? "Not available"));
    raw.push("Absent: " + (facts.attendanceSummary?.absent ?? "Not available"));
    raw.push("Late: " + (facts.attendanceSummary?.late ?? "Not available"));
    raw.push("ACHIEVEMENTS");
    const awards = Array.isArray(facts.awards) ? facts.awards : [];
    raw.push(awards.length ? awards.map((award: any) => award.name).join(", ") : "No achievements recorded in this period.");
    raw.push("");
    raw.push("ACADEMIC COMMENTARY");
    raw.push(String(report.commentary || "No AI academic commentary was recorded."));
  }
  raw.push("Teacher comment: " + (report.teacherComment || "Not recorded"));
  raw.push("Conduct / behaviour: " + (report.conduct || "Not recorded"));
  raw.push("Term result / promotion: " + (report.result || "Not recorded"));
  raw.push("Reviewer / headmaster comment: " + (input.reviewNote || "Not recorded"));
  raw.push("Teacher signature: Not digitally recorded");
  raw.push("Learner position: Not calculated (no saved ranking data).");
  raw.push("Headmaster signature / school stamp: Not recorded");
  raw.push("", "This report contains only saved records available for the selected period.");
  raw.push("Unmarked work is not counted as zero. Missing information is shown as unavailable.");
  if (raw.some(line => /[^\x20-\xFF]/.test(line))) raw.push("Font coverage note: Latin-1 characters are preserved; unsupported Unicode glyphs appear as question marks.");
  const wrapped = raw.flatMap(line => {
    const words = String(line).split(/\s+/);
    const out: string[] = [];
    let current = "";
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
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  pageLines.forEach((page, pageIndex) => {
    const pageObject = 5 + pageIndex * 2;
    const contentObject = pageObject + 1;
    const textCommands = page.map((line, index) => {
      const heading = /^(DALLYLETTER ELIDEMS|OFFICIAL ACADEMIC REPORT|SMART CAPS LEARNER REPORT CARD|LEARNER DETAILS|ATTENDANCE SUMMARY|ACADEMIC PERFORMANCE|SUBJECTS \/ CLASSES|ASSIGNMENT MARKS|REPORT-ENABLED EXERCISE MARKS|ACHIEVEMENTS|ACADEMIC COMMENTARY)$/.test(line);
      return (index ? "0 -14 Td\n" : "") + (heading ? "/F2 11 Tf\n" : "/F1 9 Tf\n") + "(" + escapePdf(line) + ") Tj";
    }).join("\n");
    const stream = [
      "0.055 0.13 0.29 rg 0 790 595 52 re f",
      "1 1 1 rg BT /F2 18 Tf 48 808 Td (DALLYLETTER ELIDEMS) Tj ET",
      "0.72 0.55 0.08 rg 0 786 595 4 re f",
      "0 0 0 rg BT 48 760 Td",
      textCommands,
      "ET",
      "0.055 0.13 0.29 rg 48 34 499 1 re f",
      "0 0 0 rg BT /F1 8 Tf 48 20 Td (DL-AR-" + input.id + " | Protected academic report) Tj 440 0 Td (Page " + (pageIndex + 1) + " of " + pageLines.length + ") Tj ET",
    ].join("\n");
    objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents " + contentObject + " 0 R >>");
    objects.push("<< /Length " + Buffer.byteLength(stream, "binary") + " >>\nstream\n" + stream + "\nendstream");
  });
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(Buffer.byteLength(pdf, "binary"));
    pdf += (index + 1) + " 0 obj\n" + objects[index] + "\nendobj\n";
  }
  const xref = Buffer.byteLength(pdf, "binary");
  pdf += "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) pdf += String(offset).padStart(10, "0") + " 00000 n \n";
  pdf += "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF";
  return Buffer.from(pdf, "binary");
}

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
  if (formData.dob && calculateAgeOnDate(formData.dob, formData.effectiveDate || new Date()) === null) {
    res.status(400).json({ error: "Enter a valid date of birth that is not after the effective transfer date." });
    return;
  }
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
      "SELECT id FROM users WHERE (lower(role) IN ('owner','platform_owner','senior_manager') OR (lower(role)='manager' AND lower(COALESCE(manager_level,'junior'))='senior') OR (lower(role)='teacher' AND is_manager=true AND lower(COALESCE(manager_level,'junior'))='senior' AND COALESCE(teacher_application_status,'')<>'pending_review')) AND is_blocked=false AND is_suspended=false ORDER BY id",
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

router.get("/academic-records/transfer-requests", requireAuth, requireManagerPermissionIfManager("transfers.view"), async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const manager = canAccessManager(user);
  const result = manager
    ? await pool.query("SELECT r.id,r.learner_id,u.name AS learner_name,r.requested_by,r.reason,r.status,r.review_note,r.reviewed_by,r.reviewed_at,r.created_at FROM academic_transfer_requests r JOIN users u ON u.id=r.learner_id ORDER BY r.created_at DESC LIMIT 200")
    : await pool.query("SELECT id,learner_id,reason,status,review_note,reviewed_at,created_at FROM academic_transfer_requests WHERE learner_id=$1 ORDER BY created_at DESC LIMIT 100", [user.id]);
  res.json(result.rows);
});

router.post("/academic-records/transfer-requests/:id/review", requireAuth, requireManagerPermissionForRequest((req) => req.body?.status === "approved" ? "transfers.approve" : "transfers.reject"), async (req, res): Promise<void> => {
  const reviewer = req.currentUser!;
  const id = Number(req.params.id);
  const status = req.body?.status;
  if (status === "approved" && !isSeniorManager(reviewer)) { res.status(403).json({ error: "Only a Senior Manager or Owner can approve a transfer." }); return; }
  if (status === "rejected" && !isSeniorManager(reviewer) && !isJuniorManager(reviewer)) { res.status(403).json({ error: "Manager access required to reject a transfer." }); return; }
  const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 2000) : "";
  if (!Number.isSafeInteger(id) || id < 1 || !["approved","rejected"].includes(status)) { res.status(400).json({ error: "A valid request ID and approved/rejected decision are required." }); return; }
  if (status === "rejected" && note.length < 3) { res.status(400).json({ error: "A clear rejection reason of at least 3 characters is required." }); return; }
  const verificationToken = status === "approved" ? randomBytes(32).toString("base64url") : null;
  const verificationTokenHash = verificationToken ? createHash("sha256").update(verificationToken).digest("hex") : null;
  const verificationPath = verificationToken ? "/verify/transfer/" + verificationToken : null;
  const configuredAppUrl = (process.env.PUBLIC_APP_URL || process.env.VITE_APP_URL || "").trim().replace(/\/+$/, "");
  const verificationUrl = verificationPath ? (configuredAppUrl ? configuredAppUrl + verificationPath : verificationPath) : null;
  let reviewedRequest: any;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "UPDATE academic_transfer_requests SET status=$1,reviewed_by=$2,review_note=$3,reviewed_at=now(),updated_at=now(),verification_token_hash=$4::text,verification_token_expires_at=CASE WHEN $4::text IS NULL THEN NULL ELSE now()+interval '30 days' END,verification_verified_at=NULL WHERE id=$5 AND status='pending' RETURNING id,learner_id,status,review_note,reviewed_by,reviewed_at,verification_token_expires_at",
      [status, reviewer.id, note || null, verificationTokenHash, id],
    );
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Pending transfer request not found or already reviewed." });
      return;
    }
    reviewedRequest = result.rows[0];
    await client.query(
      "INSERT INTO audit_logs (action,category,performed_by,target_type,target_id,details) VALUES ($1,$2,$3,$4,$5,$6)",
      ["transfer_letter.reviewed", "academic", reviewer.id, "transfer_request", id, JSON.stringify({ status, note, verificationTokenIssued: Boolean(verificationTokenHash) })],
    );
    const notificationTitle = status === "approved" ? "Transfer letter approved" : "Transfer letter declined";
    const notificationMessage = status === "approved"
      ? "Your transfer request #" + id + " was approved. Use the protected verification link to confirm the issuing-school record."
      : "Your transfer request #" + id + " was declined. Reviewer feedback: " + note;
    await client.query(
      "INSERT INTO notifications(recipient_id,title,message,link,type,is_read) VALUES($1,$2,$3,$4,$5,false)",
      [Number(reviewedRequest.learner_id), notificationTitle, notificationMessage, verificationPath || "/profile-hub?tab=Transfer%20Letters", status === "approved" ? "transfer_approved" : "transfer_rejected"],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  // Queue email after the decision and in-app notification commit; email failures do not undo approval.
  try {
    await enqueueEmailNotification(
      Number(reviewedRequest.learner_id),
      status === "approved" ? "Your transfer letter request was approved" : "Your transfer letter request was declined",
      status === "approved"
        ? "Your transfer letter request #" + id + " was approved. Verify the issuing-school record here: " + String(verificationUrl) + ". The link expires in 30 days. You can also sign in to Dallyletter Elidems to download the protected PDF."
        : "Your transfer letter request #" + id + " was declined. Reviewer feedback: " + note + ". Sign in to Dallyletter Elidems to review the decision."
    );
  } catch (error) {
    console.error("Transfer decision applicant notification queue failed", error instanceof Error ? error.message : "unknown");
  }
  res.json({ ...reviewedRequest, verificationUrl });
});

router.get("/academic-records/transfer-verification/:token", async (req, res): Promise<void> => {
  const token = String(req.params.token || "");
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) { res.status(404).json({ error: "Verification link is invalid or expired." }); return; }
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const result = await pool.query(
    "SELECT id,form_data,reviewed_at,verification_token_expires_at,verification_verified_at FROM academic_transfer_requests WHERE verification_token_hash=$1 AND status='approved' AND verification_token_expires_at>now() LIMIT 1",
    [tokenHash],
  );
  const row = result.rows[0];
  if (!row) { res.status(404).json({ error: "Verification link is invalid or expired." }); return; }
  await pool.query("UPDATE academic_transfer_requests SET verification_verified_at=COALESCE(verification_verified_at,now()) WHERE id=$1", [row.id]);
  const data = row.form_data && typeof row.form_data === "object" ? row.form_data : {};
  res.setHeader("Cache-Control", "no-store, private");
  res.json({
    verified: true,
    reference: "DL-TR-" + row.id,
    learnerName: data.learnerName || "Not provided",
    currentSchool: data.currentSchool || "Not provided",
    receivingSchool: data.receivingSchool || "Not provided",
    grade: data.grade || "Not provided",
    academicYear: data.academicYear || "Not provided",
    approvedAt: row.reviewed_at,
    expiresAt: row.verification_token_expires_at,
    verifiedAt: row.verification_verified_at,
  });
});

router.get("/academic-records/transfer-requests/:id/download", requireAuth, requireManagerPermissionIfManager("transfers.view"), async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) { res.status(400).json({ error: "Invalid request ID." }); return; }
  const result = await pool.query(
    "SELECT r.*,u.name AS learner_name,u.email,u.grade FROM academic_transfer_requests r JOIN users u ON u.id=r.learner_id WHERE r.id=$1",
    [id],
  );
  const row = result.rows[0];
  if (!row || (Number(row.learner_id) !== Number(user.id) && !canAccessManager(user))) { res.status(404).json({ error: "Approved transfer letter not found." }); return; }
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
    "Age on effective transfer date: " + (calculateAgeOnDate(row.form_data?.dob, row.form_data?.effectiveDate || row.created_at) ?? "Not recorded"),
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
  const [enrollments, awards, attendance, assignmentMarks, exerciseMarks, pollSubmissions] = await Promise.all([
    pool.query("SELECT e.id,e.class_id,e.enrolled_at,e.progress_percent,e.status,c.title AS class_title,c.subject,c.teacher_id FROM enrollments e JOIN classes c ON c.id=e.class_id WHERE e.learner_id=$1 ORDER BY e.enrolled_at DESC", [user.id]),
    pool.query("SELECT ua.id,ua.earned_at,a.name,a.description,a.icon,a.category,ua.awarded_by_name,ua.note FROM user_achievements ua JOIN achievements a ON a.id=ua.achievement_id WHERE ua.user_id=$1 ORDER BY ua.earned_at DESC", [user.id]),
    pool.query("SELECT class_id,status,joined_at,left_at,duration_minutes,is_late FROM attendance WHERE student_id=$1 ORDER BY joined_at DESC LIMIT 500", [user.id]),
    pool.query("SELECT a.id AS assignment_id,a.title,a.subject,a.grade,a.total_marks,s.id AS submission_id,s.status,s.marks,s.submitted_at,s.graded_at,s.feedback FROM assignment_submissions s JOIN assignments a ON a.id=s.assignment_id WHERE s.student_id=$1 ORDER BY s.submitted_at DESC", [user.id]),
    pool.query("SELECT e.id AS exercise_id,e.title,e.grade,e.total_marks,e.layout AS exercise_layout,s.id AS submission_id,s.attempt_number,s.status,s.total_score,s.percentage,s.submitted_at,s.marked_at,s.returned_at,s.overall_comment FROM exercise_submissions s JOIN exercises e ON e.id=s.exercise_id WHERE s.learner_id=$1 ORDER BY s.submitted_at DESC", [user.id]),
    pool.query("SELECT ps.id AS submission_id,ps.poll_id,p.title,p.subject,p.grade,p.mode,ps.score,ps.total_questions,ps.completed_at FROM poll_submissions ps JOIN polls p ON p.id=ps.poll_id WHERE ps.student_id=$1 ORDER BY ps.completed_at DESC LIMIT 500", [user.id]),
  ]);
  const markSummary = summarizeAcademicMarks(assignmentMarks.rows, exerciseMarks.rows);
  res.json({ enrollments: enrollments.rows, awards: awards.rows, attendance: attendance.rows, assignmentMarks: assignmentMarks.rows, exerciseMarks: exerciseMarks.rows, pollSubmissions: pollSubmissions.rows, markSummary });
});

router.get("/academic-records/report-learners", requireAuth, requireManagerPermissionIfManager("recordbook.view"), requireManagerPermissionIfManager("reports.create"), async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (canAccessManager(user)) {
    const result = await pool.query("SELECT id,name,grade FROM users WHERE role IN ('student','learner') AND is_blocked=false ORDER BY name LIMIT 1000");
    res.json(result.rows);
    return;
  }
  if (String(user.role).toLowerCase() !== "teacher" || user.teacherApplicationStatus === "pending_review") {
    res.status(403).json({ error: "Academic report creation is available to teachers and managers." }); return;
  }
  const result = await pool.query(
    "SELECT DISTINCT u.id,u.name,u.grade FROM enrollments e JOIN classes c ON c.id=e.class_id JOIN users u ON u.id=e.learner_id WHERE c.teacher_id=$1 AND u.role IN ('student','learner') AND u.is_blocked=false ORDER BY u.name LIMIT 1000",
    [user.id],
  );
  res.json(result.rows);
});

router.post("/academic-records/reports/drafts", requireAuth, requireManagerPermissionIfManager("recordbook.view"), requireManagerPermissionIfManager("reports.create"), async (req, res): Promise<void> => {
  const creator = req.currentUser!;
  const creatorRole = String(creator.role || "").trim().toLowerCase().replace(/[ -]+/g, "_");
  if (!canAccessManager(creator)) {
    if (creatorRole !== "teacher" || creator.teacherApplicationStatus === "pending_review") {
      res.status(403).json({ error: "Academic report creation is available to teachers and managers." }); return;
    }
    const assignment = await pool.query(
      "SELECT 1 FROM enrollments e JOIN classes c ON c.id=e.class_id WHERE e.learner_id=$1 AND c.teacher_id=$2 LIMIT 1",
      [(Number(req.body?.learnerId) || 0), creator.id],
    );
    if (!assignment.rowCount) {
      res.status(403).json({ error: "You can create reports for learners in your assigned classes." }); return;
    }
  }
  const learnerId = Number(req.body?.learnerId);
  const reportType = req.body?.reportType;
  const termLabel = typeof req.body?.termLabel === "string" ? req.body.termLabel.trim().slice(0,80) : "";
  const periodStart = typeof req.body?.periodStart === "string" ? req.body.periodStart : "";
  const periodEnd = typeof req.body?.periodEnd === "string" ? req.body.periodEnd : "";
  const isDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + "T00:00:00Z")) && new Date(value + "T00:00:00Z").toISOString().slice(0,10) === value;
  if (!Number.isSafeInteger(learnerId) || learnerId < 1 || !["attendance_register","term_performance"].includes(reportType) || !termLabel || !isDateOnly(periodStart) || !isDateOnly(periodEnd) || periodStart > periodEnd) {
    res.status(400).json({ error: "learnerId, reportType, termLabel, and valid inclusive periodStart/periodEnd dates (YYYY-MM-DD) are required." }); return;
  }
  const periodDays = (Date.parse(periodEnd + "T00:00:00Z") - Date.parse(periodStart + "T00:00:00Z")) / 86400000 + 1;
  if (periodDays > 370) { res.status(400).json({ error: "Academic report periods cannot exceed 370 days." }); return; }
  const [learner, enrollments, attendance, awards, events, assignmentMarks, exerciseMarks, pollSubmissions] = await Promise.all([
    pool.query("SELECT id,name,role,grade FROM users WHERE id=$1 AND role IN ('student','learner') AND is_blocked=false", [learnerId]),
    pool.query("SELECT e.id,e.class_id,e.enrolled_at,e.progress_percent,e.status,c.title AS class_title,c.subject FROM enrollments e JOIN classes c ON c.id=e.class_id WHERE e.learner_id=$1 AND e.enrolled_at < (($2::date + 1)::timestamp AT TIME ZONE 'Africa/Harare') AND e.status <> 'cancelled' ORDER BY e.enrolled_at", [learnerId, periodEnd]),
    pool.query("SELECT class_id,status,joined_at,duration_minutes,is_late FROM attendance WHERE student_id=$1 AND joined_at >= ($2::date::timestamp AT TIME ZONE 'Africa/Harare') AND joined_at < (($3::date + 1)::timestamp AT TIME ZONE 'Africa/Harare') ORDER BY joined_at DESC LIMIT 1000", [learnerId, periodStart, periodEnd]),
    pool.query("SELECT ua.earned_at,a.name,a.description FROM user_achievements ua JOIN achievements a ON a.id=ua.achievement_id WHERE ua.user_id=$1 AND ua.earned_at >= ($2::date::timestamp AT TIME ZONE 'Africa/Harare') AND ua.earned_at < (($3::date + 1)::timestamp AT TIME ZONE 'Africa/Harare') ORDER BY ua.earned_at DESC", [learnerId, periodStart, periodEnd]),
    pool.query("SELECT action,category,target_type,created_at FROM audit_logs WHERE target_id=$1 AND created_at >= ($2::date::timestamp AT TIME ZONE 'Africa/Harare') AND created_at < (($3::date + 1)::timestamp AT TIME ZONE 'Africa/Harare') ORDER BY created_at DESC LIMIT 200", [String(learnerId), periodStart, periodEnd]),
    pool.query("SELECT a.id AS assignment_id,a.title,a.subject,a.grade,a.total_marks,s.id AS submission_id,s.status,s.marks,s.submitted_at,s.graded_at,s.feedback FROM assignment_submissions s JOIN assignments a ON a.id=s.assignment_id WHERE s.student_id=$1 AND COALESCE(s.graded_at,s.submitted_at) >= ($2::date::timestamp AT TIME ZONE 'Africa/Harare') AND COALESCE(s.graded_at,s.submitted_at) < (($3::date + 1)::timestamp AT TIME ZONE 'Africa/Harare') ORDER BY COALESCE(s.graded_at,s.submitted_at) DESC", [learnerId, periodStart, periodEnd]),
    pool.query("SELECT e.id AS exercise_id,e.title,e.grade,e.total_marks,e.layout AS exercise_layout,s.id AS submission_id,s.attempt_number,s.status,s.total_score,s.percentage,s.submitted_at,s.marked_at,s.returned_at,s.overall_comment FROM exercise_submissions s JOIN exercises e ON e.id=s.exercise_id WHERE s.learner_id=$1 AND COALESCE(s.marked_at,s.returned_at,s.submitted_at) >= ($2::date::timestamp AT TIME ZONE 'Africa/Harare') AND COALESCE(s.marked_at,s.returned_at,s.submitted_at) < (($3::date + 1)::timestamp AT TIME ZONE 'Africa/Harare') ORDER BY COALESCE(s.marked_at,s.returned_at,s.submitted_at) DESC", [learnerId, periodStart, periodEnd]),
    pool.query("SELECT ps.id AS submission_id,ps.poll_id,p.title,p.subject,p.grade,p.mode,ps.score,ps.total_questions,ps.completed_at FROM poll_submissions ps JOIN polls p ON p.id=ps.poll_id WHERE ps.student_id=$1 AND ps.completed_at >= ($2::date::timestamp AT TIME ZONE 'Africa/Harare') AND ps.completed_at < (($3::date + 1)::timestamp AT TIME ZONE 'Africa/Harare') ORDER BY ps.completed_at DESC", [learnerId, periodStart, periodEnd]),
  ]);
  if (!learner.rows[0]) { res.status(404).json({ error: "Learner not found." }); return; }
  const reportableExerciseMarks = exerciseMarks.rows.filter(isReportMarkExercise);
  const markSummary = summarizeAcademicMarks(assignmentMarks.rows, reportableExerciseMarks);
  const attendanceSummary = { sessions: attendance.rows.length, present: attendance.rows.filter((row: any) => String(row.status).toLowerCase() === "present" && !row.is_late).length, absent: attendance.rows.filter((row: any) => String(row.status).toLowerCase() === "absent").length, late: attendance.rows.filter((row: any) => Boolean(row.is_late) || String(row.status).toLowerCase() === "late").length };
  const academicYear = periodStart.slice(0, 4);
  const sourceSnapshot = { learner: learner.rows[0], academicYear, termLabel, periodStart, periodEnd, enrollments: enrollments.rows, attendance: attendance.rows, attendanceSummary, awards: awards.rows, assignmentMarks: assignmentMarks.rows, exerciseMarks: reportableExerciseMarks, pollSubmissions: pollSubmissions.rows, markSummary, relevantAuditEvents: events.rows };
  let draftContent: unknown;
  let provider = "record-based";
  if (reportType === "attendance_register") {
    const byClass = new Map<number, { classId: number; sessions: number; present: number; late: number; absent: number }>();
    for (const row of attendance.rows) {
      const item = byClass.get(Number(row.class_id)) || { classId: Number(row.class_id), sessions: 0, present: 0, late: 0, absent: 0 };
      item.sessions++;
      if (row.is_late || String(row.status).toLowerCase() === "late") item.late++;
      else if (String(row.status).toLowerCase() === "present") item.present++;
      else if (String(row.status).toLowerCase() === "absent") item.absent++;
      byClass.set(item.classId, item);
    }
    draftContent = { label: termLabel, periodStart, periodEnd, learner: learner.rows[0].name, records: [...byClass.values()], sourceCount: attendance.rows.length, warning: "Draft only. Attendance records are filtered to the inclusive academic period; verify entries before approval." };
  } else {
    let commentary: string | null = null;
    try {
      const ai = await getAIProvider();
      if (ai.name !== "mock") {
        provider = ai.name;
        commentary = await ai.analyzeData(sourceSnapshot, `Draft concise CAPS-aligned commentary using only the supplied verified records. Do not invent marks, attendance, achievements or learner details. Clearly identify missing information and unmarked work. The supplied records are already restricted to the inclusive period ${periodStart} through ${periodEnd}. Return prose only.`);
      }
    } catch (error) {
      // Report generation must remain usable from saved academic records if AI is unavailable.
      console.warn("Academic report AI commentary unavailable; using record-based report", error instanceof Error ? error.message : "unknown");
    }
    draftContent = { label: termLabel, periodStart, periodEnd, learner: learner.rows[0].name, factualRecords: { enrollments: enrollments.rows, attendanceCount: attendance.rows.length, attendanceSummary, awards: awards.rows, assignmentMarks: assignmentMarks.rows, exerciseMarks: reportableExerciseMarks, pollSubmissions: pollSubmissions.rows, markSummary }, commentary, commentaryStatus: commentary ? "generated" : "not_generated" };
  }
  const admissionNumber = typeof req.body?.admissionNumber === "string" ? req.body.admissionNumber.trim().slice(0, 50) : "";
  const dateOfBirth = typeof req.body?.dateOfBirth === "string" && calculateAgeOnDate(req.body.dateOfBirth, periodEnd) !== null ? req.body.dateOfBirth : "";
  const ageOnPeriodEnd = dateOfBirth ? calculateAgeOnDate(dateOfBirth, periodEnd) : null;
  const teacherComment = typeof req.body?.teacherComment === "string" ? req.body.teacherComment.trim().slice(0, 3000) : "";
  const conduct = typeof req.body?.conduct === "string" ? req.body.conduct.trim().slice(0, 120) : "";
  const result = typeof req.body?.result === "string" ? req.body.result.trim().slice(0, 120) : "";
  draftContent = {
    ...(draftContent && typeof draftContent === "object" ? draftContent as Record<string, unknown> : {}),
    learnerGrade: learner.rows[0].grade ?? null,
    academicYear,
    admissionNumber: admissionNumber || null,
    dateOfBirth: dateOfBirth || null,
    ageOnPeriodEnd,
    teacherComment: teacherComment || null,
    conduct: conduct || null,
    result: result || null,
  };
  const saved = await pool.query("INSERT INTO academic_report_drafts (learner_id,created_by,report_type,term_label,period_start,period_end,source_snapshot,draft_content) VALUES ($1,$2,$3,$4,$5::date,$6::date,$7::jsonb,$8::jsonb) RETURNING id,learner_id,created_by,report_type,term_label,period_start,period_end,draft_content,status,created_at", [learnerId, creator.id, reportType, termLabel, periodStart, periodEnd, JSON.stringify(sourceSnapshot), JSON.stringify(draftContent)]);
  await db.insert(auditLogsTable).values({ performedBy: creator.id, action: "academic_report.draft_created", category: "academic", targetType: "academic_report_draft", targetId: Number(saved.rows[0].id), details: JSON.stringify({ learnerId, reportType, termLabel, provider }) });
  res.status(201).json(saved.rows[0]);
});

router.post("/academic-records/reports/drafts/:id/submit", requireAuth, requireManagerPermissionIfManager("reports.create"), async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) { res.status(400).json({ error: "Invalid draft ID." }); return; }
  const existing = await pool.query("SELECT id,created_by,status FROM academic_report_drafts WHERE id=$1", [id]);
  const row = existing.rows[0];
  if (!row || (Number(row.created_by) !== Number(user.id) && !canAccessManager(user))) {
    res.status(404).json({ error: "Report draft not found." }); return;
  }
  if (row.status !== "draft") {
    res.status(409).json({ error: "Only an unsubmitted draft can be submitted for review." }); return;
  }
  const submitted = await pool.query("UPDATE academic_report_drafts SET status='pending_review',updated_at=now() WHERE id=$1 AND status='draft' RETURNING id,status", [id]);
  if (!submitted.rowCount) { res.status(409).json({ error: "This report draft has already changed status. Refresh and try again." }); return; }
  await db.insert(auditLogsTable).values({ performedBy: user.id, action: "academic_report.submitted_for_review", category: "academic", targetType: "academic_report_draft", targetId: id, details: JSON.stringify({ status: "pending_review" }) });
  res.json(submitted.rows[0]);
});

router.get("/academic-records/reports/me", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const result = await pool.query("SELECT id,report_type,term_label,period_start,period_end,draft_content,review_note,reviewed_at,reviewed_by,created_at FROM academic_report_drafts WHERE learner_id=$1 AND status='approved' ORDER BY reviewed_at DESC NULLS LAST,created_at DESC LIMIT 100", [user.id]);
  res.json(result.rows);
});

router.get("/academic-records/reports/drafts", requireAuth, requireManagerPermissionIfManager("reports.view"), async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const columns = "SELECT d.id,d.learner_id,d.created_by,d.report_type,d.term_label,d.period_start,d.period_end,d.draft_content,d.status,d.reviewed_by,d.review_note,d.reviewed_at,d.created_at,u.name AS learner_name FROM academic_report_drafts d JOIN users u ON u.id=d.learner_id";
  if (canAccessManager(user)) {
    const result = await pool.query(columns + " ORDER BY d.created_at DESC LIMIT 200");
    res.json(result.rows); return;
  }
  if (String(user.role).toLowerCase() !== "teacher" || user.teacherApplicationStatus === "pending_review") {
    res.status(403).json({ error: "Academic reports are available to their learner, assigned teacher, and managers." }); return;
  }
  const result = await pool.query(
    columns + " WHERE d.created_by=$1 OR EXISTS (SELECT 1 FROM enrollments e JOIN classes c ON c.id=e.class_id WHERE e.learner_id=d.learner_id AND c.teacher_id=$1) ORDER BY d.created_at DESC LIMIT 200",
    [user.id],
  );
  res.json(result.rows);
});

router.post("/academic-records/reports/drafts/:id/review", requireAuth, requireManagerPermission("reports.review"), async (req, res): Promise<void> => {
  const reviewer = req.currentUser!;
  const id = Number(req.params.id);
  const status = req.body?.status;
  const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0,2000) : null;
  if (!Number.isSafeInteger(id) || id < 1 || !["approved","rejected"].includes(status)) { res.status(400).json({ error: "A valid draft ID and approved/rejected decision are required." }); return; }
  // Return the same not-found response for completed reviews, regardless of the caller's role.
  const pending = await pool.query("SELECT id FROM academic_report_drafts WHERE id=$1 AND status='pending_review'", [id]);
  if (!pending.rowCount) { res.status(404).json({ error: "Pending report draft not found or already reviewed." }); return; }
  if (!isSeniorManager(reviewer)) { res.status(403).json({ error: "A Senior Manager or Owner must approve or reject this report." }); return; }
  let reviewedReport: any;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("UPDATE academic_report_drafts SET status=$1,reviewed_by=$2,review_note=$3,reviewed_at=now(),updated_at=now() WHERE id=$4 AND status='pending_review' RETURNING id,learner_id,report_type,term_label,status,reviewed_by,review_note,reviewed_at", [status, reviewer.id, note, id]);
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Pending report draft not found or already reviewed." });
      return;
    }
    reviewedReport = result.rows[0];
    await client.query(
      "INSERT INTO audit_logs (action,category,performed_by,target_type,target_id,details) VALUES ($1,$2,$3,$4,$5,$6)",
      ["academic_report.reviewed", "academic", reviewer.id, "academic_report_draft", id, JSON.stringify({ status, note })],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  res.json(reviewedReport);
});

router.get("/academic-records/reports/drafts/:id/download/pdf", requireAuth, requireManagerPermissionIfManager("reports.view"), async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) { res.status(400).json({ error: "Invalid draft ID." }); return; }
  const result = await pool.query("SELECT * FROM academic_report_drafts WHERE id=$1", [id]);
  const row = result.rows[0];
  if (!row) { res.status(404).json({ error: "Approved academic report not found." }); return; }
  const sharedReportAccess = await canViewProfileSection(user,Number(row.learner_id),"reports");
  if (Number(row.learner_id) !== Number(user.id) && Number(row.created_by) !== Number(user.id) && !canAccessManager(user) && !sharedReportAccess) { res.status(404).json({ error: "Approved academic report not found." }); return; }
  if (row.status !== "approved") { res.status(403).json({ error: "Academic reports can be downloaded after Senior Manager / Owner approval." }); return; }
  const draftContent = typeof row.draft_content === "string" ? JSON.parse(row.draft_content) : row.draft_content;
  const sourceSnapshot = typeof row.source_snapshot === "string" ? JSON.parse(row.source_snapshot) : row.source_snapshot;
  const learnerName = String(draftContent?.learner || sourceSnapshot?.learner?.name || "Learner record");
  const pdf = buildAcademicReportPdf({ id, reportType: String(row.report_type), termLabel: String(row.term_label), periodStart: row.period_start, periodEnd: row.period_end, learnerName, reviewedAt: row.reviewed_at, reviewedBy: row.reviewed_by, reviewNote: row.review_note, report: draftContent });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", 'attachment; filename="dallyletter-academic-report-' + id + '.pdf"');
  res.send(pdf);
});

router.get("/academic-records/reports/drafts/:id/download", requireAuth, requireManagerPermissionIfManager("reports.view"), async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) { res.status(400).json({ error: "Invalid draft ID." }); return; }
  const result = await pool.query("SELECT * FROM academic_report_drafts WHERE id=$1", [id]);
  const row = result.rows[0];
  if (!row) { res.status(404).json({ error: "Approved academic report not found." }); return; }
  const sharedReportAccess = await canViewProfileSection(user,Number(row.learner_id),"reports");
  if (Number(row.learner_id) !== Number(user.id) && Number(row.created_by) !== Number(user.id) && !canAccessManager(user) && !sharedReportAccess) { res.status(404).json({ error: "Approved academic report not found." }); return; }
  if (row.status !== "approved") { res.status(403).json({ error: "Academic reports can be downloaded after Senior Manager / Owner approval." }); return; }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="dallyletter-' + row.report_type + '-' + id + '.json"');
  res.send(JSON.stringify({ reportType: row.report_type, termLabel: row.term_label, periodStart: row.period_start, periodEnd: row.period_end, report: row.draft_content, reviewedAt: row.reviewed_at, reviewedBy: row.reviewed_by }, null, 2));
});

export default router;
