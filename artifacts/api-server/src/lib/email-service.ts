import { pool } from "@workspace/db";
import { logger } from "./logger";

type EmailInput = { to: string[]; subject: string; text: string; html?: string };

function config() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

export function isEmailConfigured(): boolean { return config() !== null; }

export async function sendEmail(input: EmailInput): Promise<{ sent: number; failed: number }> {
  const cfg = config();
  if (!cfg) {
    logger.error({ event: "email.delivery.failed", provider: "resend", reason: "not_configured", subject: input.subject }, "Email delivery is not configured");
    throw new Error("Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM on the server.");
  }
  const recipients = [...new Set(input.to.map(v => v.trim().toLowerCase()).filter(v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)))];
  if (!recipients.length) {
    logger.warn({ event: "email.delivery.skipped", provider: "resend", reason: "no_valid_recipients", subject: input.subject }, "Email delivery skipped because there are no valid recipients");
    return { sent: 0, failed: 0 };
  }
  let sent = 0;
  let failed = 0;
  for (const recipient of recipients) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: cfg.from, to: [recipient], subject: input.subject, text: input.text, html: input.html ?? undefined }),
      });
      if (response.ok) {
        sent++;
        logger.info({ event: "email.delivery.succeeded", provider: "resend", status: response.status, subject: input.subject }, "Email accepted by provider");
      } else {
        failed++;
        logger.error({ event: "email.delivery.failed", provider: "resend", status: response.status, subject: input.subject }, "Email provider rejected delivery request");
      }
    } catch (error) {
      failed++;
      logger.error({ event: "email.delivery.failed", provider: "resend", reason: error instanceof Error ? error.message.slice(0, 200) : "network_error", subject: input.subject }, "Email provider request failed");
    }
  }
  if (sent === 0 && failed > 0) throw new Error("Email provider rejected every recipient");
  return { sent, failed };
}

export async function resolveNotificationRecipients(recipientId: number | null): Promise<string[]> {
  if (recipientId !== null) {
    const { rows } = await pool.query("SELECT CASE WHEN notification_email_verified_at IS NOT NULL THEN notification_email ELSE email END AS email FROM users WHERE id = $1 AND is_blocked = false", [recipientId]);
    return rows.map((r: { email: string }) => r.email);
  }
  const { rows } = await pool.query("SELECT CASE WHEN notification_email_verified_at IS NOT NULL THEN notification_email ELSE email END AS email FROM users WHERE is_blocked = false AND email IS NOT NULL");
  return rows.map((r: { email: string }) => r.email);
}
