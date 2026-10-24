import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

// Detailed schema verification is deliberately separate from basic liveness.
// CI, local development, and platform health probes use /healthz and should
// only require a reachable database. Production verification uses /healthz/schema.
const requiredTables = [
  "users", "lessons", "exercises", "exercise_questions", "exercise_options", "exercise_submissions", "exercise_answers", "exercise_media", "assignment_submissions", "messages",
  "lesson_requests", "group_member_controls", "group_settings",
  "chat_polls", "chat_poll_options", "chat_poll_votes",
  "chat_broadcasts", "chat_broadcast_recipients",
  "chat_communities", "chat_community_groups",
  "content_permission_requests", "message_media",
  "push_subscriptions", "teacher_documents",
  "assignments", "hand_raises", "study_groups", "media_object_chunks"
];

const requiredColumns: Array<[string, string]> = [
  ["users", "avatar_url"],
  ["assignments", "reference_material_hidden"],
  ["hand_raises", "media_url"],
  ["hand_raises", "media_owned"],
  ["notifications", "push_sent_at"],
  ["notifications", "push_attempts"],
  ["notifications", "push_next_attempt_at"],
  ["notifications", "push_last_error"],
  ["media_object_chunks", "storage_key"],
  ["media_object_chunks", "mime_type"],
  ["media_object_chunks", "size_bytes"],
  ["media_object_chunks", "chunk_index"],
  ["media_object_chunks", "data"],
  ["media_object_chunks", "created_at"]
];

router.get("/healthz", async (_req, res): Promise<void> => {
  try {
    await pool.query("SELECT 1");
    res.json(HealthCheckResponse.parse({ status: "ok" }));
  } catch {
    res.status(503).json({
      status: "error",
      error: "Database connection unavailable"
    });
  }
});

router.get("/healthz/schema", async (_req, res): Promise<void> => {
  try {
    await pool.query("SELECT 1");
    const tables = await pool.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_type = 'BASE TABLE'
         AND table_name = ANY($1::text[])`,
      [requiredTables]
    );
    const foundTables = new Set(tables.rows.map((row: { table_name: string }) => row.table_name));
    const missingTables = requiredTables.filter((name) => !foundTables.has(name));

    const columns = await pool.query(
      `SELECT e.table_name, e.column_name
       FROM unnest($1::text[], $2::text[]) AS e(table_name, column_name)
       LEFT JOIN information_schema.columns c
         ON c.table_schema = 'public'
        AND c.table_name = e.table_name
        AND c.column_name = e.column_name
       WHERE c.column_name IS NULL`,
      [requiredColumns.map(([table]) => table), requiredColumns.map(([, column]) => column)]
    );

    if (missingTables.length > 0 || columns.rows.length > 0) {
      // Table/column identifiers are safe diagnostics; never include database
      // hostnames, credentials, or query values in this public health response.
      res.status(503).json({
        status: "error",
        schema: "incomplete",
        missingTables,
        missingColumns: columns.rows.map((row: { table_name: string; column_name: string }) => ({
          table: row.table_name,
          column: row.column_name
        })),
        error: "Production database schema verification failed"
      });
      return;
    }

    res.json({ status: "ok", schema: "ok" });
  } catch {
    res.status(503).json({
      status: "error",
      schema: "unavailable",
      error: "Production database connection or schema verification failed"
    });
  }
});

export default router;
