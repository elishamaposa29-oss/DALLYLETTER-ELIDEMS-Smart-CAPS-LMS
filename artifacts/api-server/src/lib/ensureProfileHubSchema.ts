import { pool } from "@workspace/db";

let ensured = false;

/** Additive, idempotent Profile Hub schema. Does not modify or delete users. */
export async function ensureProfileHubSchema(): Promise<void> {
  if (ensured) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_email text");
    await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_email_verified_at timestamptz");
    await client.query(`CREATE TABLE IF NOT EXISTS teacher_documents (
      id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      document_type text NOT NULL, file_name text NOT NULL, mime_type text NOT NULL,
      size_bytes integer NOT NULL, data bytea NOT NULL DEFAULT decode('', 'hex'), storage_key text, created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query("CREATE INDEX IF NOT EXISTS teacher_documents_user_idx ON teacher_documents(user_id)");
    await client.query("ALTER TABLE teacher_documents ADD COLUMN IF NOT EXISTS storage_key text");
    await client.query(`CREATE TABLE IF NOT EXISTS teacher_qualifications (
      id serial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title text NOT NULL,
      institution text,
      year integer CHECK (year IS NULL OR year BETWEEN 1900 AND 2200),
      verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified')),
      document_id integer REFERENCES teacher_documents(id) ON DELETE SET NULL,
      source text NOT NULL DEFAULT 'user',
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query("CREATE INDEX IF NOT EXISTS teacher_qualifications_user_idx ON teacher_qualifications(user_id)");
    await client.query("ALTER TABLE teacher_qualifications ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending'");
    await client.query("ALTER TABLE teacher_qualifications DROP CONSTRAINT IF EXISTS teacher_qualifications_verification_status_check");
    await client.query("ALTER TABLE teacher_qualifications ADD CONSTRAINT teacher_qualifications_verification_status_check CHECK (verification_status IN ('pending','verified','rejected'))");
    await client.query(`CREATE TABLE IF NOT EXISTS enrollments (
      id serial PRIMARY KEY,
      learner_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      class_id integer NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      enrolled_at timestamptz NOT NULL DEFAULT now(),
      progress_percent integer NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
      status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
      UNIQUE (learner_id, class_id)
    )`);
    await client.query("CREATE INDEX IF NOT EXISTS enrollments_learner_idx ON enrollments(learner_id, enrolled_at DESC)");
    await client.query(`CREATE TABLE IF NOT EXISTS notification_email_verifications (
      user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      email text NOT NULL,
      otp_hash text NOT NULL,
      expires_at timestamptz NOT NULL,
      attempts integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS payout_history (
      id serial PRIMARY KEY,
      teacher_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount numeric(12,2) NOT NULL CHECK (amount > 0),
      currency text NOT NULL DEFAULT 'USD',
      method text NOT NULL,
      provider_reference text,
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed')),
      webhook_verified boolean NOT NULL DEFAULT false,
      note text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query("CREATE UNIQUE INDEX IF NOT EXISTS payout_history_provider_reference_idx ON payout_history(provider_reference) WHERE provider_reference IS NOT NULL");
    await client.query(`CREATE TABLE IF NOT EXISTS email_notification_queue (
      id bigserial PRIMARY KEY,
      recipient_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject text NOT NULL,
      body_text text NOT NULL,
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed')),
      attempts integer NOT NULL DEFAULT 0,
      available_at timestamptz NOT NULL DEFAULT now(),
      sent_at timestamptz,
      last_error text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query("CREATE INDEX IF NOT EXISTS email_notification_queue_pending_idx ON email_notification_queue(status,available_at)");
    await client.query(`CREATE TABLE IF NOT EXISTS teacher_subjects (
      user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      teaching_subjects text[] NOT NULL DEFAULT '{}',
      subjects_to_teach text[] NOT NULL DEFAULT '{}',
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS payout_preferences (
      user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      method text NOT NULL CHECK (method IN ('ecocash','paypal','bank')),
      ecocash_phone text, paypal_email text, bank_name text, account_name_holder text,
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK (
        (method = 'ecocash' AND ecocash_phone IS NOT NULL AND length(trim(ecocash_phone)) BETWEEN 7 AND 40)
        OR (method = 'paypal' AND paypal_email IS NOT NULL AND length(trim(paypal_email)) <= 254)
        OR (method = 'bank' AND bank_name IS NOT NULL AND account_name_holder IS NOT NULL)
      )
    )`);
    // Legacy CV-to-qualification reconciliation is deliberately NOT run during server startup.
    // It requires a verified staging schema mapping and a separately approved, idempotent job.
    await client.query("COMMIT");
    ensured = true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
