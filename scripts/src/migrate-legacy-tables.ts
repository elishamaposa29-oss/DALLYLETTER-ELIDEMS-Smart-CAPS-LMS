import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pool } from "@workspace/db";

const migrationPath = fileURLToPath(new URL("../../lib/db/migrations/0001_legacy_tables.sql", import.meta.url));

try {
  const migration = await readFile(migrationPath, "utf8");
  if (!migration.trim()) throw new Error("Legacy-table migration file is empty.");
  await pool.query(migration);
  const expected = [
    "content_permission_requests",
    "message_media",
    "push_subscriptions",
    "teacher_documents",
  ];
  const result = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])",
    [expected],
  );
  const present = new Set(result.rows.map((row: { table_name: string }) => row.table_name));
  const missing = expected.filter((table) => !present.has(table));
  if (missing.length) throw new Error("Legacy-table migration did not create: " + missing.join(", "));
  console.log("LEGACY_TABLES_MIGRATION: PASS (4 required tables present)");
} finally {
  await pool.end();
}
