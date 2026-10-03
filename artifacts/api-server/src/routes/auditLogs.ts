import { Router } from "express";
import { db, auditLogsTable, usersTable } from "@workspace/db";
import { eq, desc, inArray } from "drizzle-orm";
import { getAIProvider } from "../lib/ai-provider";
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
    performerId: usersTable.id,
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


router.post("/audit-logs/delete", requireAuth, async (req, res): Promise<void> => {
  if (req.currentUser!.role !== "owner") { res.status(403).json({ error: "Owner only" }); return; }
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter((id: number) => Number.isInteger(id) && id > 0) : [];
  if (ids.length === 0) { res.status(400).json({ error: "Select at least one audit log" }); return; }
  const uniqueIds = [...new Set(ids)].slice(0, 500);
  await db.delete(auditLogsTable).where(inArray(auditLogsTable.id, uniqueIds));
  res.json({ ok: true, deleted: uniqueIds.length });
});

router.post("/audit-logs/summarize", requireAuth, async (req, res): Promise<void> => {
  if (req.currentUser!.role !== "owner") { res.status(403).json({ error: "Owner only" }); return; }
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter((id: number) => Number.isInteger(id) && id > 0) : [];
  if (ids.length === 0) { res.status(400).json({ error: "Select at least one audit log" }); return; }
  const uniqueIds = [...new Set(ids)].slice(0, 100);
  const rows = await db.select({ id: auditLogsTable.id, action: auditLogsTable.action, category: auditLogsTable.category, details: auditLogsTable.details, createdAt: auditLogsTable.createdAt, performerName: usersTable.name, performerRole: usersTable.role }).from(auditLogsTable).leftJoin(usersTable, eq(auditLogsTable.performedBy, usersTable.id)).where(inArray(auditLogsTable.id, uniqueIds));
  try {
    const ai = await getAIProvider();
    const summary = await ai.analyzeData({ events: rows }, "Summarize these DALLYLETTER audit events for the project owner. Identify important activity, failures, moderation/security concerns, and role patterns. Do not invent facts. Return concise bullet points.");
    res.json({ provider: ai.name, summary });
  } catch (error) { res.status(503).json({ error: error instanceof Error ? error.message : "AI summary unavailable" }); }
});
