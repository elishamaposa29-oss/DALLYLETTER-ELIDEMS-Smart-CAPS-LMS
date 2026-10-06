import { Router } from "express";
import { requireAuth, canAccessManager } from "../lib/auth-middleware";
import { isEmailConfigured, resolveNotificationRecipients, sendEmail } from "../lib/email-service";

const router = Router();

router.get("/email/config", requireAuth, (req, res) => {
  if (!canAccessManager(req.currentUser!)) { res.status(403).json({ error: "Forbidden" }); return; }
  res.json({ enabled: isEmailConfigured(), provider: isEmailConfigured() ? "resend" : null });
});

router.post("/email/send", requireAuth, async (req, res): Promise<void> => {
  if (!canAccessManager(req.currentUser!)) { res.status(403).json({ error: "Only managers and owners can send email" }); return; }
  const subject = typeof req.body?.subject === "string" ? req.body.subject.trim() : "";
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const html = typeof req.body?.html === "string" ? req.body.html : undefined;
  const recipientId = req.body?.recipientId == null ? null : Number(req.body.recipientId);
  if (!subject || subject.length > 200 || !text || text.length > 20000 || (recipientId !== null && !Number.isInteger(recipientId))) {
    res.status(400).json({ error: "Valid subject, message and recipient are required" }); return;
  }
  try {
    const recipients = await resolveNotificationRecipients(recipientId);
    const result = await sendEmail({ to: recipients, subject, text, html });
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Email delivery unavailable" });
  }
});

export default router;
