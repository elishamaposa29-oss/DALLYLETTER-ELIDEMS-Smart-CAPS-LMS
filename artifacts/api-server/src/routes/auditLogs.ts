import { Router } from "express";
import { db, auditLogsTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";

const router = Router();

// GET /audit-logs — list audit logs (owner only)
router.get("/audit-logs", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role !== "owner") { res.status(403).json({ error: "Owner only" }); return; }
  const limit = Math.min(parseInt(String(req.query.limit ?? "200")), 500);
  const logs = await db.select({
    id: auditLogsTable.id,
    action: auditLogsTable.action,
    category: auditLogsTable.category,
    targetType: auditLogsTable.targetType,
    targetId: auditLogsTable.targetId,
    details: auditLogsTable.details,
    createdAt: auditLogsTable.createdAt,
    performerName: usersTable.name,
    performerRole: usersTable.role,
  }).from(auditLogsTable)
    .leftJoin(usersTable, eq(auditLogsTable.performedBy, usersTable.id))
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(limit);
  res.json(logs);
});

// POST /audit-logs — create manual audit entry
router.post("/audit-logs", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const { action, category = "system", targetType, targetId, details } = req.body as { action: string; category?: string; targetType?: string; targetId?: number; details?: string };
  if (!action) { res.status(400).json({ error: "action required" }); return; }
  const [log] = await db.insert(auditLogsTable).values({ action, category, performedBy: user.id, targetType, targetId, details }).returning();
  res.status(201).json(log);
});

export default router;
