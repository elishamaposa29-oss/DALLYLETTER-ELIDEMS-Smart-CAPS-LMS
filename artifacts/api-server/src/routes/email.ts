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
  const recipientRole = req.body?.recipientRole == null ? null : String(req.body.recipientRole).trim().toLowerCase();
  if (!subject || subject.length > 200 || !text || text.length > 20000 || (recipientId !== null && !Number.isInteger(recipientId)) || (recipientRole !== null && !/^(student|learner|teacher|prefect|manager|senior_manager|owner|admin)$/.test(recipientRole)) || (recipientId !== null && recipientRole !== null)) {
    res.status(400).json({ error: "Provide a valid subject, message, and one recipient target (user, role, or all users)." }); return;
  }
  try {
    const resolution = await resolveNotificationRecipients(recipientId, recipientRole);
    if (!resolution.emails.length) {
      const error = recipientId !== null
        ? "This user has no verified notification email. Ask them to set and verify it in Profile Hub."
        : recipientRole
          ? "No users in this selection have a verified notification email."
          : "No users have a verified notification email yet.";
      res.status(404).json({ error, skippedMissingNotificationEmail: resolution.skippedMissingNotificationEmail });
      return;
    }
    const result = await sendEmail({ to: resolution.emails, subject, text, html });
    res.json({ ok: true, recipientCount: resolution.emails.length, skippedMissingNotificationEmail: resolution.skippedMissingNotificationEmail, recipientRole, recipientId, ...result });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Email delivery unavailable" });
  }
});

export default router;
