import { Router } from "express";
import { db } from "@workspace/db";
import { ownerAlertsTable } from "@workspace/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { requireAuth, isOwnerRole, canAccessManager } from "../lib/auth-middleware";

const router = Router();

const isOwnerOrAdmin = (role: string): boolean => isOwnerRole(role);
const managerVisibleCategories = ["academic", "attendance", "content", "student", "teacher", "moderation", "general"];

router.get("/owner-alerts", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (isOwnerOrAdmin(user.role)) {
    const rows = await db.select().from(ownerAlertsTable).orderBy(desc(ownerAlertsTable.createdAt));
    res.json(rows); return;
  }
  if (canAccessManager(user)) {
    const rows = await db.select().from(ownerAlertsTable).where(inArray(ownerAlertsTable.category, managerVisibleCategories)).orderBy(desc(ownerAlertsTable.createdAt));
    res.json(rows); return;
  }
  const rows = await db.select().from(ownerAlertsTable).where(eq(ownerAlertsTable.reportedBy, user.id)).orderBy(desc(ownerAlertsTable.createdAt));
  res.json(rows);
});

router.get("/owner-alerts/unread-count", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!isOwnerOrAdmin(user.role)) { res.json({ count: 0 }); return; }
  const rows = await db.select().from(ownerAlertsTable).where(eq(ownerAlertsTable.isRead, false));
  res.json({ count: rows.length });
});

router.post("/owner-alerts", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
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
  const user = req.currentUser!;
  const id = parseInt(String(req.params.id));
  const [existing] = await db.select().from(ownerAlertsTable).where(eq(ownerAlertsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Alert not found." }); return; }
  if (!isOwnerOrAdmin(user.role) && (!canAccessManager(user) || !managerVisibleCategories.includes(existing.category))) { res.status(403).json({ error: "You cannot update this alert." }); return; }
  const [row] = await db.update(ownerAlertsTable).set({ isRead: true }).where(eq(ownerAlertsTable.id, id)).returning();
  res.json(row);
});

router.put("/owner-alerts/:id/resolve", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const id = parseInt(String(req.params.id));
  const [existing] = await db.select().from(ownerAlertsTable).where(eq(ownerAlertsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Alert not found." }); return; }
  if (!isOwnerOrAdmin(user.role) && (!canAccessManager(user) || !managerVisibleCategories.includes(existing.category))) { res.status(403).json({ error: "You cannot resolve this alert." }); return; }
  const { resolution } = req.body;
  const [row] = await db.update(ownerAlertsTable)
    .set({ status: "resolved", isRead: true, resolution, resolvedBy: user.id, resolvedAt: new Date() })
    .where(eq(ownerAlertsTable.id, id)).returning();
  res.json(row);
});

router.delete("/owner-alerts/:id", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!isOwnerOrAdmin(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(ownerAlertsTable).where(eq(ownerAlertsTable.id, parseInt(String(req.params.id))));
  res.json({ ok: true });
});

export default router;
