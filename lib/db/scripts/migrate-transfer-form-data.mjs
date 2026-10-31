import pg from "pg";

const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the transfer form-data migration.");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`CREATE TABLE IF NOT EXISTS academic_transfer_requests (
      id bigserial PRIMARY KEY,
      learner_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      requested_by integer NOT NULL REFERENCES users(id),
      reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 2000),
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      reviewed_by integer REFERENCES users(id),
      review_note text,
      reviewed_at timestamptz,
      approved_document text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query("ALTER TABLE academic_transfer_requests ADD COLUMN IF NOT EXISTS form_data jsonb NOT NULL DEFAULT '{}'::jsonb");
    const verified = await client.query(`
      SELECT data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='academic_transfer_requests' AND column_name='form_data'
    `);
    if (verified.rowCount !== 1 || verified.rows[0].data_type !== "jsonb" || verified.rows[0].is_nullable !== "NO") {
      throw new Error("academic_transfer_requests.form_data migration verification failed");
    }
    await client.query("COMMIT");
    console.log("TRANSFER_FORM_DATA_MIGRATION: PASS (additive, idempotent JSONB column verified)");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

migrate().catch((error) => {
  console.error("TRANSFER_FORM_DATA_MIGRATION: FAIL", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
}).finally(() => pool.end());
