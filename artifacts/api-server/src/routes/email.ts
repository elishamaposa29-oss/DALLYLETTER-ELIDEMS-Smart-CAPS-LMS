import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth, canAccessManager } from "../lib/auth-middleware";
import { isEmailConfigured, sendEmail } from "../lib/email-service";
import { isSmsConfigured, sendSms, sendWhatsApp } from "../lib/sms-service";

const router = Router();

router.get("/email/config", requireAuth, (req, res) => {
  if (!canAccessManager(req.currentUser!)) { res.status(403).json({ error: "Forbidden" }); return; }
  res.json({ emailEnabled: isEmailConfigured(), smsEnabled: isSmsConfigured(), whatsappEnabled: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM) });
});

router.post("/email/send", requireAuth, async (req, res): Promise<void> => {
  if (!canAccessManager(req.currentUser!)) { res.status(403).json({ error: "Only managers and owners can send email or phone notifications" }); return; }
  const subject = typeof req.body?.subject === "string" ? req.body.subject.trim() : "";
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const html = typeof req.body?.html === "string" ? req.body.html : undefined;
  const recipientId = req.body?.recipientId == null ? null : Number(req.body.recipientId);
  const recipientRole = typeof req.body?.recipientRole === "string" ? req.body.recipientRole.trim().toLowerCase() : "";
  const wantsEmail = req.body?.sendEmail === true || (!("sendEmail" in (req.body ?? {})) && req.body?.sendSms !== true && req.body?.sendWhatsApp !== true);
  const wantsSms = req.body?.sendSms === true;
  const wantsWhatsApp = req.body?.sendWhatsApp === true;
  if (!subject || subject.length > 200 || !text || text.length > 20000 || (recipientId !== null && !Number.isInteger(recipientId)) || (recipientRole && !["student","teacher","manager","prefect"].includes(recipientRole)) || (!wantsEmail && !wantsSms && !wantsWhatsApp)) {
    res.status(400).json({ error: "Valid subject, message, recipient and at least one delivery channel are required" }); return;
  }
  try {
    await pool.query("CREATE TABLE IF NOT EXISTS account_recovery_profiles (user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, recovery_email text, recovery_email_verified_at timestamptz, recovery_phone text, recovery_phone_verified_at timestamptz, security_question text, security_answer_hash text, verification_code_hash text, verification_expires_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now())");
    let where = "u.is_blocked=false AND u.is_suspended=false";
    const params: unknown[] = [];
    if (recipientId !== null) { params.push(recipientId); where += " AND u.id=$" + params.length; }
    else if (recipientRole === "prefect") where += " AND u.is_prefect=true";
    else if (recipientRole === "manager") where += " AND (u.is_manager=true OR lower(u.role) IN ('manager','senior_manager'))";
    else if (recipientRole) { params.push(recipientRole); where += " AND lower(u.role)=$" + params.length; }
    const result = await pool.query(
      "SELECT u.id,u.notification_email,u.notification_email_verified_at,r.recovery_phone,r.recovery_phone_verified_at FROM users u LEFT JOIN account_recovery_profiles r ON r.user_id=u.id WHERE " + where,
      params,
    );
    const rows = result.rows as Array<{id:number;notification_email:string|null;notification_email_verified_at:Date|null;recovery_phone:string|null;recovery_phone_verified_at:Date|null}>;
    if (!rows.length) { res.status(404).json({ error: "No active recipients matched. No messages were sent." }); return; }
    const report: Record<string, unknown> = { matchedRecipients: rows.length, email: null, sms: null, whatsapp: null };
    let successes = 0;
    const failures: string[] = [];
    if (wantsEmail) {
      const emails = rows.filter(row => row.notification_email_verified_at && row.notification_email?.trim()).map(row => row.notification_email!.trim());
      if (!emails.length) { report.email = { sent: 0, failed: rows.length, error: "No matched recipients have a verified notification email." }; failures.push("email"); }
      else try {
        const sent = await sendEmail({ to: emails, subject, text, html });
        report.email = { ...sent, skipped: rows.length - emails.length, status: "provider_accepted" }; successes += sent.sent;
      } catch (error) { report.email = { sent: 0, failed: emails.length, error: error instanceof Error ? error.message : "Email delivery failed" }; failures.push("email"); }
    }
    if (wantsSms) {
      const phones = [...new Set(rows.filter(row => row.recovery_phone_verified_at && row.recovery_phone).map(row => row.recovery_phone!))];
      let sent = 0; const errors: string[] = [];
      for (const phone of phones) { try { await sendSms(phone, subject + "\n\n" + text); sent++; } catch (error) { errors.push(error instanceof Error ? error.message : "SMS delivery failed"); } }
      report.sms = { sent, failed: rows.length - sent, skipped: rows.length - phones.length, error: errors[0] ?? null, status: sent ? "provider_accepted" : "failed" };
      successes += sent; if (!sent) failures.push("sms");
    }
    if (wantsWhatsApp) {
      const phones = [...new Set(rows.filter(row => row.recovery_phone_verified_at && row.recovery_phone).map(row => row.recovery_phone!))];
      let sent = 0; const errors: string[] = [];
      for (const phone of phones) { try { await sendWhatsApp(phone, subject + "\n\n" + text); sent++; } catch (error) { errors.push(error instanceof Error ? error.message : "WhatsApp delivery failed"); } }
      report.whatsapp = { sent, failed: rows.length - sent, skipped: rows.length - phones.length, error: errors[0] ?? null, status: sent ? "provider_accepted" : "failed" };
      successes += sent; if (!sent) failures.push("whatsapp");
    }
    if (!successes && failures.length) { res.status(503).json({ error: "All selected delivery channels failed or had no verified recipients. Check the per-channel results.", delivery: report }); return; }
    res.json({ ok: true, delivery: report, warning: failures.length ? "Some selected channels did not deliver; inspect channel results." : null });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Notification delivery unavailable", delivery: "failed" });
  }
});

export default router;
