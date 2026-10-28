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
    await client.query("ALTER TABLE teacher_subjects ADD COLUMN IF NOT EXISTS primary_subject text");
    await client.query(`CREATE TABLE IF NOT EXISTS learner_subjects (
      user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      subjects text[] NOT NULL DEFAULT '{}',
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query("CREATE INDEX IF NOT EXISTS learner_subjects_gin_idx ON learner_subjects USING gin(subjects)");
    await client.query(`CREATE TABLE IF NOT EXISTS google_account_links (
      user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      google_sub text NOT NULL UNIQUE,
      email text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
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
    await client.query(`CREATE TABLE IF NOT EXISTS account_email_status (
      user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      email text NOT NULL,
      verified_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query("CREATE INDEX IF NOT EXISTS account_email_status_email_idx ON account_email_status(lower(email))");
    await client.query(`CREATE TABLE IF NOT EXISTS account_email_tokens (
      token_hash text PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose text NOT NULL CHECK (purpose IN ('signup','email_change')),
      email text NOT NULL,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query("CREATE INDEX IF NOT EXISTS account_email_tokens_user_idx ON account_email_tokens(user_id, purpose)");
    await client.query("CREATE INDEX IF NOT EXISTS account_email_tokens_expiry_idx ON account_email_tokens(expires_at)");
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
    await client.query("CREATE INDEX IF NOT EXISTS academic_transfer_requests_learner_idx ON academic_transfer_requests(learner_id, created_at DESC)");
    await client.query("CREATE INDEX IF NOT EXISTS academic_transfer_requests_status_idx ON academic_transfer_requests(status, created_at DESC)");
    await client.query(`CREATE TABLE IF NOT EXISTS academic_report_drafts (
      id bigserial PRIMARY KEY,
      learner_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_by integer NOT NULL REFERENCES users(id),
      report_type text NOT NULL CHECK (report_type IN ('attendance_register','term_performance')),
      term_label text NOT NULL CHECK (length(trim(term_label)) BETWEEN 1 AND 80),
      source_snapshot jsonb NOT NULL,
      draft_content jsonb NOT NULL,
      status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','approved','rejected')),
      reviewed_by integer REFERENCES users(id),
      review_note text,
      reviewed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query("CREATE INDEX IF NOT EXISTS academic_report_drafts_learner_idx ON academic_report_drafts(learner_id, created_at DESC)");
    await client.query("CREATE INDEX IF NOT EXISTS academic_report_drafts_review_idx ON academic_report_drafts(status, created_at DESC)");

    // Additive daily app-access attendance. Separate from class-session attendance.
    await client.query(`CREATE TABLE IF NOT EXISTS user_attendance_preferences (
      user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      time_zone text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS daily_app_attendance (
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      attendance_date date NOT NULL,
      time_zone text NOT NULL,
      status text NOT NULL CHECK (status IN ('present','absent')),
      open_count integer NOT NULL DEFAULT 0 CHECK (open_count >= 0),
      first_open_at timestamptz,
      last_open_at timestamptz,
      last_source text NOT NULL DEFAULT 'web' CHECK (last_source IN ('web','android','other','system')),
      activity_label text NOT NULL DEFAULT 'Absent',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, attendance_date),
      CHECK ((status = 'present' AND open_count >= 1 AND first_open_at IS NOT NULL) OR status = 'absent')
    )`);
    await client.query("CREATE INDEX IF NOT EXISTS daily_app_attendance_date_idx ON daily_app_attendance(attendance_date DESC, status)");
    await client.query("CREATE INDEX IF NOT EXISTS daily_app_attendance_user_idx ON daily_app_attendance(user_id, attendance_date DESC)");

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
