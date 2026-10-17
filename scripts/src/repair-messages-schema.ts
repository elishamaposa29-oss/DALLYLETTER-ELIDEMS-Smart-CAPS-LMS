import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "@workspace/db";
import { migrateExerciseSchema } from "./exercise-schema.js";

async function repairMessagesSchema(): Promise<void> {
  const { rows } = await pool.query<{ users_table: string | null }>(`
    SELECT to_regclass('public.users')::text AS users_table
  `);

  // A brand-new PostgreSQL instance has no application schema at all. Bootstrap
  // the canonical Drizzle schema before any ALTER/seed commands run. This is
  // intentionally conditional: do not push/reconcile the whole schema on a
  // database that already has the core users table.
  if (!rows[0]?.users_table) {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    console.log("Fresh database detected; initializing the canonical application schema.");
    execFileSync("pnpm", ["run", "db:push"], {
      cwd: repoRoot,
      stdio: "inherit",
      env: process.env,
    });
  }

  // Keep this repair independently safe on a partially provisioned database.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id serial PRIMARY KEY,
      sender_id integer NOT NULL REFERENCES users(id),
      sender_name text NOT NULL,
      sender_role text NOT NULL,
      content text NOT NULL,
      type text NOT NULL DEFAULT 'text',
      media_url text,
      group_id integer,
      parent_message_id integer,
      recipient_id integer,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS parent_message_id integer
  `);
  console.log("Verified messages table and parent_message_id.");
  await migrateExerciseSchema();
}

try {
  await repairMessagesSchema();
} finally {
  await pool.end();
}
