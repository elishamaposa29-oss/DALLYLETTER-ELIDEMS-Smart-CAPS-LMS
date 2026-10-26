import { pool } from "@workspace/db";
import { ensureProfileHubSchema } from "./ensureProfileHubSchema.js";

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const run = async () => {
  const original = process.env.DATABASE_URL;
  if (!original) throw new Error("DATABASE_URL is required; refusing to run against an unspecified database.");
  try {
    await ensureProfileHubSchema();
    const result = await pool.query(`SELECT
      to_regclass('public.teacher_qualifications') IS NOT NULL AS qualifications,
      to_regclass('public.teacher_subjects') IS NOT NULL AS subjects,
      to_regclass('public.payout_preferences') IS NOT NULL AS payouts,
      to_regclass('public.teacher_documents') IS NOT NULL AS documents,
      to_regclass('public.enrollments') IS NOT NULL AS enrollments,
      to_regclass('public.notification_email_verifications') IS NOT NULL AS email_verifications,
      to_regclass('public.payout_history') IS NOT NULL AS payout_history,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='notification_email') AS notification_email,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='teacher_documents' AND column_name='storage_key') AS document_storage_key`);
    const row = result.rows[0];
    assert(row?.qualifications, "teacher_qualifications table missing");
    assert(row?.subjects, "teacher_subjects table missing");
    assert(row?.payouts, "payout_preferences table missing");
    assert(row?.documents, "teacher_documents table missing");
    assert(row?.enrollments, "enrollments table missing");
    assert(row?.email_verifications, "notification_email_verifications table missing");
    assert(row?.payout_history, "payout_history table missing");
    assert(row?.document_storage_key, "teacher_documents.storage_key missing");
    assert(row?.notification_email, "users.notification_email missing");
    console.log("Profile Hub additive schema smoke test passed.");
  } finally { await pool.end(); }
};
run().catch(error => { console.error(error); process.exitCode = 1; });
