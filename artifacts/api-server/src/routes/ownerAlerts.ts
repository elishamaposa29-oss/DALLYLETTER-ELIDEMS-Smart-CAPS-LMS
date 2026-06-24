import { Router } from "express";
import { db } from "@workspace/db";
import { ownerAlertsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";

const router = Router();

router.get("/owner-alerts", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const rows = await db.select().from(ownerAlertsTable).orderBy(desc(ownerAlertsTable.createdAt));
  if (user.role !== "owner" && !user.isManager) {
    res.json(rows.filter((r: any) => r.reportedBy === user.id)); return;
  }
  res.json(rows);
});

router.get("/owner-alerts/unread-count", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  if (user.role !== "owner") { res.json({ count: 0 }); return; }
  const rows = await db.select().from(ownerAlertsTable).where(eq(ownerAlertsTable.isRead, false));
  res.json({ count: rows.length });
});

router.post("/owner-alerts", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { title, description, category, severity, targetType, targetId, targetName, attachmentUrl } = req.body;
  if (!title || !description) { res.status(400).json({ error: "title and description required" }); return; }
  const [row] = await db.insert(ownerAlertsTable).values({
    title, description,
    category: category ?? "general",
    severity: severity ?? "medium",
    reportedBy: user.id,
    reporterName: user.name,
    reporterRole: user.role,
    targetType, targetId, targetName, attachmentUrl,
  }).returning();
  res.status(201).json(row);
});

router.put("/owner-alerts/:id/read", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  if (user.role !== "owner") { res.status(403).json({ error: "Forbidden" }); return; }
  const [row] = await db.update(ownerAlertsTable).set({ isRead: true })
    .where(eq(ownerAlertsTable.id, parseInt(String(req.params.id)))).returning();
  res.json(row);
});

router.put("/owner-alerts/:id/resolve", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  if (user.role !== "owner") { res.status(403).json({ error: "Forbidden" }); return; }
  const { resolution } = req.body;
  const [row] = await db.update(ownerAlertsTable)
    .set({ status: "resolved", isRead: true, resolution, resolvedBy: user.id, resolvedAt: new Date() })
    .where(eq(ownerAlertsTable.id, parseInt(String(req.params.id)))).returning();
  res.json(row);
});

router.delete("/owner-alerts/:id", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  if (user.role !== "owner") { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(ownerAlertsTable).where(eq(ownerAlertsTable.id, parseInt(String(req.params.id))));
  res.json({ ok: true });
});

export default router;
