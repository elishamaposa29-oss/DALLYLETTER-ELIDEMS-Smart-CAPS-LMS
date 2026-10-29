import { Router } from "express";
import { pool } from "@workspace/db";
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
  const recipientRole = typeof req.body?.recipientRole === "string" ? req.body.recipientRole.trim().toLowerCase() : "";
  if (!subject || subject.length > 200 || !text || text.length > 20000 || (recipientId !== null && !Number.isInteger(recipientId)) || (recipientRole && !["student","teacher","manager","prefect"].includes(recipientRole))) {
    res.status(400).json({ error: "Valid subject, message and recipient are required" }); return;
  }
  try {
    let recipients: string[] = [];
    let eligibleCount = 0;
    if (recipientRole) {
      const query = recipientRole === "prefect"
        ? await pool.query("SELECT notification_email FROM users WHERE is_prefect=true AND is_blocked=false AND is_suspended=false AND notification_email_verified_at IS NOT NULL AND notification_email IS NOT NULL AND btrim(notification_email)<>''")
        : recipientRole === "manager"
          ? await pool.query("SELECT notification_email FROM users WHERE (is_manager=true OR lower(role) IN ('manager','senior_manager')) AND is_blocked=false AND is_suspended=false AND notification_email_verified_at IS NOT NULL AND notification_email IS NOT NULL AND btrim(notification_email)<>''")
          : await pool.query("SELECT notification_email FROM users WHERE lower(role)=$1 AND is_blocked=false AND is_suspended=false AND notification_email_verified_at IS NOT NULL AND notification_email IS NOT NULL AND btrim(notification_email)<>''", [recipientRole]);
      recipients = query.rows.map((row: { notification_email: string }) => String(row.notification_email));
      eligibleCount = recipients.length;
    } else if (recipientId !== null) {
      const query = await pool.query("SELECT notification_email FROM users WHERE id=$1 AND is_blocked=false AND is_suspended=false AND notification_email_verified_at IS NOT NULL AND notification_email IS NOT NULL AND btrim(notification_email)<>''", [recipientId]);
      recipients = query.rows.map((row: { notification_email: string }) => String(row.notification_email));
      if (!recipients.length) { res.status(422).json({ error: "This user has no verified notification email. No email was sent." }); return; }
      eligibleCount = recipients.length;
    } else {
      const query = await pool.query("SELECT notification_email FROM users WHERE is_blocked=false AND is_suspended=false AND notification_email_verified_at IS NOT NULL AND notification_email IS NOT NULL AND btrim(notification_email)<>''");
      recipients = query.rows.map((row: { notification_email: string }) => String(row.notification_email));
      eligibleCount = recipients.length;
    }
    if (!recipients.length) { res.status(422).json({ error: "No active recipients have a verified notification email. No email was sent." }); return; }
    const result = await sendEmail({ to: recipients, subject, text, html });
    res.json({ ok: true, ...result, eligibleRecipients: eligibleCount, delivery: "provider_accepted" });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Email delivery unavailable", delivery: "failed" });
  }
});

export default router;
