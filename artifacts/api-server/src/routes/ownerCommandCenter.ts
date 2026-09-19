import { Router } from "express";
import { count, desc, eq, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  lessonsTable,
  classesTable,
  assignmentsTable,
  paymentsTable,
  notificationsTable,
  auditLogsTable,
  ownerAlertsTable,
  aiActionsTable,
  pool,
} from "@workspace/db";
import { requireAuth, requireOwner } from "../lib/auth-middleware";
import { getAIProvider } from "../lib/ai-provider";

const router = Router();
const checkedAt = () => new Date().toISOString();

type ServiceStatus = "healthy" | "degraded" | "offline" | "unknown";

async function checkService(name: string, check: () => Promise<void>) {
  const started = Date.now();
  try {
    await check();
    return { name, status: "healthy" as ServiceStatus, checkedAt: checkedAt(), responseTimeMs: Date.now() - started, message: "Check completed successfully", source: `command-center.${name}` };
  } catch {
    return { name, status: "offline" as ServiceStatus, checkedAt: checkedAt(), responseTimeMs: Date.now() - started, message: "Service check failed; inspect server logs", source: `command-center.${name}` };
  }
}

router.get("/owner/command-center/health", requireAuth, requireOwner, async (_req, res): Promise<void> => {
  const aiCheck = await checkService("ai", async () => { await getAIProvider(); });
  const databaseCheck = await checkService("database", async () => { await pool.query("SELECT 1"); });
  res.json({
    checkedAt: checkedAt(),
    dashboard: { status: "healthy", message: "Owner Command Center request completed", source: "command-center.request" },
    services: [
      { name: "api", status: "healthy", checkedAt: checkedAt(), message: "API request handled", source: "command-center.request" },
      databaseCheck,
      { name: "authentication", status: "healthy", checkedAt: checkedAt(), message: "Owner authorization succeeded", source: "auth.requireOwner" },
      aiCheck,
      { name: "notifications", status: "unknown", checkedAt: checkedAt(), message: "Delivery provider health is not measured by this deployment", source: "command-center.notifications" },
      { name: "background jobs", status: "unknown", checkedAt: checkedAt(), message: "No background-job health signal is configured", source: "command-center.background-jobs" },
      { name: "storage/media", status: "unknown", checkedAt: checkedAt(), message: "Storage health is not measured by this deployment", source: "command-center.storage" },
      { name: "external integrations", status: "unknown", checkedAt: checkedAt(), message: "External integration health is not measured by this deployment", source: "command-center.integrations" },
    ],
  });
});

router.get("/owner/command-center/snapshot", requireAuth, requireOwner, async (_req, res): Promise<void> => {
  const [students, teachers, prefects, managers, active, suspended, blocked, lessons, classes, assignments, revenue, outstanding, alerts, critical, unreadAlerts, pendingAi] = await Promise.all([
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
    db.select({ value: count() }).from(aiActionsTable).where(sql`${aiActionsTable.result} like '%"status":"proposed"%'`),
  ]);
  const value = (row: Array<{ value: number | string }> | undefined) => row?.[0]?.value ?? null;
  res.json({ students: value(students), teachers: value(teachers), prefects: value(prefects), managers: value(managers), activeUsers: value(active), suspendedUsers: value(suspended), blockedUsers: value(blocked), lessons: value(lessons), classes: value(classes), assignments: value(assignments), revenue: value(revenue), outstandingPayments: value(outstanding), openAlerts: value(alerts), criticalAlerts: value(critical), unreadOwnerAlerts: value(unreadAlerts), failedJobs: null, pendingAiActions: value(pendingAi) });
});

router.get("/owner/command-center/events", requireAuth, requireOwner, async (req, res): Promise<void> => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const events = await db.select({ id: auditLogsTable.id, timestamp: auditLogsTable.createdAt, action: auditLogsTable.action, category: auditLogsTable.category, targetType: auditLogsTable.targetType, targetId: auditLogsTable.targetId, actor: usersTable.name, actorRole: usersTable.role, success: sql<boolean>`true` }).from(auditLogsTable).leftJoin(usersTable, eq(auditLogsTable.performedBy, usersTable.id)).orderBy(desc(auditLogsTable.createdAt)).limit(limit);
  res.json(events.map((event) => ({ ...event, timestamp: event.timestamp.toISOString(), eventId: `audit-${event.id}`, correlationId: null })));
});

export default router;
