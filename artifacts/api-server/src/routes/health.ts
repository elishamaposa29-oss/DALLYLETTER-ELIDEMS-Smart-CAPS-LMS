import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

// Keep this list aligned with the production schema required by the mobile and web
// clients. This endpoint returns only a pass/fail state, never schema details.
const requiredTables = [
  "users", "lessons", "exercises", "submissions", "messages",
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
    const tables = await pool.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_type = 'BASE TABLE'
         AND table_name = ANY($1::text[])`,
      [requiredTables]
    );
    const foundTables = new Set(tables.rows.map((row: { table_name: string }) => row.table_name));
    const missingTables = requiredTables.some((name) => !foundTables.has(name));

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

    if (missingTables || columns.rows.length > 0) {
      res.status(503).json({ status: "error", schema: "incomplete", error: "Production database schema verification failed" });
      return;
    }

    const data = HealthCheckResponse.parse({ status: "ok" });
    res.json({ ...data, schema: "ok" });
  } catch {
    res.status(503).json({
      status: "error",
      schema: "unavailable",
      error: "Production database connection or schema verification failed"
    });
  }
});

export default router;
