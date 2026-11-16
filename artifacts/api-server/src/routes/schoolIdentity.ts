import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import { pool } from "@workspace/db";
import { requireAuth } from "../lib/auth-middleware";

const router = Router();
let schemaReady: Promise<void> | null = null;
async function ensureSchema(): Promise<void> {
  if (!schemaReady) schemaReady = pool.query(`
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
      requested_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS learner_school_id_lookups_time_idx ON learner_school_id_lookups(requested_at DESC);
  `).then(() => undefined).catch(error => { schemaReady = null; throw error; });
  await schemaReady;
}

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeCode(): string {
  const bytes = randomBytes(10);
  let raw = "";
  for (let i = 0; i < 10; i++) raw += alphabet[bytes[i] % alphabet.length];
  const checksum = createHash("sha256").update(raw).digest()[0] % alphabet.length;
  return "DL-" + raw + alphabet[checksum];
}
function validCode(value: unknown): string | null {
  const code = String(value || "").trim().toUpperCase();
  if (!/^DL-[A-HJ-NP-Z2-9]{11}$/.test(code)) return null;
  const raw = code.slice(3, 13);
  const check = alphabet[createHash("sha256").update(raw).digest()[0] % alphabet.length];
  return code[13] === check ? code : null;
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
  const schoolId = validCode(req.params.schoolId);
  if (!schoolId) { res.status(404).json({ verified: false, error: "School ID not found." }); return; }
  const result = await pool.query(
    "SELECT s.user_id,u.name,u.role,u.grade,p.section_settings FROM learner_school_ids s JOIN users u ON u.id=s.user_id LEFT JOIN profile_privacy_settings p ON p.user_id=s.user_id WHERE s.school_id=$1 AND lower(u.role) IN ('student','learner') AND u.is_blocked=false AND u.is_suspended=false",
    [schoolId],
  );
  await pool.query("INSERT INTO learner_school_id_lookups(school_id,found) VALUES($1,$2)", [schoolId, result.rows.length > 0]);
  if (!result.rows.length) { res.status(404).json({ verified: false, error: "School ID not found." }); return; }
  const learner = result.rows[0];
  const settings = learner.section_settings || {};
  const isPublic = (key: string) => settings[key]?.mode === "everyone";
  const portfolio: Record<string, unknown> = {};
  if (isPublic("overview")) portfolio.overview = { learnerName: learner.name, grade: learner.grade || null };
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
    )).rows;
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
  if (isPublic("enrollments")) {
    portfolio.enrollments = (await pool.query(
      "SELECT e.enrolled_at,e.progress_percent,e.status,c.title AS class_title,c.subject FROM enrollments e JOIN classes c ON c.id=e.class_id WHERE e.learner_id=$1 ORDER BY e.enrolled_at DESC",
      [learner.user_id],
    )).rows;
  }
  if (settings.sensitive_personal_data_consent?.enabled === true) {
    portfolio.sensitivePersonalDataConsent = { approved: true, consentUpdatedAt: settings.sensitive_personal_data_consent.updatedAt || null };
  }
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.json({
    verified: true,
    schoolId,
    learner: { name: learner.name, grade: learner.grade || null },
    portfolio,
    privacy: { sensitivePersonalDataShared: false, note: "Only academic sections explicitly set to Everyone are shown. Sensitive personal fields are not included in this public lookup." },
  });
});

export default router;
