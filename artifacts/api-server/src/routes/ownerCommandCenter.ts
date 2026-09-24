import { Router } from "express";
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
