import { pool } from "@workspace/db";
import { removeStoredMedia } from "./media-storage";

export const RETENTION_CATEGORIES = [
  "notifications",
  "lessons",
  "exercises",
  "study_groups",
  "messages",
  "polls",
  "media",
  "assignments",
] as const;
export type RetentionCategory = typeof RETENTION_CATEGORIES[number];

export type RetentionPolicy = {
  enabled: boolean;
  categories: RetentionCategory[];
  retentionDays: number;
  intervalHours: number;
  nextRunAt: string | null;
  lastRunAt: string | null;
  updatedAt: string | null;
  updatedBy: number | null;
};

const CATEGORY_LABELS: Record<RetentionCategory, string> = {
  notifications: "Read, non-financial notifications",
  lessons: "Old text-only lessons without exercises or media",
  exercises: "Unpublished draft exercises without submissions or media",
  study_groups: "Empty study groups with no messages, polls or community links",
  messages: "Old group text messages without media attachments",
  polls: "Closed, non-auto-marked study-group polls",
  media: "Orphaned exercise-media objects with no activity references",
  assignments: "Draft/cancelled assignments without learner submissions",
};

export async function ensureRetentionSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS owner_retention_policies (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      categories JSONB NOT NULL DEFAULT '[]'::jsonb,
      retention_days INTEGER NOT NULL DEFAULT 180 CHECK (retention_days BETWEEN 30 AND 3650),
      interval_hours INTEGER NOT NULL DEFAULT 24 CHECK (interval_hours BETWEEN 6 AND 168),
      next_run_at TIMESTAMPTZ,
      last_run_at TIMESTAMPTZ,
      updated_by INTEGER REFERENCES users(id),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS owner_retention_previews (
      id TEXT PRIMARY KEY,
      created_by INTEGER NOT NULL REFERENCES users(id),
      categories JSONB NOT NULL,
      retention_days INTEGER NOT NULL,
      eligible_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      used_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS owner_retention_runs (
      id BIGSERIAL PRIMARY KEY,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      finished_at TIMESTAMPTZ,
      triggered_by INTEGER REFERENCES users(id),
      trigger_type TEXT NOT NULL CHECK (trigger_type IN ('manual','scheduled')),
      category_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'running',
      error TEXT
    );
    INSERT INTO owner_retention_policies (id,enabled,categories,retention_days,interval_hours)
    VALUES (1,FALSE,'[]'::jsonb,180,24)
    ON CONFLICT (id) DO NOTHING;
  `);
}

function validCategories(value: unknown): RetentionCategory[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is RetentionCategory =>
    typeof item === "string" && (RETENTION_CATEGORIES as readonly string[]).includes(item),
  ))];
}

export async function getRetentionPolicy(): Promise<RetentionPolicy> {
  await ensureRetentionSchema();
  const { rows } = await pool.query("SELECT enabled,categories,retention_days,interval_hours,next_run_at,last_run_at,updated_at,updated_by FROM owner_retention_policies WHERE id=1");
  const row = rows[0];
  return {
    enabled: Boolean(row?.enabled),
    categories: validCategories(row?.categories),
    retentionDays: Number(row?.retention_days ?? 180),
    intervalHours: Number(row?.interval_hours ?? 24),
    nextRunAt: row?.next_run_at ? new Date(row.next_run_at).toISOString() : null,
    lastRunAt: row?.last_run_at ? new Date(row.last_run_at).toISOString() : null,
    updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
    updatedBy: row?.updated_by == null ? null : Number(row.updated_by),
  };
}

function cutoffFor(days: number): Date {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  return cutoff;
}

async function categoryCount(client: any, category: RetentionCategory, cutoff: Date): Promise<number> {
  const queries: Record<RetentionCategory, string> = {
    notifications: "SELECT count(*)::int AS count FROM notifications WHERE is_read=TRUE AND created_at<$1 AND type NOT ILIKE 'payment%' AND type NOT ILIKE '%academic%' AND type NOT ILIKE '%teacher%' AND type NOT ILIKE '%transfer%'",
    lessons: "SELECT count(*)::int AS count FROM lessons l WHERE l.created_at<$1 AND lower(l.type)='notes' AND l.media_url IS NULL AND NOT EXISTS (SELECT 1 FROM exercises e WHERE e.lesson_id=l.id)",
    exercises: "SELECT count(*)::int AS count FROM exercises e WHERE e.created_at<$1 AND lower(e.status)='draft' AND NOT EXISTS (SELECT 1 FROM exercise_submissions s WHERE s.exercise_id=e.id) AND NOT EXISTS (SELECT 1 FROM exercise_media m WHERE m.exercise_id=e.id)",
    study_groups: "SELECT count(*)::int AS count FROM study_groups g WHERE g.created_at<$1 AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.group_id=g.id) AND NOT EXISTS (SELECT 1 FROM chat_polls p WHERE p.group_id=g.id) AND NOT EXISTS (SELECT 1 FROM chat_community_groups cg WHERE cg.group_id=g.id) AND (SELECT count(*) FROM study_group_members gm WHERE gm.group_id=g.id)<=1",
    messages: "SELECT count(*)::int AS count FROM messages m WHERE m.group_id IS NOT NULL AND m.media_url IS NULL AND m.created_at<$1 AND NOT EXISTS (SELECT 1 FROM messages reply WHERE reply.parent_message_id=m.id)",
    polls: "SELECT count(*)::int AS count FROM chat_polls WHERE closed=TRUE AND auto_mark=FALSE AND created_at<$1",
    media: "SELECT count(*)::int AS count FROM exercise_media WHERE exercise_id IS NULL AND question_id IS NULL AND answer_id IS NULL AND created_at<$1",
    assignments: "SELECT count(*)::int AS count FROM assignments a WHERE a.created_at<$1 AND lower(a.status) IN ('draft','cancelled') AND NOT EXISTS (SELECT 1 FROM assignment_submissions s WHERE s.assignment_id=a.id)",
  };
  const result = await client.query(queries[category], [cutoff]);
  return Number(result.rows[0]?.count ?? 0);
}

export async function previewRetention(days: number, categories: RetentionCategory[]) {
  const cutoff = cutoffFor(days);
  const client = await pool.connect();
  try {
    const counts: Record<string, { eligible: number; description: string }> = {};
    for (const category of categories) {
      counts[category] = {
        eligible: await categoryCount(client, category, cutoff),
        description: CATEGORY_LABELS[category],
      };
    }
    return { cutoff: cutoff.toISOString(), retentionDays: days, counts, totalEligible: Object.values(counts).reduce((sum, item) => sum + item.eligible, 0) };
  } finally {
    client.release();
  }
}

async function deleteCategory(client: any, category: RetentionCategory, cutoff: Date): Promise<number> {
  if (category === "notifications") {
    const r = await client.query("DELETE FROM notifications WHERE id IN (SELECT id FROM notifications WHERE is_read=TRUE AND created_at<$1 AND type NOT ILIKE 'payment%' AND type NOT ILIKE '%academic%' AND type NOT ILIKE '%teacher%' AND type NOT ILIKE '%transfer%' ORDER BY created_at LIMIT 5000) RETURNING id", [cutoff]);
    return r.rowCount ?? 0;
  }
  if (category === "messages") {
    const r = await client.query("DELETE FROM messages WHERE id IN (SELECT m.id FROM messages m WHERE m.group_id IS NOT NULL AND m.media_url IS NULL AND m.created_at<$1 AND NOT EXISTS (SELECT 1 FROM messages reply WHERE reply.parent_message_id=m.id) ORDER BY m.created_at LIMIT 5000) RETURNING id", [cutoff]);
    return r.rowCount ?? 0;
  }
  if (category === "polls") {
    const selected = await client.query("SELECT id FROM chat_polls WHERE closed=TRUE AND auto_mark=FALSE AND created_at<$1 ORDER BY created_at LIMIT 1000 FOR UPDATE", [cutoff]);
    const ids = selected.rows.map((row: any) => Number(row.id));
    if (!ids.length) return 0;
    await client.query("DELETE FROM chat_poll_votes WHERE poll_id=ANY($1::int[])", [ids]);
    await client.query("DELETE FROM chat_poll_options WHERE poll_id=ANY($1::int[])", [ids]);
    const deleted = await client.query("DELETE FROM chat_polls WHERE id=ANY($1::int[]) RETURNING id", [ids]);
    return deleted.rowCount ?? 0;
  }
  if (category === "exercises") {
    const r = await client.query("DELETE FROM exercises e WHERE e.id IN (SELECT e2.id FROM exercises e2 WHERE e2.created_at<$1 AND lower(e2.status)='draft' AND NOT EXISTS (SELECT 1 FROM exercise_submissions s WHERE s.exercise_id=e2.id) AND NOT EXISTS (SELECT 1 FROM exercise_media m WHERE m.exercise_id=e2.id) ORDER BY e2.created_at LIMIT 1000) RETURNING e.id", [cutoff]);
    return r.rowCount ?? 0;
  }
  if (category === "assignments") {
    const r = await client.query("DELETE FROM assignments a WHERE a.id IN (SELECT a2.id FROM assignments a2 WHERE a2.created_at<$1 AND lower(a2.status) IN ('draft','cancelled') AND NOT EXISTS (SELECT 1 FROM assignment_submissions s WHERE s.assignment_id=a2.id) ORDER BY a2.created_at LIMIT 1000) RETURNING a.id", [cutoff]);
    return r.rowCount ?? 0;
  }
  if (category === "lessons") {
    const r = await client.query("DELETE FROM lessons l WHERE l.id IN (SELECT l2.id FROM lessons l2 WHERE l2.created_at<$1 AND lower(l2.type)='notes' AND l2.media_url IS NULL AND NOT EXISTS (SELECT 1 FROM exercises e WHERE e.lesson_id=l2.id) ORDER BY l2.created_at LIMIT 1000) RETURNING l.id", [cutoff]);
    return r.rowCount ?? 0;
  }
  if (category === "study_groups") {
    const selected = await client.query("SELECT g.id FROM study_groups g WHERE g.created_at<$1 AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.group_id=g.id) AND NOT EXISTS (SELECT 1 FROM chat_polls p WHERE p.group_id=g.id) AND NOT EXISTS (SELECT 1 FROM chat_community_groups cg WHERE cg.group_id=g.id) AND (SELECT count(*) FROM study_group_members gm WHERE gm.group_id=g.id)<=1 ORDER BY g.created_at LIMIT 250 FOR UPDATE", [cutoff]);
    const ids = selected.rows.map((row: any) => Number(row.id));
    if (!ids.length) return 0;
    await client.query("DELETE FROM group_member_controls WHERE group_id=ANY($1::int[])", [ids]);
    await client.query("DELETE FROM group_settings WHERE group_id=ANY($1::int[])", [ids]);
    await client.query("DELETE FROM study_group_members WHERE group_id=ANY($1::int[])", [ids]);
    const deleted = await client.query("DELETE FROM study_groups WHERE id=ANY($1::int[]) RETURNING id", [ids]);
    return deleted.rowCount ?? 0;
  }
  if (category === "media") {
    const rows = await client.query("SELECT id,storage_key FROM exercise_media WHERE exercise_id IS NULL AND question_id IS NULL AND answer_id IS NULL AND created_at<$1 ORDER BY created_at LIMIT 250 FOR UPDATE", [cutoff]);
    let removed = 0;
    for (const row of rows.rows) {
      try {
        await removeStoredMedia(String(row.storage_key));
        const deleted = await client.query("DELETE FROM exercise_media WHERE id=$1 RETURNING id", [row.id]);
        removed += deleted.rowCount ?? 0;
      } catch {
        // Keep the database row so a failed object-storage deletion remains retryable.
      }
    }
    return removed;
  }
  return 0;
}

export async function runRetentionCleanup(input: { triggerType: "manual" | "scheduled"; triggeredBy: number | null; categories?: RetentionCategory[]; retentionDays?: number }) {
  await ensureRetentionSchema();
  const policy = await getRetentionPolicy();
  const categories = input.categories ?? policy.categories;
  const days = input.retentionDays ?? policy.retentionDays;
  const cutoff = cutoffFor(days);
  const counts: Record<string, number> = {};
  const errors: Record<string, string> = {};
  const run = await pool.query("INSERT INTO owner_retention_runs (triggered_by,trigger_type,status) VALUES ($1,$2,'running') RETURNING id", [input.triggeredBy, input.triggerType]);
  const runId = Number(run.rows[0].id);
  const auditActor = input.triggeredBy ?? policy.updatedBy;
  if (!auditActor) {
    await pool.query("UPDATE owner_retention_runs SET finished_at=now(),status='failed',error=$1 WHERE id=$2", ["No accountable Owner actor is configured",runId]);
    throw new Error("Retention cleanup has no accountable Owner actor; configure the policy before enabling it.");
  }
  await pool.query("INSERT INTO audit_logs(action,category,performed_by,target_type,target_id,details) VALUES($1,$2,$3,$4,$5,$6)", [
    "retention.cleanup.started","system",auditActor,"retention_run",runId,
    JSON.stringify({triggerType:input.triggerType,retentionDays:days,categories,cutoff:cutoff.toISOString()}),
  ]);
  const client = await pool.connect();
  try {
    for (const category of categories) {
      try {
        await client.query("BEGIN");
        counts[category] = await deleteCategory(client, category, cutoff);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        errors[category] = error instanceof Error ? error.message.slice(0, 500) : "Category cleanup failed";
        counts[category] = 0;
      }
    }
  } finally {
    client.release();
  }
  const hasErrors = Object.keys(errors).length > 0;
  const anySuccess = categories.some(category => !Object.prototype.hasOwnProperty.call(errors, category));
  const status = hasErrors ? (anySuccess ? "partial" : "failed") : "completed";
  try {
    await pool.query("UPDATE owner_retention_runs SET finished_at=now(),category_counts=$1::jsonb,status=$2,error=$3 WHERE id=$4", [
      JSON.stringify({ deleted: counts, errors }), status,
      hasErrors ? JSON.stringify(errors).slice(0, 2000) : null, runId,
    ]);
    await pool.query("INSERT INTO audit_logs(action,category,performed_by,target_type,target_id,details) VALUES($1,$2,$3,$4,$5,$6)", [
      "retention.cleanup." + status, "system", auditActor,
      "retention_run", runId, JSON.stringify({ triggerType: input.triggerType, retentionDays: days, cutoff: cutoff.toISOString(), deleted: counts, errors }),
    ]);
  } catch (error) {
    await pool.query("UPDATE owner_retention_runs SET status='failed',error=$1,finished_at=now() WHERE id=$2", [
      error instanceof Error ? error.message.slice(0, 1000) : "Retention audit write failed", runId,
    ]).catch(() => undefined);
    throw error;
  }
  return { runId, status, deleted: counts, errors, cutoff: cutoff.toISOString() };
}

let schedulerStarted = false;
let schedulerTimer: ReturnType<typeof setInterval> | null = null;
export async function startRetentionCleanupScheduler(): Promise<void> {
  if (schedulerStarted) return;
  schedulerStarted = true;
  await ensureRetentionSchema();
  const tick = async () => {
    const client = await pool.connect();
    let locked = false;
    try {
      const lock = await client.query("SELECT pg_try_advisory_lock(746201101) AS locked");
      locked = Boolean(lock.rows[0]?.locked);
      if (!locked) return;
      const result = await client.query("SELECT enabled,categories,retention_days,interval_hours,next_run_at,updated_by FROM owner_retention_policies WHERE id=1");
      const row = result.rows[0];
      if (!row?.enabled || !row.next_run_at || new Date(row.next_run_at).getTime() > Date.now()) return;
      const categories = validCategories(row.categories);
      if (!categories.length) {
        await client.query("UPDATE owner_retention_policies SET next_run_at=now()+make_interval(hours => interval_hours),last_run_at=now() WHERE id=1");
        return;
      }
      await client.query("UPDATE owner_retention_policies SET next_run_at=now()+make_interval(hours => interval_hours),last_run_at=now() WHERE id=1");
      await runRetentionCleanup({ triggerType: "scheduled", triggeredBy: Number(row.updated_by) || null, categories, retentionDays: Number(row.retention_days) });
      return;
    } catch {
      // A failed run is recorded by runRetentionCleanup; the next scheduler tick retries.
    } finally {
      if (locked) await client.query("SELECT pg_advisory_unlock(746201101)").catch(() => undefined);
      client.release();
    }
  };
  void tick();
  schedulerTimer = setInterval(() => { void tick(); }, 5 * 60 * 1000);
}

export function stopRetentionCleanupScheduler(): void {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = null;
  schedulerStarted = false;
}
