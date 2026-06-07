import { Router, type IRouter } from "express";
import { eq, or, isNull } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { CreateNotificationBody, MarkNotificationReadParams } from "@workspace/api-zod";
import { requireAuth, requireTeacherOrOwner, requireOwner } from "../lib/auth-middleware";

const router: IRouter = Router();

// GET /notifications — List notifications for current user (includes broadcasts)
router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;
  const notifications = await db.select().from(notificationsTable)
    .where(or(eq(notificationsTable.recipientId, currentUser.id), isNull(notificationsTable.recipientId)))
    .orderBy(notificationsTable.createdAt);
  res.json(notifications.map(n => ({ ...n, createdAt: n.createdAt.toISOString() })));
});

// POST /notifications — Create (teacher/owner only)
router.post("/notifications", requireAuth, requireTeacherOrOwner, async (req, res): Promise<void> => {
  const parsed = CreateNotificationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [notification] = await db.insert(notificationsTable).values({
    ...parsed.data,
    isRead: false,
  }).returning();

  res.status(201).json({ ...notification, createdAt: notification.createdAt.toISOString() });
});

// PATCH /notifications/:id/read — Mark as read
router.patch("/notifications/:id/read", requireAuth, async (req, res): Promise<void> => {
  const params = MarkNotificationReadParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [notification] = await db.update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.id, params.data.id))
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
