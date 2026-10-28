import { Router, type IRouter } from "express";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, usersTable, pool } from "@workspace/db";
import { requireAuth } from "../lib/auth-middleware";
import { verifyPassword } from "../lib/password-hash";
import { consumeAuthAttempt, revokeUserSessions } from "../lib/auth-session-store";
import { isEmailConfigured, sendEmail } from "../lib/email-service";

const router: IRouter = Router();
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const appUrl = () => (process.env.PUBLIC_APP_URL ?? process.env.APP_BASE_URL ?? "").replace(/\/$/, "");
const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function issueToken(userId: number, purpose: "signup" | "email_change", email: string): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  await pool.query(
    "UPDATE account_email_tokens SET used_at=COALESCE(used_at,now()) WHERE user_id=$1 AND purpose=$2 AND used_at IS NULL",
    [userId, purpose],
  );
  await pool.query(
    "INSERT INTO account_email_tokens (token_hash,user_id,purpose,email,expires_at) VALUES ($1,$2,$3,$4,now()+interval '30 minutes')",
    [digest(raw), userId, purpose, email],
  );
  return raw;
}

// Signup verification is additive: current mobile/web sessions remain compatible.
// The token itself is never returned to the client or stored in plaintext.
router.post("/auth/email-verification/request", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!isEmailConfigured()) { res.status(503).json({ error: "Email verification is not configured on the server." }); return; }
  const ip = req.ip || "unknown";
  if (await consumeAuthAttempt("signup-email-resend", String(user.id), ip, 4, 60 * 60 * 1000, 60 * 60 * 1000)) {
    res.status(429).json({ error: "Too many verification requests. Try again later." }); return;
  }
  const status = await pool.query("SELECT email,verified_at FROM account_email_status WHERE user_id=$1", [user.id]);
  if (status.rows[0]?.verified_at && String(status.rows[0].email).toLowerCase() === user.email.toLowerCase()) {
    res.json({ sent: false, verified: true, message: "This email address is already verified." }); return;
  }
  const baseUrl = appUrl();
  if (!baseUrl) { res.status(503).json({ error: "PUBLIC_APP_URL must be configured before verification links can be sent." }); return; }
  const raw = await issueToken(user.id, "signup", user.email.toLowerCase());
  try {
    await sendEmail({
      to: [user.email],
      subject: "Verify your Dallyletter Elidems email",
      text: "Confirm your email within 30 minutes: " + baseUrl + "/verify-email?token=" + encodeURIComponent(raw) + "\n\nIf you did not create this account, ignore this message.",
    });
    res.json({ sent: true, expiresInSeconds: 1800, message: "Verification message accepted by the email provider." });
  } catch {
    res.status(503).json({ error: "The email provider could not accept the verification message. Try again later." });
  }
});

router.post("/auth/email-verification/confirm", async (req, res): Promise<void> => {
  const raw = typeof req.body?.token === "string" ? req.body.token : "";
  if (!/^[a-f0-9]{64}$/i.test(raw)) { res.status(400).json({ error: "A valid verification token is required." }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      "SELECT user_id,email FROM account_email_tokens WHERE token_hash=$1 AND purpose='signup' AND used_at IS NULL AND expires_at>now() FOR UPDATE",
      [digest(raw)],
    );
    const row = found.rows[0] as { user_id: number | string; email: string } | undefined;
    if (!row) { await client.query("ROLLBACK"); res.status(400).json({ error: "This verification link is invalid, expired, or already used." }); return; }
    const changed = await client.query("UPDATE account_email_tokens SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL RETURNING token_hash", [digest(raw)]);
    if (changed.rowCount !== 1) { await client.query("ROLLBACK"); res.status(400).json({ error: "This verification link has already been used." }); return; }
    await client.query(
      "INSERT INTO account_email_status (user_id,email,verified_at,updated_at) VALUES ($1,$2,now(),now()) ON CONFLICT (user_id) DO UPDATE SET email=EXCLUDED.email,verified_at=now(),updated_at=now()",
      [Number(row.user_id), row.email],
    );
    await client.query("COMMIT");
    res.json({ verified: true, message: "Email address verified successfully." });
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    res.status(503).json({ error: "Email verification is temporarily unavailable." });
  } finally { client.release(); }
});

// A primary email only changes after password re-authentication and proof of control
// of the new address. The old address receives a security notification.
router.post("/auth/email-change/request", requireAuth, async (req, res): Promise<void> => {
  const actor = req.currentUser!;
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
  if (!emailPattern.test(email) || email.length > 254 || !currentPassword) {
    res.status(400).json({ error: "A valid new email address and current password are required." }); return;
  }
  if (email === actor.email.toLowerCase()) { res.status(400).json({ error: "That is already your current email address." }); return; }
  if (!isEmailConfigured()) { res.status(503).json({ error: "Email changes are unavailable until email delivery is configured." }); return; }
  const ip = req.ip || "unknown";
  if (await consumeAuthAttempt("email-change", String(actor.id), ip, 4, 60 * 60 * 1000, 60 * 60 * 1000)) {
    res.status(429).json({ error: "Too many email-change requests. Try again later." }); return;
  }
  const [current] = await db.select().from(usersTable).where(eq(usersTable.id, actor.id));
  if (!current || !(await verifyPassword(currentPassword, current.passwordHash)).valid) {
    res.status(401).json({ error: "Current password is incorrect." }); return;
  }
  const duplicate = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
  if (duplicate.length) { res.status(409).json({ error: "That email address is already associated with an account." }); return; }
  const baseUrl = appUrl();
  if (!baseUrl) { res.status(503).json({ error: "PUBLIC_APP_URL must be configured before email changes can be confirmed." }); return; }
  const raw = await issueToken(actor.id, "email_change", email);
  try {
    await sendEmail({
      to: [email],
      subject: "Confirm your Dallyletter Elidems email change",
      text: "Confirm the new email address within 30 minutes: " + baseUrl + "/confirm-email-change?token=" + encodeURIComponent(raw) + "\n\nYour current email remains active until confirmation. If you did not request this, contact support.",
    });
    await sendEmail({
      to: [current.email],
      subject: "Dallyletter Elidems email-change request",
      text: "A request was made to change the email address on your account. The change is not active until the new address is confirmed. If this was not you, change your password and contact support.",
    }).catch(() => undefined);
    res.json({ requested: true, expiresInSeconds: 1800, message: "Confirmation message accepted by the email provider. Your current email remains active until confirmation." });
  } catch {
    res.status(503).json({ error: "The email provider could not accept the confirmation message. Try again later." });
  }
});

router.post("/auth/email-change/confirm", async (req, res): Promise<void> => {
  const raw = typeof req.body?.token === "string" ? req.body.token : "";
  if (!/^[a-f0-9]{64}$/i.test(raw)) { res.status(400).json({ error: "A valid email-change token is required." }); return; }
  const client = await pool.connect();
  let userId = 0;
  try {
    await client.query("BEGIN");
    const found = await client.query(
      "SELECT user_id,email FROM account_email_tokens WHERE token_hash=$1 AND purpose='email_change' AND used_at IS NULL AND expires_at>now() FOR UPDATE",
      [digest(raw)],
    );
    const row = found.rows[0] as { user_id: number | string; email: string } | undefined;
    if (!row) { await client.query("ROLLBACK"); res.status(400).json({ error: "This email-change link is invalid, expired, or already used." }); return; }
    userId = Number(row.user_id);
    const collision = await client.query("SELECT id FROM users WHERE lower(email)=lower($1) AND id<>$2 LIMIT 1", [row.email, userId]);
    if (collision.rows.length) { await client.query("ROLLBACK"); res.status(409).json({ error: "That email address is already associated with another account." }); return; }
    const updated = await client.query("UPDATE users SET email=$1,updated_at=now() WHERE id=$2 RETURNING id", [row.email, userId]);
    if (updated.rowCount !== 1) { await client.query("ROLLBACK"); res.status(404).json({ error: "Account no longer exists." }); return; }
    await client.query("UPDATE account_email_tokens SET used_at=now() WHERE token_hash=$1", [digest(raw)]);
    await client.query("UPDATE account_email_tokens SET used_at=COALESCE(used_at,now()) WHERE user_id=$1 AND purpose='email_change' AND used_at IS NULL", [userId]);
    await client.query(
      "INSERT INTO account_email_status (user_id,email,verified_at,updated_at) VALUES ($1,$2,now(),now()) ON CONFLICT (user_id) DO UPDATE SET email=EXCLUDED.email,verified_at=now(),updated_at=now()",
      [userId, row.email],
    );
    await client.query("COMMIT");
    await revokeUserSessions(userId);
    res.json({ changed: true, email: row.email, message: "Email address changed and verified. Sign in again with the new address." });
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    res.status(503).json({ error: "Email change is temporarily unavailable." });
  } finally { client.release(); }
});

export default router;
