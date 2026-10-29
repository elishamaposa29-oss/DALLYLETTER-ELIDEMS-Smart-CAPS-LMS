import { logger } from "./logger";
import { pool } from "@workspace/db";

function config() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  return accountSid && authToken && from ? { accountSid, authToken, from } : null;
}

export function isSmsConfigured(): boolean {
  return config() !== null;
}

export async function sendSms(to: string, body: string): Promise<void> {
  const cfg = config();
  if (!cfg) {
    logger.error({ event: "sms.delivery.failed", provider: "twilio", reason: "not_configured" }, "SMS delivery is not configured");
    throw new Error("SMS delivery is not configured.");
  }
  if (!/^\+[1-9]\d{7,14}$/.test(to)) throw new Error("Phone number must be in international E.164 format.");
  const url = "https://api.twilio.com/2010-04-01/Accounts/" + encodeURIComponent(cfg.accountSid) + "/Messages.json";
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(cfg.accountSid + ":" + cfg.authToken).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: cfg.from, Body: body.slice(0, 1500) }).toString(),
    });
    if (!response.ok) {
      logger.error({ event: "sms.delivery.failed", provider: "twilio", status: response.status }, "SMS provider rejected delivery request");
      throw new Error("SMS provider rejected the delivery request.");
    }
    logger.info({ event: "sms.delivery.succeeded", provider: "twilio", status: response.status }, "SMS accepted by provider");
  } catch (error) {
    if (!(error instanceof Error && error.message === "SMS provider rejected the delivery request.")) {
      logger.error({ event: "sms.delivery.failed", provider: "twilio", reason: error instanceof Error ? error.message.slice(0, 200) : "network_error" }, "SMS provider request failed");
    }
    throw error;
  }
}

function whatsAppConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_WHATSAPP_FROM?.trim();
  return accountSid && authToken && from ? { accountSid, authToken, from: from.startsWith("whatsapp:") ? from : "whatsapp:" + from } : null;
}

export function isWhatsAppConfigured(): boolean {
  return whatsAppConfig() !== null;
}

export async function sendWhatsApp(to: string, body: string): Promise<void> {
  const cfg = whatsAppConfig();
  if (!cfg) throw new Error("WhatsApp delivery is not configured. Set TWILIO_WHATSAPP_FROM with an approved WhatsApp sender.");
  if (!/^\+[1-9]\d{7,14}$/.test(to)) throw new Error("Phone number must be in international E.164 format.");
  const url = "https://api.twilio.com/2010-04-01/Accounts/" + encodeURIComponent(cfg.accountSid) + "/Messages.json";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(cfg.accountSid + ":" + cfg.authToken).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: "whatsapp:" + to, From: cfg.from, Body: body.slice(0, 1500) }).toString(),
  });
  if (!response.ok) {
    logger.error({ event: "whatsapp.delivery.failed", provider: "twilio", status: response.status }, "WhatsApp provider rejected delivery request");
    throw new Error("WhatsApp provider rejected the delivery request.");
  }
  logger.info({ event: "whatsapp.delivery.accepted", provider: "twilio", status: response.status }, "WhatsApp message accepted by provider; recipient delivery must be confirmed separately");
}

let recoveryPhoneSchemaReady = false;
async function ensureRecoveryPhoneSchema(): Promise<void> {
  if (recoveryPhoneSchemaReady) return;
  await pool.query("CREATE TABLE IF NOT EXISTS account_recovery_profiles (user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, recovery_email text, recovery_email_verified_at timestamptz, recovery_phone text, recovery_phone_verified_at timestamptz, security_question text, security_answer_hash text, verification_code_hash text, verification_expires_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now())");
  await pool.query("ALTER TABLE account_recovery_profiles ADD COLUMN IF NOT EXISTS phone_verification_code_hash text");
  await pool.query("ALTER TABLE account_recovery_profiles ADD COLUMN IF NOT EXISTS phone_verification_expires_at timestamptz");
  await pool.query("ALTER TABLE account_recovery_profiles ADD COLUMN IF NOT EXISTS phone_verification_attempts integer NOT NULL DEFAULT 0");
  recoveryPhoneSchemaReady = true;
}

const PHONE_ROLE_ALLOWLIST = new Set(["student", "learner", "teacher", "prefect", "manager", "senior_manager", "owner", "admin"]);

export async function resolveVerifiedPhoneRecipients(recipientId: number | null, recipientRole: string | null = null): Promise<{ phones: string[]; skippedUnverified: number }> {
  await ensureRecoveryPhoneSchema();
  let rows: Array<{ recovery_phone: string | null; recovery_phone_verified_at: Date | string | null }>;
  if (recipientId !== null) {
    const result = await pool.query(
      "SELECT r.recovery_phone, r.recovery_phone_verified_at FROM users u LEFT JOIN account_recovery_profiles r ON r.user_id=u.id WHERE u.id=$1 AND u.is_blocked=false AND u.is_suspended=false",
      [recipientId],
    );
    rows = result.rows;
  } else if (recipientRole !== null) {
    const role = recipientRole.trim().toLowerCase();
    if (!PHONE_ROLE_ALLOWLIST.has(role)) throw new Error("Choose a supported recipient role.");
    const roles = role === "learner" || role === "student" ? ["learner", "student"] : [role];
    const result = await pool.query(
      "SELECT r.recovery_phone, r.recovery_phone_verified_at FROM users u LEFT JOIN account_recovery_profiles r ON r.user_id=u.id WHERE lower(u.role)=ANY($1::text[]) AND u.is_blocked=false AND u.is_suspended=false ORDER BY u.id",
      [roles],
    );
    rows = result.rows;
  } else {
    const result = await pool.query(
      "SELECT r.recovery_phone, r.recovery_phone_verified_at FROM users u LEFT JOIN account_recovery_profiles r ON r.user_id=u.id WHERE u.is_blocked=false AND u.is_suspended=false ORDER BY u.id",
    );
    rows = result.rows;
  }
  const valid = rows.filter(row => row.recovery_phone_verified_at && typeof row.recovery_phone === "string" && /^\+[1-9]\d{7,14}$/.test(row.recovery_phone));
  const phones = [...new Set(valid.map(row => row.recovery_phone as string))];
  return { phones, skippedUnverified: Math.max(0, rows.length - valid.length) };
}
