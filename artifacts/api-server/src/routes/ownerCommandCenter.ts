import { Router } from "express";
import { randomUUID } from "node:crypto";
import { count, desc, eq, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  lessonsTable,
  classesTable,
  assignmentsTable,
  paymentsTable,
  auditLogsTable,
  ownerAlertsTable,
  aiActionsTable,
  pool,
} from "@workspace/db";
import { requireOwner } from "../lib/auth-middleware";
import { getAIProvider } from "../lib/ai-provider";
import { getRetentionPolicy, previewRetention, runRetentionCleanup, RETENTION_CATEGORIES, type RetentionCategory } from "../lib/retention-cleanup";

const router = Router();
const now = () => new Date().toISOString();

type ServiceStatus = "healthy" | "degraded" | "offline" | "unknown";
type ServiceCheck = {
  name: string;
  status: ServiceStatus;
  checkedAt: string;
  responseTimeMs?: number;
  message: string;
  source: string;
};

async function checkService(name: string, check: () => Promise<void>): Promise<ServiceCheck> {
  const started = Date.now();
  try {
    await check();
    return {
      name,
      status: "healthy",
      checkedAt: now(),
      responseTimeMs: Date.now() - started,
      message: "Check completed successfully",
      source: `command-center.${name}`,
    };
  } catch {
    return {
      name,
      status: "offline",
      checkedAt: now(),
      responseTimeMs: Date.now() - started,
      message: "Service check failed; inspect server logs",
      source: `command-center.${name}`,
    };
  }
}


router.get("/owner/command-center/retention", requireOwner, async (_req,res):Promise<void> => {
  res.setHeader("Cache-Control","private,no-store");
  res.json({ policy: await getRetentionPolicy(), categories: RETENTION_CATEGORIES });
});

router.put("/owner/command-center/retention", requireOwner, async (req,res):Promise<void> => {
  const enabled = req.body?.enabled === true;
  const categories = Array.isArray(req.body?.categories)
    ? [...new Set((req.body.categories as unknown[]).filter((value): value is RetentionCategory => typeof value === "string" && (RETENTION_CATEGORIES as readonly string[]).includes(value)))]
    : [];
  const retentionDays = Number(req.body?.retentionDays);
  const intervalHours = Number(req.body?.intervalHours);
  if (!Number.isInteger(retentionDays) || retentionDays < 30 || retentionDays > 3650 || !Number.isInteger(intervalHours) || intervalHours < 6 || intervalHours > 168 || (enabled && categories.length === 0)) {
    res.status(400).json({ error: "Choose at least one eligible category when enabled, a retention age from 30 to 3650 days, and a schedule from 6 to 168 hours." });
    return;
  }
  const actor = req.currentUser!;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (enabled) {
      const previewId = typeof req.body?.previewId === "string" ? req.body.previewId : "";
      const savedPreview = await client.query("SELECT categories,retention_days FROM owner_retention_previews WHERE id=$1 AND created_by=$2 AND used_at IS NULL AND created_at>now()-interval '30 minutes' FOR UPDATE", [previewId,actor.id]);
      const previewCategories = Array.isArray(savedPreview.rows[0]?.categories) ? savedPreview.rows[0].categories : [];
      const sameCategories = JSON.stringify([...previewCategories].sort()) === JSON.stringify([...categories].sort());
      if (!savedPreview.rowCount || Number(savedPreview.rows[0].retention_days) !== retentionDays || !sameCategories) {
        await client.query("ROLLBACK");
        res.status(409).json({error:"Preview this exact category selection and retention age before enabling automatic cleanup. Previews expire after 30 minutes."});
        return;
      }
      await client.query("UPDATE owner_retention_previews SET used_at=now() WHERE id=$1",[previewId]);
    }
    const result = await client.query(
      "UPDATE owner_retention_policies SET enabled=$1,categories=$2::jsonb,retention_days=$3,interval_hours=$4,next_run_at=CASE WHEN $1 THEN now()+make_interval(hours => $4) ELSE NULL END,updated_by=$5,updated_at=now() WHERE id=1 RETURNING enabled,categories,retention_days,interval_hours,next_run_at,last_run_at,updated_at,updated_by",
      [enabled,JSON.stringify(categories),retentionDays,intervalHours,actor.id],
    );
    await client.query(
      "INSERT INTO audit_logs(action,category,performed_by,target_type,target_id,details) VALUES($1,$2,$3,$4,$5,$6)",
      ["retention.policy.updated","system",actor.id,"retention_policy",1,JSON.stringify({enabled,categories,retentionDays,intervalHours})],
    );
    await client.query("COMMIT");
    const row=result.rows[0];
    res.json({ policy: { enabled:row.enabled,categories:row.categories,retentionDays:Number(row.retention_days),intervalHours:Number(row.interval_hours),nextRunAt:row.next_run_at?new Date(row.next_run_at).toISOString():null,lastRunAt:row.last_run_at?new Date(row.last_run_at).toISOString():null,updatedAt:new Date(row.updated_at).toISOString(),updatedBy:Number(row.updated_by) } });
  } catch (error) {
    await client.query("ROLLBACK").catch(()=>undefined);
    throw error;
  } finally { client.release(); }
});

router.post("/owner/command-center/retention/preview", requireOwner, async (req,res):Promise<void> => {
  const categories = Array.isArray(req.body?.categories)
    ? [...new Set((req.body.categories as unknown[]).filter((value): value is RetentionCategory => typeof value === "string" && (RETENTION_CATEGORIES as readonly string[]).includes(value)))]
    : [];
  const days = Number(req.body?.retentionDays);
  if (!categories.length || !Number.isInteger(days) || days < 30 || days > 3650) {
    res.status(400).json({error:"Select eligible categories and a retention age between 30 and 3650 days."});
    return;
  }
  const preview = await previewRetention(days,categories);
  const previewId = randomUUID();
  await pool.query("INSERT INTO owner_retention_previews (id,created_by,categories,retention_days,eligible_counts) VALUES ($1,$2,$3::jsonb,$4,$5::jsonb)", [previewId,req.currentUser!.id,JSON.stringify(categories),days,JSON.stringify(preview.counts)]);
  res.setHeader("Cache-Control","private,no-store");
  res.json({...preview,previewId});
});

router.post("/owner/command-center/retention/run", requireOwner, async (req,res):Promise<void> => {
  if (req.body?.confirmation !== "DELETE EXPIRED CONTENT") {
    res.status(400).json({error:"Explicit confirmation is required: DELETE EXPIRED CONTENT."});
    return;
  }
  const policy = await getRetentionPolicy();
  if (!policy.enabled || !policy.categories.length) {
    res.status(409).json({error:"Save and enable a retention policy with at least one category before running cleanup."});
    return;
  }
  const preview = await previewRetention(policy.retentionDays,policy.categories);
  const result = await runRetentionCleanup({triggerType:"manual",triggeredBy:req.currentUser!.id,categories:policy.categories,retentionDays:policy.retentionDays});
  res.json({...result,previewedEligible:preview.totalEligible});
});

router.get("/owner/command-center/retention/runs", requireOwner, async (_req,res):Promise<void> => {
  const result=await pool.query("SELECT id,started_at,finished_at,triggered_by,trigger_type,category_counts,status,error FROM owner_retention_runs ORDER BY started_at DESC LIMIT 20");
  res.setHeader("Cache-Control","private,no-store");
  res.json({runs:result.rows});
});

router.get("/owner/command-center/health", requireOwner, async (_req, res): Promise<void> => {
  const [database, ai] = await Promise.all([
    checkService("database", async () => { await pool.query("SELECT 1"); }),
    checkService("ai", async () => { await getAIProvider(); }),
  ]);

  res.json({
    checkedAt: now(),
    dashboard: {
      status: "healthy" as ServiceStatus,
      message: "Owner Command Center health response generated",
      source: "command-center.request",
    },
    services: [
      {
        name: "api",
        status: "healthy" as ServiceStatus,
        checkedAt: now(),
        message: "Health endpoint responded",
        source: "command-center.request",
      },
      database,
      {
        name: "authentication",
        status: "healthy" as ServiceStatus,
        checkedAt: now(),
        message: "Owner authentication and authorization succeeded",
        source: "auth.requireOwner",
      },
      ai,
      {
        name: "notifications",
        status: "unknown" as ServiceStatus,
        checkedAt: now(),
        message: "Notification delivery health is not measured by this deployment",
        source: "command-center.notifications",
      },
      {
        name: "background jobs",
        status: "unknown" as ServiceStatus,
        checkedAt: now(),
        message: "No background-job health signal is configured",
        source: "command-center.background-jobs",
      },
      {
        name: "storage/media",
        status: "unknown" as ServiceStatus,
        checkedAt: now(),
        message: "Storage health is not measured by this deployment",
        source: "command-center.storage",
      },
      {
        name: "external integrations",
        status: "unknown" as ServiceStatus,
        checkedAt: now(),
        message: "External integration health is not measured by this deployment",
        source: "command-center.integrations",
      },
    ],
  });
});

router.get("/owner/command-center/snapshot", requireOwner, async (_req, res): Promise<void> => {
  try {
    const [students, teachers, prefects, managers, active, suspended, blocked, lessons, classes, assignments, revenue, outstanding, alerts, critical, unreadAlerts] = await Promise.all([
      db.select({ value: count() }).from(usersTable).where(eq(usersTable.role, "student")),
      db.select({ value: count() }).from(usersTable).where(eq(usersTable.role, "teacher")),
      db.select({ value: count() }).from(usersTable).where(eq(usersTable.isPrefect, true)),
      db.select({ value: count() }).from(usersTable).where(eq(usersTable.isManager, true)),
      db.select({ value: count() }).from(usersTable).where(sql`${usersTable.isBlocked} = false AND ${usersTable.isSuspended} = false`),
      db.select({ value: count() }).from(usersTable).where(eq(usersTable.isSuspended, true)),
      db.select({ value: count() }).from(usersTable).where(eq(usersTable.isBlocked, true)),
      db.select({ value: count() }).from(lessonsTable),
      db.select({ value: count() }).from(classesTable),
      db.select({ value: count() }).from(assignmentsTable),
      db.select({ value: sql<string>`coalesce(sum(${paymentsTable.amount}), 0)` }).from(paymentsTable).where(eq(paymentsTable.status, "paid")),
      db.select({ value: count() }).from(paymentsTable).where(eq(paymentsTable.status, "overdue")),
      db.select({ value: count() }).from(ownerAlertsTable).where(eq(ownerAlertsTable.status, "open")),
      db.select({ value: count() }).from(ownerAlertsTable).where(sql`${ownerAlertsTable.status} = 'open' AND ${ownerAlertsTable.severity} = 'critical'`),
      db.select({ value: count() }).from(ownerAlertsTable).where(sql`${ownerAlertsTable.status} = 'open' AND ${ownerAlertsTable.isRead} = false`),
    ]);

    const first = (rows: Array<{ value: number | string }>) => rows[0]?.value ?? null;
    res.json({
      students: first(students),
      teachers: first(teachers),
      prefects: first(prefects),
      managers: first(managers),
      activeUsers: first(active),
      suspendedUsers: first(suspended),
      blockedUsers: first(blocked),
      lessons: first(lessons),
      classes: first(classes),
      assignments: first(assignments),
      revenue: first(revenue),
      outstandingPayments: first(outstanding),
      openAlerts: first(alerts),
      criticalAlerts: first(critical),
      unreadOwnerAlerts: first(unreadAlerts),
      failedJobs: null,
      pendingAiActions: null,
    });
  } catch {
    res.status(503).json({ error: "Executive snapshot unavailable", code: "COMMAND_CENTER_SNAPSHOT_UNAVAILABLE" });
  }
});

router.get("/owner/command-center/events", requireOwner, async (req, res): Promise<void> => {
  const parsedLimit = Number(req.query.limit);
  const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 20, 1), 100);
  const parsedOffset = Number(req.query.offset);
  const offset = Math.max(Number.isFinite(parsedOffset) ? parsedOffset : 0, 0);

  try {
    const events = await db.select({
      id: auditLogsTable.id,
      timestamp: auditLogsTable.createdAt,
      action: auditLogsTable.action,
      category: auditLogsTable.category,
      targetType: auditLogsTable.targetType,
      targetId: auditLogsTable.targetId,
      actor: usersTable.name,
      actorRole: usersTable.role,
      success: sql<boolean>`true`,
    }).from(auditLogsTable)
      .leftJoin(usersTable, eq(auditLogsTable.performedBy, usersTable.id))
      .orderBy(desc(auditLogsTable.createdAt), desc(auditLogsTable.id))
      .limit(limit)
      .offset(offset);

    res.json({
      events: events.map((event) => ({
        ...event,
        timestamp: event.timestamp.toISOString(),
        eventId: `audit-${event.id}`,
        correlationId: null,
      })),
      limit,
      offset,
      hasMore: events.length === limit,
    });
  } catch {
    res.status(503).json({ error: "Event stream unavailable", code: "COMMAND_CENTER_EVENTS_UNAVAILABLE" });
  }
});

export default router;
