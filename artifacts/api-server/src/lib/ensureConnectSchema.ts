import { pool } from "@workspace/db";

let ensured = false;

export async function ensureConnectSchema(): Promise<void> {
  if (ensured) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`ALTER TABLE exercise_submissions ADD COLUMN IF NOT EXISTS overall_comment text`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS teacher_application_status text NOT NULL DEFAULT 'not_applicable'`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS teacher_review_deadline timestamptz`);

    await client.query(`CREATE TABLE IF NOT EXISTS teacher_documents (
      id serial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      document_type text NOT NULL,
      file_name text NOT NULL,
      mime_type text NOT NULL,
      size_bytes integer NOT NULL,
      data bytea NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS teacher_documents_user_idx ON teacher_documents(user_id)`);
    await client.query(`CREATE TABLE IF NOT EXISTS push_subscriptions (
      id serial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint text NOT NULL UNIQUE,
      p256dh text NOT NULL,
      auth text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions(user_id)`);
    await client.query(`CREATE TABLE IF NOT EXISTS message_media (
      storage_key text PRIMARY KEY,
      message_id integer,
      mime_type text NOT NULL,
      size_bytes integer NOT NULL,
      data bytea NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS message_media_message_id_idx ON message_media(message_id)`);

    // The CI database and some fresh deployments may contain the core users table
    // without the optional notifications table. Create the canonical table first,
    // then safely extend it. This is idempotent and matches lib/db schema.
    await client.query(`CREATE TABLE IF NOT EXISTS notifications (
      id serial PRIMARY KEY,
      recipient_id integer,
      title text NOT NULL,
      message text NOT NULL,
      link text,
      type text NOT NULL DEFAULT 'general',
      is_read boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link text`);
    await client.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS push_sent_at timestamptz`);
    await client.query(`CREATE INDEX IF NOT EXISTS notifications_push_pending_idx ON notifications(id) WHERE push_sent_at IS NULL`);
    await client.query(`ALTER TABLE group_member_controls ADD COLUMN IF NOT EXISTS can_manage_settings boolean NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE poll_questions ADD COLUMN IF NOT EXISTS image_url text`);

    await client.query(`CREATE TABLE IF NOT EXISTS lesson_requests (
      id serial PRIMARY KEY,
      prefect_id integer NOT NULL REFERENCES users(id),
      teacher_id integer NOT NULL REFERENCES users(id),
      topic text NOT NULL,
      notes text,
      preferred_date text,
      status text NOT NULL DEFAULT 'pending',
      teacher_reply text,
      response_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS group_member_controls (
      id serial PRIMARY KEY,
      group_id integer NOT NULL REFERENCES study_groups(id),
      user_id integer NOT NULL REFERENCES users(id),
      blocked boolean NOT NULL DEFAULT false,
      media_blocked boolean NOT NULL DEFAULT false,
      suspended boolean NOT NULL DEFAULT false,
      muted boolean NOT NULL DEFAULT false,
      reason text,
      updated_by integer REFERENCES users(id),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(group_id, user_id)
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS group_settings (
      id serial PRIMARY KEY,
      group_id integer NOT NULL REFERENCES study_groups(id),
      rules text,
      announcements_only boolean NOT NULL DEFAULT false,
      allow_polls boolean NOT NULL DEFAULT true,
      allow_media boolean NOT NULL DEFAULT true,
      max_members integer NOT NULL DEFAULT 1024,
      updated_by integer REFERENCES users(id),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(group_id)
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS chat_polls (
      id serial PRIMARY KEY,
      group_id integer REFERENCES study_groups(id),
      creator_id integer NOT NULL REFERENCES users(id),
      question text NOT NULL,
      allow_multiple boolean NOT NULL DEFAULT false,
      anonymous boolean NOT NULL DEFAULT false,
      closed boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS chat_poll_options (
      id serial PRIMARY KEY,
      poll_id integer NOT NULL REFERENCES chat_polls(id),
      label text NOT NULL
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS chat_poll_votes (
      id serial PRIMARY KEY,
      poll_id integer NOT NULL REFERENCES chat_polls(id),
      option_id integer NOT NULL REFERENCES chat_poll_options(id),
      user_id integer NOT NULL REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(poll_id, option_id, user_id)
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS chat_broadcasts (
      id serial PRIMARY KEY,
      sender_id integer NOT NULL REFERENCES users(id),
      name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS chat_broadcast_recipients (
      id serial PRIMARY KEY,
      broadcast_id integer NOT NULL REFERENCES chat_broadcasts(id),
      user_id integer NOT NULL REFERENCES users(id),
      UNIQUE(broadcast_id, user_id)
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS chat_communities (
      id serial PRIMARY KEY,
      name text NOT NULL,
      description text,
      owner_id integer NOT NULL REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS chat_community_groups (
      id serial PRIMARY KEY,
      community_id integer NOT NULL REFERENCES chat_communities(id),
      group_id integer NOT NULL REFERENCES study_groups(id),
      UNIQUE(community_id, group_id)
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS follows (
      id serial PRIMARY KEY,
      follower_id integer NOT NULL REFERENCES users(id),
      target_type text NOT NULL,
      target_user_id integer REFERENCES users(id),
      target_key text,
      target_name text NOT NULL,
      notifications_enabled boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(follower_id, target_type, target_user_id, target_key)
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS notification_preferences (
      id serial PRIMARY KEY,
      user_id integer NOT NULL UNIQUE REFERENCES users(id),
      push_enabled boolean NOT NULL DEFAULT true,
      sound_enabled boolean NOT NULL DEFAULT true,
      follow_notifications_enabled boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS content_comments (
      id serial PRIMARY KEY,
      author_id integer NOT NULL REFERENCES users(id),
      content_type text NOT NULL,
      content_id integer NOT NULL,
      body text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS moderation_actions (
      id serial PRIMARY KEY,
      actor_id integer NOT NULL REFERENCES users(id),
      target_user_id integer NOT NULL REFERENCES users(id),
      action text NOT NULL,
      note text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query("COMMIT");
    ensured = true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
