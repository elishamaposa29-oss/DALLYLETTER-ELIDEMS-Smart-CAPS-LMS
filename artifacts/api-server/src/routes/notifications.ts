import { Router, type IRouter } from "express";
import { eq, or, isNull, and, desc } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { CreateNotificationBody, MarkNotificationReadParams } from "@workspace/api-zod";
import { requireAuth, requireTeacherOrOwner, requireOwner, canAccessManager } from "../lib/auth-middleware";
import { isSmsConfigured, isWhatsAppConfigured, resolveVerifiedPhoneRecipients, sendSms, sendWhatsApp } from "../lib/sms-service";

const router: IRouter = Router();


async function sendPhoneNotification(req: any, res: any, channel: "sms" | "whatsapp"): Promise<void> {
  if (!canAccessManager(req.currentUser!)) { res.status(403).json({ error: "Only managers and owners can send phone notifications." }); return; }
  const subject = typeof req.body?.subject === "string" ? req.body.subject.trim() : "";
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const recipientId = req.body?.recipientId == null ? null : Number(req.body.recipientId);
  const recipientRole = req.body?.recipientRole == null ? null : String(req.body.recipientRole).trim().toLowerCase();
  if (!subject || subject.length > 160 || !text || text.length > 1200 || (recipientId !== null && !Number.isInteger(recipientId)) || (recipientRole !== null && !/^(student|learner|teacher|prefect|manager|senior_manager|owner|admin)$/.test(recipientRole)) || (recipientId !== null && recipientRole !== null)) {
    res.status(400).json({ error: "Provide a subject, message and one recipient target (user, role, or all users)." }); return;
  }
  if (channel === "sms" && !isSmsConfigured()) { res.status(503).json({ error: "SMS is not configured. Add the authorized Twilio account SID, auth token and sender number; no message was sent." }); return; }
  if (channel === "whatsapp" && !isWhatsAppConfigured()) { res.status(503).json({ error: "WhatsApp is not configured. Add an authorized Twilio WhatsApp sender; no message was sent." }); return; }
  try {
    const recipients = await resolveVerifiedPhoneRecipients(recipientId, recipientRole);
    if (!recipients.phones.length) {
      res.status(404).json({ error: "No active verified phone numbers were found for this recipient selection.", skippedUnverified: recipients.skippedUnverified }); return;
    }
    const outcomes = await Promise.allSettled(recipients.phones.map(phone => channel === "sms"
      ? sendSms(phone, subject + "\n\n" + text)
      : sendWhatsApp(phone, subject + "\n\n" + text)));
    const accepted = outcomes.filter(outcome => outcome.status === "fulfilled").length;
    const failed = outcomes.length - accepted;
    if (failed) {
      res.status(503).json({ error: "Some phone notifications were rejected. Check provider configuration and retry only the failed recipients.", acceptedByProvider: accepted, failed, skippedUnverified: recipients.skippedUnverified }); return;
    }
    res.json({ ok: true, channel, acceptedByProvider: accepted, skippedUnverified: recipients.skippedUnverified, message: "Accepted by the provider. Final delivery depends on carrier or WhatsApp delivery status." });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Phone notification delivery is unavailable." });
  }
}

router.post("/notifications/send-sms", requireAuth, async (req, res): Promise<void> => sendPhoneNotification(req, res, "sms"));
router.post("/notifications/send-whatsapp", requireAuth, async (req, res): Promise<void> => sendPhoneNotification(req, res, "whatsapp"));
\n// GET /notifications — List notifications for current user (includes broadcasts)
router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  // Authenticated notification lists are private and must never be served from a stale cache.
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  const currentUser = req.currentUser!;
  const notifications = await db.select().from(notificationsTable)
    .where(or(eq(notificationsTable.recipientId, currentUser.id), isNull(notificationsTable.recipientId)))
    .orderBy(desc(notificationsTable.createdAt), desc(notificationsTable.id));
  res.json(notifications.map(n => ({ ...n, createdAt: n.createdAt.toISOString() })));
});

// POST /notifications — Create (teacher/owner only)
router.post("/notifications", requireAuth, async (req, res): Promise<void> => {
  if (!canAccessManager(req.currentUser!) && !req.currentUser?.isPrefect) { res.status(403).json({ error: "Only authorized staff or prefects can create notifications" }); return; }
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
    .where(and(
      eq(notificationsTable.id, params.data.id),
      or(eq(notificationsTable.recipientId, req.currentUser!.id), isNull(notificationsTable.recipientId)),
    ))
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
