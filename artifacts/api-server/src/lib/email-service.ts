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

const NOTIFICATION_ROLE_ALLOWLIST = new Set(["student", "learner", "teacher", "prefect", "manager", "senior_manager", "owner", "admin"]);

type NotificationRecipientResolution = { emails: string[]; skippedMissingNotificationEmail: number };

export async function resolveNotificationRecipients(recipientId: number | null, recipientRole: string | null = null): Promise<NotificationRecipientResolution> {
  let totalUsers = 0;
  let rows: Array<{ notification_email: string | null }> = [];
  if (recipientId !== null) {
    const { rows: users } = await pool.query(
      "SELECT notification_email, notification_email_verified_at FROM users WHERE id=$1 AND is_blocked=false AND is_suspended=false",
      [recipientId],
    );
    if (!users.length) return { emails: [], skippedMissingNotificationEmail: 0 };
    totalUsers = 1;
    rows = users.filter((row: { notification_email: string | null; notification_email_verified_at: Date | string | null }) =>
      row.notification_email_verified_at && typeof row.notification_email === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.notification_email)
    );
  } else if (recipientRole !== null) {
    const role = recipientRole.trim().toLowerCase();
    if (!NOTIFICATION_ROLE_ALLOWLIST.has(role)) throw new Error("Choose a supported recipient role.");
    const roles = role === "learner" || role === "student" ? ["learner", "student"] : [role];
    const count = await pool.query("SELECT count(*)::int AS total FROM users WHERE lower(role)=ANY($1::text[]) AND is_blocked=false AND is_suspended=false", [roles]);
    totalUsers = Number(count.rows[0]?.total || 0);
    const result = await pool.query(
      "SELECT notification_email, notification_email_verified_at FROM users WHERE lower(role)=ANY($1::text[]) AND is_blocked=false AND is_suspended=false AND notification_email_verified_at IS NOT NULL AND notification_email IS NOT NULL AND btrim(notification_email)<>'' ORDER BY id",
      [roles],
    );
    rows = result.rows;
  } else {
    const count = await pool.query("SELECT count(*)::int AS total FROM users WHERE is_blocked=false AND is_suspended=false");
    totalUsers = Number(count.rows[0]?.total || 0);
    const result = await pool.query(
      "SELECT notification_email, notification_email_verified_at FROM users WHERE is_blocked=false AND is_suspended=false AND notification_email_verified_at IS NOT NULL AND notification_email IS NOT NULL AND btrim(notification_email)<>'' ORDER BY id",
    );
    rows = result.rows;
  }
  const eligibleRows = rows.filter((row: { notification_email: string | null; notification_email_verified_at?: Date | string | null }) => {
    const email = row.notification_email?.trim() || "";
    return /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)
      && (recipientId === null || row.notification_email_verified_at);
  });
  const emails = [...new Set(eligibleRows.map((row: { notification_email: string | null }) => row.notification_email!.trim().toLowerCase()))];
  return { emails, skippedMissingNotificationEmail: Math.max(0, totalUsers - eligibleRows.length) };
}
