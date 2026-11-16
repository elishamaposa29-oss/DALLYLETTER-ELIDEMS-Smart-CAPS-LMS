import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import { pool } from "@workspace/db";
import { requireAuth } from "../lib/auth-middleware";

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
  `).then(() => undefined).catch(error => { schemaReady = null; throw error; });
  await schemaReady;
}

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeCode(): string {
  const bytes = randomBytes(16);
  let raw = "";
  for (let i = 0; i < 16; i++) raw += alphabet[bytes[i] % alphabet.length];
  const checksum = createHash("sha256").update(raw).digest()[0] % alphabet.length;
  return "DL-" + raw + alphabet[checksum];
}
function validCode(value: unknown): string | null {
  const code = String(value || "").trim().toUpperCase();
  if (!/^DL-[A-HJ-NP-Z2-9]{17}$/.test(code)) return null;
  const raw = code.slice(3, 19);
  const check = alphabet[createHash("sha256").update(raw).digest()[0] % alphabet.length];
  return code[19] === check ? code : null;
}

router.get("/school-id/me", requireAuth, async (req, res): Promise<void> => {
  await ensureSchema();
  const user = req.currentUser!;
  if (!["student", "learner"].includes(String(user.role).toLowerCase())) {
    res.status(403).json({ error: "School IDs are issued to learner accounts." }); return;
  }
  let result = await pool.query("SELECT school_id FROM learner_school_ids WHERE user_id=$1", [user.id]);
  if (!result.rows.length) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = makeCode();
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
  const schoolId = validCode(req.params.schoolId);
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
