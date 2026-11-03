import { Router } from "express";
import { db, auditLogsTable, usersTable } from "@workspace/db";
import { eq, desc, inArray, and, or } from "drizzle-orm";
import { getAIProvider } from "../lib/ai-provider";
import { requireAuth, canAccessManager, isOwnerRole } from "../lib/auth-middleware";
import { isSeniorManager } from "../lib/role-access";
import { requireManagerPermission } from "../lib/manager-permission-policy";

const router = Router();

// GET /audit-logs — list audit logs (owner only)
router.get("/audit-logs", requireAuth, requireManagerPermission("audit.view_subordinate"), async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!canAccessManager(user)) { res.status(403).json({ error: "Manager or owner access required" }); return; }
  const isOwner = isOwnerRole(user.role);
  const limit = Math.min(parseInt(String(req.query.limit ?? "200")), 500);
  const base = db.select({
    id: auditLogsTable.id,
    action: auditLogsTable.action,
    category: auditLogsTable.category,
    targetType: auditLogsTable.targetType,
    targetId: auditLogsTable.targetId,
    details: auditLogsTable.details,
    createdAt: auditLogsTable.createdAt,
    performerName: usersTable.name,
    performerRole: usersTable.role,
    performerId: usersTable.id,
    performerIsPrefect: usersTable.isPrefect,
  }).from(auditLogsTable).leftJoin(usersTable, eq(auditLogsTable.performedBy, usersTable.id));
  // Managers may monitor academic/user activity only. Never expose operational,
  // owner/admin, payment, app/system, auth, security, or data-management logs.
  const managerVisibleCategories = [
    "academic", "attendance", "content", "activity", "staff", "moderation",
  ];
  const ordinaryUsers = and(
    inArray(usersTable.role, ["student", "learner", "teacher", "prefect"]),
    eq(usersTable.isManager, false),
    eq(usersTable.isBlocked, false),
  );
  const visiblePerformers = isSeniorManager(user)
    ? or(
        ordinaryUsers,
        eq(usersTable.role, "junior_manager"),
        and(eq(usersTable.role, "manager"), eq(usersTable.managerLevel, "junior")),
        and(eq(usersTable.role, "teacher"), eq(usersTable.isManager, true), eq(usersTable.managerLevel, "junior")),
      )
    : ordinaryUsers;
  const logs = isOwner
    ? await base.orderBy(desc(auditLogsTable.createdAt)).limit(limit)
    : await base.where(and(
        visiblePerformers,
        inArray(auditLogsTable.category, managerVisibleCategories),
      )).orderBy(desc(auditLogsTable.createdAt)).limit(limit);
  const ownerIds=isOwner?new Set<number>():new Set<number>((await db.select({id:usersTable.id}).from(usersTable).where(inArray(usersTable.role,["owner","platform_owner"]))).map(row=>row.id));
  const visibleLogs=isOwner?logs:logs.filter((log:any)=>!(["user","profile","account","owner"].includes(String(log.targetType||"").toLowerCase())&&ownerIds.has(Number(log.targetId))));
  res.json(visibleLogs.map(({ details, performerIsPrefect, ...log }) => ({
    ...log,
    // Never expose raw audit details to managers: details can contain sensitive operational data.
    details: isOwner ? details : null,
    performerIsPrefect,
  })));
});

// POST /audit-logs — create manual audit entry
router.post("/audit-logs", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role !== "owner") { res.status(403).json({ error: "Owner only" }); return; }
  const { action, category = "system", targetType, targetId, details } = req.body as { action: string; category?: string; targetType?: string; targetId?: number; details?: string };
  if (!action) { res.status(400).json({ error: "action required" }); return; }
  const [log] = await db.insert(auditLogsTable).values({ action, category, performedBy: user.id, targetType, targetId, details }).returning();
  res.status(201).json(log);
});




router.post("/audit-logs/delete", requireAuth, async (req, res): Promise<void> => {
  if (req.currentUser!.role !== "owner") { res.status(403).json({ error: "Owner only" }); return; }
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter((id: number) => Number.isInteger(id) && id > 0) : [];
  if (ids.length === 0) { res.status(400).json({ error: "Select at least one audit log" }); return; }
  const uniqueIds: number[] = [...new Set<number>(ids)].slice(0, 500);
  await db.delete(auditLogsTable).where(inArray(auditLogsTable.id, uniqueIds));
  res.json({ ok: true, deleted: uniqueIds.length });
});

router.post("/audit-logs/summarize", requireAuth, async (req, res): Promise<void> => {
  if (req.currentUser!.role !== "owner") { res.status(403).json({ error: "Owner only" }); return; }
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter((id: number) => Number.isInteger(id) && id > 0) : [];
  if (ids.length === 0) { res.status(400).json({ error: "Select at least one audit log" }); return; }
  const uniqueIds: number[] = [...new Set<number>(ids)].slice(0, 100);
  const rows = await db.select({ id: auditLogsTable.id, action: auditLogsTable.action, category: auditLogsTable.category, details: auditLogsTable.details, createdAt: auditLogsTable.createdAt, performerName: usersTable.name, performerRole: usersTable.role }).from(auditLogsTable).leftJoin(usersTable, eq(auditLogsTable.performedBy, usersTable.id)).where(inArray(auditLogsTable.id, uniqueIds));
  try {
    const ai = await getAIProvider();
    const summary = await ai.analyzeData({ events: rows }, "Summarize these DALLYLETTER audit events for the project owner. Identify important activity, failures, moderation/security concerns, and role patterns. Do not invent facts. Return concise bullet points.");
    res.json({ provider: ai.name, summary });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "AI summary unavailable" }); }
});

export default router;
