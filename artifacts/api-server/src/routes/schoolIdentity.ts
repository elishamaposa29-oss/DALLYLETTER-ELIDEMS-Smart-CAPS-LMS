import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import { createSchoolId, isValidSchoolId } from "../lib/school-id";
import { buildBrandedDocumentPdf, buildAcademicReportPdf, ensureLearnerSchoolId } from "./academicRecords";
import { pool, db, auditLogsTable } from "@workspace/db";
import { requireAuth, isOwnerRole } from "../lib/auth-middleware";

const router = Router();
let schemaReady: Promise<void> | null = null;
async function ensureSchema(): Promise<void> {
  if (!schemaReady) schemaReady = pool.query(`
    CREATE TABLE IF NOT EXISTS profile_privacy_settings (
      user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      section_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
      chat_privacy text NOT NULL DEFAULT 'everyone' CHECK (chat_privacy IN ('everyone','approval_required')),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS learner_school_ids (
      user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      school_id text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS learner_school_ids_lookup_idx ON learner_school_ids(school_id);
    CREATE TABLE IF NOT EXISTS learner_school_id_lookups (
      id bigserial PRIMARY KEY,
      school_id text NOT NULL,
      found boolean NOT NULL,
      requested_at timestamptz NOT NULL DEFAULT now(),
      ip_hash text
    );
    ALTER TABLE learner_school_id_lookups ADD COLUMN IF NOT EXISTS ip_hash text;
    CREATE INDEX IF NOT EXISTS learner_school_id_lookups_time_idx ON learner_school_id_lookups(requested_at DESC);
    CREATE TABLE IF NOT EXISTS academic_document_verifications (
      id bigserial PRIMARY KEY,
      token_hash text NOT NULL UNIQUE,
      document_type text NOT NULL CHECK (document_type IN ('report','transfer','achievement')),
      document_id bigint NOT NULL,
      learner_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_name text NOT NULL,
      created_by integer NOT NULL REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL DEFAULT now()+interval '365 days',
      revoked_at timestamptz,
      revoked_by integer REFERENCES users(id),
      revocation_reason text
    );
    CREATE INDEX IF NOT EXISTS academic_document_verifications_document_idx ON academic_document_verifications(document_type,document_id);
  `).then(async () => {
    const learners = await pool.query("SELECT u.id FROM users u WHERE lower(u.role) IN ('student','learner') AND COALESCE(u.is_blocked,false)=false AND COALESCE(u.is_suspended,false)=false AND NOT EXISTS (SELECT 1 FROM learner_school_ids s WHERE s.user_id=u.id) ORDER BY u.id");
    for (const learner of learners.rows) {
      let issued = false;
      for (let attempt = 0; attempt < 5 && !issued; attempt++) {
        try {
          await pool.query("INSERT INTO learner_school_ids(user_id,school_id) VALUES($1,$2) ON CONFLICT(user_id) DO NOTHING", [learner.id, createSchoolId()]);
          issued = true;
        } catch (error) {
          if ((error as any)?.code !== "23505" || attempt === 4) throw error;
        }
      }
    }
  }).catch(error => { schemaReady = null; throw error; });
  await schemaReady;
}

router.post("/school-id/documents/:type/:id/share", requireAuth, async (req, res): Promise<void> => {
  await ensureSchema();
  const type = String(req.params.type || "");
  const id = Number(req.params.id);
  const actor = req.currentUser!;
  if (!["report","transfer","achievement"].includes(type) || !Number.isSafeInteger(id) || id < 1) { res.status(400).json({ error: "Unsupported document or invalid document ID." }); return; }
  let document: any;
  if (type === "report") document = (await pool.query("SELECT id,learner_id,report_type AS title FROM academic_report_drafts WHERE id=$1 AND status='approved'", [id])).rows[0];
  if (type === "transfer") document = (await pool.query("SELECT id,learner_id,'Approved transfer letter' AS title FROM academic_transfer_requests WHERE id=$1 AND status='approved'", [id])).rows[0];
  if (type === "achievement") document = (await pool.query("SELECT ua.id,ua.user_id AS learner_id,a.name AS title FROM user_achievements ua JOIN achievements a ON a.id=ua.achievement_id WHERE ua.id=$1", [id])).rows[0];
  if (!document) { res.status(404).json({ error: "Approved document not found." }); return; }
  if (Number(document.learner_id) !== Number(actor.id) && !isOwnerRole(actor.role)) { res.status(403).json({ error: "Only the learner or platform Owner can create this protected share." }); return; }
  const recipientName = typeof req.body?.recipientName === "string" ? req.body.recipientName.trim().slice(0,120) : "";
  if (!recipientName) { res.status(400).json({ error: "Enter the intended recipient's name for the share watermark." }); return; }
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const saved = await pool.query("INSERT INTO academic_document_verifications(token_hash,document_type,document_id,learner_id,recipient_name,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,created_at,expires_at", [tokenHash,type,id,document.learner_id,recipientName,actor.id]);
  await db.insert(auditLogsTable).values({ performedBy: actor.id, action: "academic_document.share_created", category: "academic", targetType: type, targetId: id, details: JSON.stringify({ verificationId: saved.rows[0].id, recipientName }) });
  res.status(201).json({ verificationId: Number(saved.rows[0].id), documentType: type, recipientName, sharedAt: saved.rows[0].created_at, expiresAt: saved.rows[0].expires_at, verificationPath: "/verify/document/" + token });
});

router.get("/school-id/documents/verify/:token", async (req, res): Promise<void> => {
  await ensureSchema();
  const token = String(req.params.token || "");
  if (token.length < 40 || token.length > 100) { res.status(404).json({ verified: false, error: "Document verification not found." }); return; }
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const found = await pool.query("SELECT v.id,v.document_type,v.document_id,v.learner_id,v.recipient_name,v.created_at,v.expires_at,v.revoked_at,u.name AS learner_name,s.school_id,p.section_settings FROM academic_document_verifications v JOIN users u ON u.id=v.learner_id LEFT JOIN learner_school_ids s ON s.user_id=v.learner_id LEFT JOIN profile_privacy_settings p ON p.user_id=v.learner_id WHERE v.token_hash=$1 AND COALESCE(u.is_blocked,false)=false AND COALESCE(u.is_suspended,false)=false LIMIT 1", [tokenHash]);
  const row = found.rows[0];
  if (!row || row.revoked_at || new Date(row.expires_at).getTime() <= Date.now()) { res.status(404).json({ verified: false, error: "This document link is invalid, expired or revoked." }); return; }
  let current: any;
  if (row.document_type === "report") current = (await pool.query("SELECT status FROM academic_report_drafts WHERE id=$1 AND learner_id=$2", [row.document_id,row.learner_id])).rows[0];
  if (row.document_type === "transfer") current = (await pool.query("SELECT status FROM academic_transfer_requests WHERE id=$1 AND learner_id=$2", [row.document_id,row.learner_id])).rows[0];
  if (row.document_type === "achievement") current = (await pool.query("SELECT id FROM user_achievements WHERE id=$1 AND user_id=$2", [row.document_id,row.learner_id])).rows[0];
  if (!current || (current.status && current.status !== "approved")) { res.status(404).json({ verified: false, error: "The source document is no longer valid." }); return; }
  res.setHeader("Cache-Control","no-store");
  res.json({ verified: true, verificationId: Number(row.id), documentType: row.document_type, documentId: Number(row.document_id), learner: { name: row.section_settings?.overview?.mode === "everyone" ? row.learner_name : "Privacy protected", schoolId: row.school_id }, recipientName: row.recipient_name, sharedAt: row.created_at, expiresAt: row.expires_at, status: "active", downloadPath: "/api/school-id/documents/verify/" + token + "/pdf" });
});


router.get("/school-id/documents/verify/:token/pdf", async (req, res): Promise<void> => {
  await ensureSchema();
  const token = String(req.params.token || "");
  if (token.length < 40 || token.length > 100) { res.status(404).json({ error: "Document verification not found." }); return; }
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const found = await pool.query("SELECT v.id,v.document_type,v.document_id,v.learner_id,v.recipient_name,v.created_at,v.expires_at,v.revoked_at,u.name AS learner_name,u.grade FROM academic_document_verifications v JOIN users u ON u.id=v.learner_id WHERE v.token_hash=$1 AND COALESCE(u.is_blocked,false)=false AND COALESCE(u.is_suspended,false)=false LIMIT 1", [tokenHash]);
  const row = found.rows[0];
  if (!row || row.revoked_at || new Date(row.expires_at).getTime() <= Date.now()) { res.status(404).json({ error: "This document link is invalid, expired or revoked." }); return; }
  const schoolId = await ensureLearnerSchoolId(Number(row.learner_id));
  const base = String(process.env.PUBLIC_APP_URL || process.env.VITE_APP_URL || "").trim().replace(/\/+$/,"");
  const verificationUrl = (base ? base : "") + "/verify/document/" + token;
  const watermark = { recipientName: String(row.recipient_name), sharedAt: new Date(row.created_at), verificationUrl };
  let pdf: Buffer;
  if (row.document_type === "report") {
    const source = (await pool.query("SELECT * FROM academic_report_drafts WHERE id=$1 AND learner_id=$2 AND status='approved'", [row.document_id,row.learner_id])).rows[0];
    if (!source) { res.status(404).json({ error: "The approved academic report is no longer available." }); return; }
    const draft = typeof source.draft_content === "string" ? JSON.parse(source.draft_content) : source.draft_content;
    const snapshot = typeof source.source_snapshot === "string" ? JSON.parse(source.source_snapshot) : source.source_snapshot;
    const learnerName = String(draft?.learner || snapshot?.learner?.name || row.learner_name || "Learner record");
    pdf = buildAcademicReportPdf({ id:Number(source.id),reportType:String(source.report_type),termLabel:String(source.term_label),periodStart:source.period_start,periodEnd:source.period_end,learnerName,schoolId,schoolVerificationUrl:(base ? base : "")+"/verify/school/"+schoolId,watermark,reviewedAt:source.reviewed_at,reviewedBy:source.reviewed_by,reviewNote:source.review_note,report:draft });
  } else if (row.document_type === "transfer") {
    const source = (await pool.query("SELECT id,reason,status,reviewed_at,created_at,form_data FROM academic_transfer_requests WHERE id=$1 AND learner_id=$2 AND status='approved'", [row.document_id,row.learner_id])).rows[0];
    if (!source) { res.status(404).json({ error: "The approved transfer document is no longer available." }); return; }
    const form = source.form_data && typeof source.form_data === "object" ? source.form_data : {};
    pdf = buildBrandedDocumentPdf("OFFICIAL TRANSFER LETTER","Dallyletter Elidems verified transfer record","DL-TR-"+source.id,[
      {heading:"Learner and transfer",rows:["Learner: "+String(form.learnerName||row.learner_name),"Dallyletter School ID: "+schoolId,"Academic verification: "+((base?base:"")+"/verify/school/"+schoolId),"Current school: "+String(form.currentSchool||"Not recorded"),"Receiving school: "+String(form.receivingSchool||"Not recorded"),"Grade / Form: "+String(form.grade||row.grade||"Not recorded"),"Academic year: "+String(form.academicYear||"Not recorded"),"Effective date: "+String(form.effectiveDate||"Not recorded"),"Reason: "+String(form.reasonDetail||source.reason||"Not recorded")]},
      {heading:"Approval",rows:["Status: Approved","Approved on: "+new Date(source.reviewed_at||source.created_at).toLocaleDateString(),"Document reference: DL-TR-"+source.id,"This recipient copy omits private guardian contact, identity and address fields."]}
    ],watermark);
  } else {
    const award = (await pool.query("SELECT ua.id,ua.earned_at,ua.awarded_by_name,a.name,a.description,a.category,a.points_value FROM user_achievements ua JOIN achievements a ON a.id=ua.achievement_id WHERE ua.id=$1 AND ua.user_id=$2", [row.document_id,row.learner_id])).rows[0];
    if (!award) { res.status(404).json({ error: "The achievement award is no longer available." }); return; }
    pdf = buildBrandedDocumentPdf("ACHIEVEMENT CERTIFICATE","Official learner achievement record","ACH-"+award.id,[
      {heading:"Award recipient",rows:["Learner: "+row.learner_name,"Grade / Form: "+String(row.grade||"Not recorded"),"Dallyletter School ID: "+schoolId,"Academic verification: "+((base?base:"")+"/verify/school/"+schoolId)]},
      {heading:"Achievement",rows:["Award: "+award.name,"Description: "+award.description,"Category: "+(award.category||"Learning"),"Points: "+Number(award.points_value||0),"Awarded on: "+new Date(award.earned_at).toLocaleDateString(),"Awarded by: "+(award.awarded_by_name||"Dallyletter Elidems")]}
    ],watermark);
  }
  res.setHeader("Content-Type","application/pdf");
  res.setHeader("Content-Disposition",'attachment; filename="dallyletter-verified-'+row.document_type+'-'+row.document_id+'.pdf"');
  res.setHeader("Cache-Control","private, no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  res.send(pdf);
});

router.patch("/school-id/documents/:verificationId/revoke", requireAuth, async (req, res): Promise<void> => {
  await ensureSchema();
  const actor = req.currentUser!;
  if (!isOwnerRole(actor.role)) { res.status(403).json({ error: "Only the platform Owner can revoke academic document verification links." }); return; }
  const id = Number(req.params.verificationId);
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0,1000) : "";
  if (!Number.isSafeInteger(id) || id < 1 || reason.length < 3) { res.status(400).json({ error: "A valid verification ID and reason are required." }); return; }
  const result = await pool.query("UPDATE academic_document_verifications SET revoked_at=now(),revoked_by=$1,revocation_reason=$2 WHERE id=$3 AND revoked_at IS NULL RETURNING id,document_type,document_id", [actor.id,reason,id]);
  if (!result.rowCount) { res.status(404).json({ error: "Active document verification not found." }); return; }
  await db.insert(auditLogsTable).values({ performedBy: actor.id, action: "academic_document.share_revoked", category: "academic", targetType: result.rows[0].document_type, targetId: Number(result.rows[0].document_id), details: JSON.stringify({ verificationId:id,reason }) });
  res.json({ revoked:true,verificationId:id });
});

router.get("/school-id/me", requireAuth, async (req, res): Promise<void> => {
  await ensureSchema();
  const user = req.currentUser!;
  if (!["student", "learner"].includes(String(user.role).toLowerCase())) {
    res.status(403).json({ error: "School IDs are issued to learner accounts." }); return;
  }
  let result = await pool.query("SELECT school_id FROM learner_school_ids WHERE user_id=$1", [user.id]);
  if (!result.rows.length) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = createSchoolId();
      try {
        result = await pool.query(
          "INSERT INTO learner_school_ids(user_id,school_id) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET user_id=EXCLUDED.user_id RETURNING school_id",
          [user.id, code],
        );
        break;
      } catch (error: any) {
        if (error?.code !== "23505" || attempt === 3) throw error;
      }
    }
  }
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ schoolId: result.rows[0].school_id, verificationPath: "/verify/school/" + result.rows[0].school_id });
});

router.get("/school-id/verify/:schoolId", async (req, res): Promise<void> => {
  await ensureSchema();
  await pool.query("DELETE FROM learner_school_id_lookups WHERE requested_at < now()-interval '90 days'");
  const ipHash = createHash("sha256").update(String(req.ip || "unknown")).digest("hex");
  const recent = await pool.query(`SELECT count(*)::int AS count FROM learner_school_id_lookups WHERE ip_hash=$1 AND requested_at>now()-interval '1 minute'`, [ipHash]);
  if (Number(recent.rows[0]?.count || 0) >= 20) { res.status(429).json({ verified: false, error: "Too many verification attempts. Try again shortly." }); return; }
  const schoolId = (isValidSchoolId(req.params.schoolId) ? String(req.params.schoolId).toUpperCase() : null);
  if (!schoolId) {
    const invalidFingerprint = "INVALID:" + createHash("sha256").update(String(req.params.schoolId || "")).digest("hex");
    await pool.query("INSERT INTO learner_school_id_lookups(school_id,found,ip_hash) VALUES($1,false,$2)", [invalidFingerprint, ipHash]);
    res.status(404).json({ verified: false, error: "School ID not found." }); return;
  }
  const result = await pool.query(
    "SELECT s.user_id,u.name,u.role,u.grade,p.section_settings FROM learner_school_ids s JOIN users u ON u.id=s.user_id LEFT JOIN profile_privacy_settings p ON p.user_id=s.user_id WHERE s.school_id=$1 AND lower(u.role) IN ('student','learner') AND COALESCE(u.is_blocked,false)=false AND COALESCE(u.is_suspended,false)=false",
    [schoolId],
  );
  await pool.query("INSERT INTO learner_school_id_lookups(school_id,found,ip_hash) VALUES($1,$2,$3)", [schoolId, result.rows.length > 0, ipHash]);
  if (!result.rows.length) { res.status(404).json({ verified: false, error: "School ID not found." }); return; }
  const learner = result.rows[0];
  const settings = learner.section_settings || {};
  const isPublic = (key: string) => settings[key]?.mode === "everyone";
  const portfolio: Record<string, unknown> = {};
  const overviewPublished = isPublic("overview");
  const stripPrivateFields = (value: any): any => {
    if (Array.isArray(value)) return value.map(stripPrivateFields);
    if (!value || typeof value !== "object") return value;
    const blocked = /^(?:dob|dateofbirth|birthdate|phone|mobile|email|contact|address|guardian.*|parent.*|health.*|medical.*|admissionnumber|admissionno|emisno|nationalid|identitynumber|password|token|secret)$/i;
    return Object.fromEntries(Object.entries(value).filter(([key]) => !blocked.test(key.replace(/[_-]/g, ""))).map(([key, item]) => [key, stripPrivateFields(item)]));
  };
  if (isPublic("achievements")) {
    portfolio.achievements = (await pool.query(
      "SELECT a.name,a.description,a.category,ua.earned_at FROM user_achievements ua JOIN achievements a ON a.id=ua.achievement_id WHERE ua.user_id=$1 ORDER BY ua.earned_at DESC",
      [learner.user_id],
    )).rows;
  }
  if (isPublic("reports")) {
    portfolio.reports = (await pool.query(
      "SELECT id,report_type,term_label,period_start,period_end,draft_content,review_note,reviewed_at FROM academic_report_drafts WHERE learner_id=$1 AND status='approved' ORDER BY reviewed_at DESC NULLS LAST,created_at DESC LIMIT 100",
      [learner.user_id],
    )).rows.map(row => {
      const content = row.draft_content && typeof row.draft_content === "object" ? row.draft_content : {};
      const facts = content.factualRecords && typeof content.factualRecords === "object" ? content.factualRecords : {};
      return {
        id: row.id, reportType: row.report_type, termLabel: row.term_label,
        periodStart: row.period_start, periodEnd: row.period_end, reviewedAt: row.reviewed_at,
        learnerGrade: content.learnerGrade || null, academicYear: content.academicYear || null,
        factualRecords: stripPrivateFields(facts),
      };
    });
  }
  if (isPublic("attendance")) {
    portfolio.attendance = (await pool.query(
      "SELECT class_id,status,joined_at,left_at,duration_minutes,is_late FROM attendance WHERE student_id=$1 ORDER BY joined_at DESC LIMIT 500",
      [learner.user_id],
    )).rows;
  }
  if (isPublic("register")) {
    portfolio.attendanceRegister = (await pool.query(
      "SELECT attendance_date,status,activity_label FROM daily_app_attendance WHERE user_id=$1 ORDER BY attendance_date DESC LIMIT 120",
      [learner.user_id],
    )).rows;
  }
  if (isPublic("subjects")) {
    portfolio.subjects = (await pool.query("SELECT subjects FROM learner_subjects WHERE user_id=$1", [learner.user_id])).rows[0]?.subjects || [];
  }
  if (isPublic("transfers")) {
    portfolio.transfers = (await pool.query(
      "SELECT id,status,reviewed_at,created_at,form_data FROM academic_transfer_requests WHERE learner_id=$1 AND status='approved' ORDER BY reviewed_at DESC NULLS LAST LIMIT 50",
      [learner.user_id],
    )).rows.map(row => {
      const form = row.form_data && typeof row.form_data === "object" ? row.form_data : {};
      return {
        id: row.id, status: row.status, reviewedAt: row.reviewed_at, createdAt: row.created_at,
        currentSchool: form.currentSchool || null, receivingSchool: form.receivingSchool || null,
        grade: form.grade || null, academicYear: form.academicYear || null, effectiveDate: form.effectiveDate || null,
      };
    });
  }
  if (isPublic("enrollments")) {
    portfolio.enrollments = (await pool.query(
      "SELECT e.enrolled_at,e.progress_percent,e.status,c.title AS class_title,c.subject FROM enrollments e JOIN classes c ON c.id=e.class_id WHERE e.learner_id=$1 ORDER BY e.enrolled_at DESC",
      [learner.user_id],
    )).rows;
  }
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.json({
    verified: true,
    schoolId,
    learner: overviewPublished ? { name: learner.name, grade: learner.grade || null } : { name: "Privacy protected", grade: null },
    portfolio,
    privacy: { overviewPublished, sensitivePersonalDataShared: false, note: "Only academic sections explicitly set to Everyone are shown. Personal contact, guardian, identity and health fields are excluded from this public lookup." },
  });
});

export default router;
