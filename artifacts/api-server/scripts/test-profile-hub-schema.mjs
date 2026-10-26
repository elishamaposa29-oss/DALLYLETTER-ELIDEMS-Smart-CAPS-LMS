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
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='notification_email') AS notification_email`);
    const row = result.rows[0];
    assert(row?.qualifications, "teacher_qualifications table missing");
    assert(row?.subjects, "teacher_subjects table missing");
    assert(row?.payouts, "payout_preferences table missing");
    assert(row?.notification_email, "users.notification_email missing");
    console.log("Profile Hub additive schema smoke test passed.");
  } finally { await pool.end(); }
};
run().catch(error => { console.error(error); process.exitCode = 1; });
