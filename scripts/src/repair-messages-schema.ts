import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "@workspace/db";
import { migrateExerciseSchema } from "./exercise-schema.js";

async function repairMessagesSchema(): Promise<void> {
  const { rows } = await pool.query<{ users_table: string | null; messages_table: string | null }>(`
    SELECT
      to_regclass('public.users')::text AS users_table,
      to_regclass('public.messages')::text AS messages_table
  `);

  // A new Render PostgreSQL instance has no app tables. Initialize the canonical
  // Drizzle schema only when the core users table is absent; never reset an
  // existing database just because an optional table is missing.
  if (!rows[0]?.users_table) {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    console.log("Fresh PostgreSQL database detected; initializing canonical schema.");
    execFileSync("pnpm", ["run", "db:push"], { cwd: repoRoot, stdio: "inherit", env: process.env });
  }

  // Repair a partial schema without losing data. Definitions follow
  // lib/db/src/schema/messages.ts; all operations are safe to rerun.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.messages (
      id serial PRIMARY KEY,
      sender_id integer NOT NULL REFERENCES public.users(id),
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
  await pool.query("ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS parent_message_id integer");
  console.log("Verified messages schema.");
  await migrateExerciseSchema();
}

try {
  await repairMessagesSchema();
} finally {
  await pool.end();
}
