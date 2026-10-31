import { Router, type IRouter } from "express";
import { eq, or, isNull, and, desc } from "drizzle-orm";
import { db, notificationsTable, pool } from "@workspace/db";
import { CreateNotificationBody, MarkNotificationReadParams } from "@workspace/api-zod";
import { requireAuth, requireTeacherOrOwner, requireOwner, canAccessManager } from "../lib/auth-middleware";

const router: IRouter = Router();

// GET /notifications — List notifications for current user (includes broadcasts)
router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  // Authenticated notification lists are private and must never be served from a stale cache.
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  const currentUser = req.currentUser!;
  const notifications = await db.select().from(notificationsTable)
    .where(or(eq(notificationsTable.recipientId, currentUser.id), isNull(notificationsTable.recipientId)))
    .orderBy(desc(notificationsTable.createdAt));
  const broadcastIds = notifications.filter(n => n.recipientId == null).map(n => n.id);
  const readReceipts = broadcastIds.length
    ? await pool.query("SELECT notification_id FROM notification_reads WHERE user_id=$1 AND notification_id=ANY($2::int[])", [currentUser.id, broadcastIds])
    : { rows: [] as Array<{ notification_id: number }> };
  const readBroadcastIds = new Set(readReceipts.rows.map(row => Number(row.notification_id)));
  res.json(notifications.map(n => ({
    ...n,
    isRead: n.recipientId == null ? readBroadcastIds.has(Number(n.id)) : n.isRead,
    createdAt: n.createdAt.toISOString(),
  })));
});

// POST /notifications — Create (teacher/owner only)
router.post("/notifications", requireAuth, async (req, res): Promise<void> => {
  if (!canAccessManager(req.currentUser!) && !req.currentUser?.isPrefect) { res.status(403).json({ error: "Only authorized staff or prefects can create notifications" }); return; }
  const recipientRole = typeof req.body?.recipientRole === "string" ? req.body.recipientRole.trim().toLowerCase() : "";
  if (recipientRole) {
    const allowed = ["student", "teacher", "manager", "prefect"];
    if (!allowed.includes(recipientRole)) { res.status(400).json({ error: "Choose a supported recipient role." }); return; }
    const parsed = CreateNotificationBody.safeParse({ ...req.body, recipientId: null });
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    const matches = recipientRole === "prefect"
      ? await pool.query("SELECT id FROM users WHERE is_prefect = true AND is_blocked = false AND is_suspended = false")
      : recipientRole === "manager"
        ? await pool.query("SELECT id FROM users WHERE (is_manager = true OR lower(role) IN ('manager','senior_manager')) AND is_blocked = false AND is_suspended = false")
        : await pool.query("SELECT id FROM users WHERE lower(role) = $1 AND is_blocked = false AND is_suspended = false", [recipientRole]);
    if (!matches.rows.length) { res.status(404).json({ error: "No active users were found for that role. No notification was created." }); return; }
    const created = await Promise.all(matches.rows.map(async (row: { id: number | string }) => {
      const [notification] = await db.insert(notificationsTable).values({ ...parsed.data, recipientId: Number(row.id), isRead: false }).returning();
      return notification;
    }));
    res.status(201).json({ ok: true, recipientRole, recipients: created.length, notifications: created.map(notification => ({ ...notification, createdAt: notification.createdAt.toISOString() })) });
    return;
  }
  const parsed = CreateNotificationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [notification] = await db.insert(notificationsTable).values({ ...parsed.data, isRead: false }).returning();
  res.status(201).json({ ...notification, createdAt: notification.createdAt.toISOString() });
});

// PATCH /notifications/:id/read — Mark as read
router.patch("/notifications/:id/read", requireAuth, async (req, res): Promise<void> => {
  const params = MarkNotificationReadParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [existing] = await db.select().from(notificationsTable)
    .where(eq(notificationsTable.id, params.data.id)).limit(1);
  if (!existing || (existing.recipientId != null && Number(existing.recipientId) !== Number(req.currentUser!.id))) {
    res.status(404).json({ error: "Notification not found" }); return;
  }
  if (existing.recipientId == null) {
    await pool.query(
      "INSERT INTO notification_reads (notification_id,user_id) VALUES ($1,$2) ON CONFLICT (notification_id,user_id) DO NOTHING",
      [existing.id, req.currentUser!.id],
    );
    res.json({ ...existing, isRead: true, createdAt: existing.createdAt.toISOString() });
    return;
  }
  const [notification] = await db.update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.id, params.data.id), eq(notificationsTable.recipientId, req.currentUser!.id)))
    .returning();
  if (!notification) { res.status(404).json({ error: "Notification not found" }); return; }
  res.json({ ...notification, createdAt: notification.createdAt.toISOString() });
});

// DELETE /notifications/:id — Delete (owner only)
router.delete("/notifications/:id", requireAuth, requireOwner, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(notificationsTable).where(eq(notificationsTable.id, id));
  res.sendStatus(204);
});

export default router;
