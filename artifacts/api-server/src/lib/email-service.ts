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
    logger.error({ event: "email.delivery.failed", provider: "resend", reason: "no_valid_recipients", subject: input.subject }, "Email delivery failed because there are no valid recipients");
    throw new Error("Email delivery failed: no valid recipient address was provided.");
  }
  let sent = 0;
  let failed = 0;
  let senderDomainUnverified = false;
  for (const recipient of recipients) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: cfg.from, to: [recipient], subject: input.subject, text: input.text, html: input.html ?? undefined }),
      });
      const providerBody = await response.json().catch(() => ({})) as {
        id?: unknown;
        name?: unknown;
        message?: unknown;
        error?: unknown;
      };
      if (response.ok) {
        sent++;
        logger.info({
          event: "email.delivery.accepted",
          provider: "resend",
          status: response.status,
          messageId: typeof providerBody.id === "string" ? providerBody.id : undefined,
          subject: input.subject,
        }, "Email accepted by provider; inbox delivery must be confirmed separately");
      } else {
        failed++;
        const providerError = typeof providerBody.message === "string"
          ? providerBody.message
          : typeof providerBody.error === "string" ? providerBody.error : "provider_rejected";
        if (/only send testing emails to your own email address|verify a domain/i.test(providerError)) {
          senderDomainUnverified = true;
        }
        // Resend errors explain common setup failures (e.g. testing sender recipient restrictions).
        // Never log API credentials, recipient addresses, or message contents.
        logger.error({
          event: "email.delivery.failed",
          provider: "resend",
          status: response.status,
          providerError: providerError.slice(0, 240),
          providerErrorName: typeof providerBody.name === "string" ? providerBody.name.slice(0, 80) : undefined,
          subject: input.subject,
        }, "Email provider rejected delivery request");
      }
    } catch (error) {
      failed++;
      logger.error({ event: "email.delivery.failed", provider: "resend", reason: error instanceof Error ? error.message.slice(0, 200) : "network_error", subject: input.subject }, "Email provider request failed");
    }
  }
  if (failed > 0) {
    logger.error({ event: "email.delivery.incomplete", provider: "resend", sent, failed, subject: input.subject }, "Email delivery was incomplete; at least one recipient did not receive provider acceptance");
    if (senderDomainUnverified) {
      throw new Error("Resend is in testing mode. Verify a sending domain in Resend and set EMAIL_FROM to an address on that domain before sending to other recipients.");
    }
    throw new Error(sent === 0 ? "Email provider rejected every recipient." : "Email delivery was incomplete. Please retry; some recipients may not have received the message.");
  }
  if (sent !== recipients.length) throw new Error("Email delivery could not be confirmed for every recipient.");
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
