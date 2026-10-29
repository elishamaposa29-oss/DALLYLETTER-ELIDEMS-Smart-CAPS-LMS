import { Router, type IRouter } from "express";
import { createHash, createPublicKey, randomBytes, verify as verifySignature } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, usersTable, pool } from "@workspace/db";
import { RegisterUserBody, LoginUserBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth-middleware";
import { hashPassword, verifyPassword } from "../lib/password-hash";
import { generateSignedToken, parseSignedToken } from "../lib/signed-token";
import { isAllowedPublicRegistrationRole } from "../lib/registration-policy";
import { createAuthSession, revokeAuthSession, revokeUserSessions, createPasswordResetToken, consumePasswordResetToken, consumeAuthAttempt, clearAuthAttempts, updatePasswordAndRevokeSessions } from "../lib/auth-session-store";
import { sendEmail, isEmailConfigured } from "../lib/email-service";


type GoogleJwtHeader = { alg?: string; kid?: string; typ?: string };
type GoogleJwtClaims = { aud?: string | string[]; azp?: string; iss?: string; sub?: string; email?: string; email_verified?: string | boolean; name?: string; exp?: number; iat?: number };
type GoogleJwk = { kid: string; kty: string; alg?: string; use?: string; n: string; e: string };
let googleJwksCache: { keys: GoogleJwk[]; expiresAt: number } | undefined;

async function getGoogleJwks(forceRefresh = false): Promise<GoogleJwk[]> {
  if (!forceRefresh && googleJwksCache && googleJwksCache.expiresAt > Date.now()) return googleJwksCache.keys;
  const response = await fetch("https://www.googleapis.com/oauth2/v3/certs", { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("Google signing keys could not be fetched");
  const body = await response.json() as { keys?: GoogleJwk[] };
  if (!Array.isArray(body.keys) || body.keys.length === 0) throw new Error("Google signing keys response was invalid");
  const cacheControl = response.headers.get("cache-control") || "";
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/i)?.[1] || 300);
  googleJwksCache = { keys: body.keys, expiresAt: Date.now() + Math.max(60, Math.min(maxAge, 3600)) * 1000 };
  return body.keys;
}

async function verifyGoogleIdToken(credential: string, expectedClientId: string): Promise<GoogleJwtClaims | null> {
  const parts = credential.split(".");
  if (parts.length !== 3 || parts.some(part => !part)) return null;
  let header: GoogleJwtHeader;
  let claims: GoogleJwtClaims;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as GoogleJwtHeader;
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as GoogleJwtClaims;
  } catch { return null; }
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) return null;
  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(expectedClientId)
      || (claims.azp !== undefined && claims.azp !== expectedClientId)
      || (audiences.length > 1 && claims.azp !== expectedClientId)
      || !["accounts.google.com", "https://accounts.google.com"].includes(String(claims.iss))
      || typeof claims.sub !== "string" || claims.sub.length === 0 || claims.sub.length > 255
      || typeof claims.email !== "string" || claims.email.length > 254
      || String(claims.email_verified).toLowerCase() !== "true"
      || !Number.isFinite(claims.exp) || Number(claims.exp) <= now
      || !Number.isFinite(claims.iat) || Number(claims.iat) > now + 60 || Number(claims.iat) <= now - 86400) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const keys = await getGoogleJwks(attempt === 1);
    const jwk = keys.find(key => key.kid === header.kid && key.kty === "RSA" && (!key.alg || key.alg === "RS256") && (!key.use || key.use === "sig"));
    if (!jwk) continue;
    const publicKey = createPublicKey({ key: jwk, format: "jwk" });
    const signatureIsValid = verifySignature("RSA-SHA256", Buffer.from(parts[0] + "." + parts[1], "utf8"), publicKey, Buffer.from(parts[2], "base64url"));
    return signatureIsValid ? claims : null;
  }
  return null;
}

const router: IRouter = Router();

function getAuthSecret(): string {
  const fallbackSecret = process.env.NODE_ENV === "production" ? undefined : "dallyletter-local-secret";
  const secret = process.env.JWT_SECRET ?? process.env.AUTH_SECRET ?? fallbackSecret;

  if (!secret) {
    throw new Error("JWT_SECRET must be set in production");
  }

  return secret;
}

function generateToken(userId: number): string {
  return generateSignedToken(userId, getAuthSecret());
}

function parseToken(token: string): { userId: number } | null {
  try {
    return parseSignedToken(token, getAuthSecret());
  } catch {
    return null;
  }
}

export { parseToken };

function serializeErrorDetails(value: unknown, seen = new Set<unknown>()): Record<string, unknown> | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "object") return { value };
  if (seen.has(value)) return { message: "[Circular]" };

  seen.add(value);
  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {
    message: typeof record.message === "string" ? record.message : undefined,
    code: record.code,
    detail: record.detail,
    hint: record.hint,
    constraint: record.constraint,
    table: record.table,
    column: record.column,
    schema: record.schema,
    stack: typeof record.stack === "string" ? record.stack : undefined,
  };

  if (record.cause) {
    result.cause = serializeErrorDetails(record.cause, seen);
  }
  if (record.driverError) {
    result.driverError = serializeErrorDetails(record.driverError, seen);
  }
  if (record.originalError) {
    result.originalError = serializeErrorDetails(record.originalError, seen);
  }
  if (record.nativeError) {
    result.nativeError = serializeErrorDetails(record.nativeError, seen);
  }
  if (record.error) {
    result.error = serializeErrorDetails(record.error, seen);
  }

  return result;
}

function extractPostgresError(value: unknown, seen = new Set<unknown>()): Record<string, unknown> | undefined {
  if (value === null || value === undefined || typeof value !== "object") return undefined;
  if (seen.has(value)) return undefined;

  seen.add(value);
  const record = value as Record<string, unknown>;
  const hasPostgresFields = typeof record.message === "string"
    && (typeof record.code === "string"
      || typeof record.detail === "string"
      || typeof record.hint === "string"
      || typeof record.constraint === "string"
      || typeof record.table === "string"
      || typeof record.column === "string"
      || typeof record.schema === "string");

  if (hasPostgresFields) {
    return serializeErrorDetails(value, seen);
  }

  for (const key of ["cause", "driverError", "originalError", "nativeError", "error"]) {
    const candidate = extractPostgresError(record[key], seen);
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

function databaseFailureResponse(_error: unknown): { error: string; code: string; reason: string } {
  // Never expose SQL, schema, table, constraint, or infrastructure details to clients.
  return { error: "Database unavailable", code: "DATABASE_CONNECTION_FAILED", reason: "Please try again later." };
}

// POST /auth/register
router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { password, name, role, grade, subject, phone } = parsed.data;
  const email = parsed.data.email.trim().toLowerCase();
  const ipAddress = req.ip || "unknown";
  if (await consumeAuthAttempt("register", email, ipAddress, 5, 60 * 60 * 1000, 60 * 60 * 1000)
      || await consumeAuthAttempt("register-ip", "all-accounts", ipAddress, 20, 60 * 60 * 1000, 60 * 60 * 1000)) {
    res.status(429).json({ error: "Too many registration attempts. Please try again later." }); return;
  }
  // Public registration cannot create privileged accounts. Staff roles require an
  // explicit owner-controlled promotion/review workflow after signup.
  if (!isAllowedPublicRegistrationRole(role)) {
    res.status(403).json({ error: "This role cannot be created through public registration." });
    return;
  }

  try {
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, email));
    if (existing.length > 0) { res.status(400).json({ error: "Email already registered" }); return; }

    const [user] = await db.insert(usersTable).values({
      email, passwordHash: await hashPassword(password), name, role,
      grade: grade ?? null, subject: subject ?? null, phone: phone ?? null,
      isPrefect: false, isBlocked: false, isSuspended: false,
      teacherApplicationStatus: role === "teacher" ? "pending_review" : "not_applicable",
      teacherReviewDeadline: role === "teacher" ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) : null,
    }).returning();

    await clearAuthAttempts("register", email, ipAddress);
    const token = generateToken(user.id);
    await createAuthSession(token, user.id);
    const { passwordHash: _, ...safeUser } = user;
    res.status(201).json({ user: safeUser, token });
  } catch (error) {
    const { logger } = await import("../lib/logger");
    logger.error(
      {
        timestamp: new Date().toISOString(),
        event: "auth.register.db_error",
        method: req.method,
        path: req.path,
        email,
        err: serializeErrorDetails(error),
        postgresError: extractPostgresError(error),
      },
      "Registration database operation failed",
    );
    res.status(503).json(databaseFailureResponse(error));
  }
});

// POST /auth/login
router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const email = parsed.data.email.trim().toLowerCase();
    const password = parsed.data.password;
    const ipAddress = req.ip || "unknown";
    if (await consumeAuthAttempt("login", email, ipAddress, 8, 15 * 60 * 1000, 15 * 60 * 1000)
      || await consumeAuthAttempt("login-ip", "all-accounts", ipAddress, 40, 15 * 60 * 1000, 15 * 60 * 1000)) {
      res.status(429).json({ error: "Too many sign-in attempts. Please wait 15 minutes and try again." }); return;
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
    if (!user) {
      res.status(401).json({ error: "Invalid email or password" }); return;
    }
    const passwordVerification = await verifyPassword(password, user.passwordHash);
    if (!passwordVerification.valid) {
      res.status(401).json({ error: "Invalid email or password" }); return;
    }
    if (user.isBlocked || user.isSuspended) {
      res.status(403).json({ error: "Your account is unavailable. Please contact the school administrator." }); return;
    }

    if (passwordVerification.needsRehash) {
      // Upgrade legacy fixed-salt hashes after a successful login. Do not block
      // a valid login if a transient rehash write fails; retry on the next login.
      const upgradedHash = await hashPassword(password);
      try {
        await db.update(usersTable).set({ passwordHash: upgradedHash }).where(eq(usersTable.id, user.id));
      } catch (upgradeError) {
        const { logger } = await import("../lib/logger");
        logger.warn({ userId: user.id, error: upgradeError instanceof Error ? upgradeError.message.slice(0, 200) : "Unknown rehash error" }, "Legacy password hash upgrade failed; will retry on next login");
      }
    }

    await clearAuthAttempts("login", email, ipAddress);
    const token = generateToken(user.id);
    await createAuthSession(token, user.id);
    const { passwordHash: _, ...safeUser } = user;
    res.json({ user: safeUser, token });
  } catch (error) {
    const { logger } = await import("../lib/logger");
    logger.error(
      {
        timestamp: new Date().toISOString(),
        event: "auth.login.db_error",
        method: req.method,
        path: req.path,
        email: parsed.data.email,
        err: serializeErrorDetails(error),
        postgresError: extractPostgresError(error),
      },
      "Login database operation failed",
    );
    res.status(503).json(databaseFailureResponse(error));
  }
});

// POST /auth/logout
router.post("/auth/logout", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) await revokeAuthSession(authHeader.slice(7));
  res.json({ message: "Logged out successfully" });
});

// GET /auth/me
router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;
  const { passwordHash: _, ...safeUser } = currentUser;
  res.json(safeUser);
});

// POST /auth/google — verify a Google Identity Services ID token and link/sign in safely.
router.post("/auth/google", async (req, res): Promise<void> => {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const credential = typeof req.body?.credential === "string" ? req.body.credential : "";
  if (!clientId) { res.status(503).json({ error: "Google sign-in is not configured for this application yet." }); return; }
  if (!credential || credential.length > 12000) { res.status(400).json({ error: "A valid Google credential is required." }); return; }
  try {
    const claims = await verifyGoogleIdToken(credential, clientId);
    if (!claims) { res.status(401).json({ error: "Google identity token is invalid or its email is not verified." }); return; }
    const email = claims.email!.trim().toLowerCase();
    const linked = await pool.query("SELECT user_id FROM google_account_links WHERE google_sub = $1 LIMIT 1", [claims.sub]);
    let userId = linked.rows[0]?.user_id ? Number(linked.rows[0].user_id) : 0;
    if (!userId) {
      const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
      let user = existing;
      if (user && (user.isBlocked || user.isSuspended)) {
        res.status(403).json({ error: "This account is unavailable. Please contact the school administrator." }); return;
      }
      if (user) {
        const currentLink = await pool.query("SELECT google_sub FROM google_account_links WHERE user_id = $1 LIMIT 1", [user.id]);
        if (currentLink.rows.length && currentLink.rows[0].google_sub !== claims.sub) {
          res.status(409).json({ error: "This Dallyletter account is already linked to a different Google account." }); return;
        }
      } else {
        const [created] = await db.insert(usersTable).values({
          email,
          passwordHash: await hashPassword(randomBytes(32).toString("hex")),
          name: (claims.name?.trim() || email.split("@")[0]).slice(0, 200),
          role: "student",
          grade: null,
          subject: null,
          phone: null,
          isPrefect: false,
          isBlocked: false,
          isSuspended: false,
          teacherApplicationStatus: "not_applicable",
          teacherReviewDeadline: null,
        }).returning();
        user = created;
      }
      userId = user.id;
      await pool.query("INSERT INTO google_account_links (user_id, google_sub, email, updated_at) VALUES ($1,$2,$3,now()) ON CONFLICT (google_sub) DO NOTHING", [userId, claims.sub, email]);
      const verifyLink = await pool.query("SELECT user_id FROM google_account_links WHERE google_sub = $1", [claims.sub]);
      if (!verifyLink.rows[0] || Number(verifyLink.rows[0].user_id) !== userId) {
        res.status(409).json({ error: "Google account linking conflicted with an existing account. Sign in with your original method." }); return;
      }
    }
    const [signedIn] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!signedIn || signedIn.isBlocked || signedIn.isSuspended) { res.status(403).json({ error: "This account is unavailable." }); return; }
    // A verified Google address becomes the default notification email only when
    // the user has not already chosen a notification address. Never overwrite a preference.
    await pool.query(
      "UPDATE users SET notification_email = $1, notification_email_verified_at = now() WHERE id = $2 AND (notification_email IS NULL OR btrim(notification_email) = '')",
      [email, signedIn.id],
    );
    const token = generateToken(signedIn.id);
    await createAuthSession(token, signedIn.id);
    const { passwordHash: _passwordHash, ...safeUser } = signedIn;
    res.json({ user: safeUser, token });
  } catch (error) {
    const { logger } = await import("../lib/logger");
    logger.error({ event: "auth.google.sign_in_failed", reason: error instanceof Error ? error.message.slice(0, 200) : "unknown" }, "Google sign-in failed");
    res.status(503).json({ error: "Google sign-in could not be completed. Please try again." });
  }
});

// POST /auth/change-password — Change own password (any authenticated user)
router.post("/auth/change-password", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "currentPassword and newPassword are required" }); return;
  }
  if (newPassword.length < 8 || newPassword.length > 256) {
    res.status(400).json({ error: "New password must be between 8 and 256 characters" }); return;
  }

  // Re-fetch user with password hash
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, currentUser.id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const passwordVerification = await verifyPassword(currentPassword, user.passwordHash);
  if (!passwordVerification.valid) {
    res.status(400).json({ error: "Current password is incorrect" }); return;
  }

  await updatePasswordAndRevokeSessions(currentUser.id, await hashPassword(newPassword));
  res.json({ message: "Password changed successfully. Please sign in again on your devices." });
});


// Email changes are pending until the user confirms control of the new inbox.
async function ensureEmailChangeSchema(): Promise<void> {
  await pool.query("CREATE TABLE IF NOT EXISTS email_change_requests (user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, new_email text NOT NULL, token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now())");
  await pool.query("CREATE INDEX IF NOT EXISTS email_change_requests_expiry_idx ON email_change_requests (expires_at)");
}

router.post("/auth/email-change/request", requireAuth, async (req, res): Promise<void> => {
  const actor = req.currentUser!;
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254 || !currentPassword) {
    res.status(400).json({ error: "Enter a valid new email address and your current password." }); return;
  }
  if (!isEmailConfigured()) {
    res.status(503).json({ error: "Email verification is not configured. Your current email remains unchanged." }); return;
  }
  const ip = req.ip || "unknown";
  if (await consumeAuthAttempt("email-change-request", String(actor.id), ip, 5, 60 * 60 * 1000, 60 * 60 * 1000)) {
    res.status(429).json({ error: "Too many email-change requests. Try again later." }); return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, actor.id));
  if (!user) { res.status(404).json({ error: "Account not found." }); return; }
  if (!(await verifyPassword(currentPassword, user.passwordHash)).valid) {
    res.status(401).json({ error: "Current password is incorrect. Your email has not changed." }); return;
  }
  if (email === String(user.email || "").trim().toLowerCase()) {
    res.status(400).json({ error: "That is already your current email address." }); return;
  }
  const duplicate = await pool.query("SELECT id FROM users WHERE lower(email) = $1 AND id <> $2 LIMIT 1", [email, actor.id]);
  if (duplicate.rows.length) { res.status(409).json({ error: "That email address is already associated with another account." }); return; }
  await ensureEmailChangeSchema();
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await pool.query("INSERT INTO email_change_requests(user_id,new_email,token_hash,expires_at,created_at) VALUES($1,$2,$3,now()+interval '30 minutes',now()) ON CONFLICT(user_id) DO UPDATE SET new_email=EXCLUDED.new_email,token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at,created_at=now()", [actor.id, email, tokenHash]);
  const apiBase = (process.env.PUBLIC_API_URL || process.env.API_BASE_URL || "https://dallyletter-elidems-smart-caps-lms-4.onrender.com").replace(/\/+$/, "");
  const confirmUrl = apiBase + "/api/auth/confirm-email-change?token=" + encodeURIComponent(token);
  try {
    await sendEmail({
      to: [email],
      subject: "Confirm your Dallyletter Elidems email change",
      text: "A request was made to change your Dallyletter Elidems account email. To confirm this change, open: " + confirmUrl + "\n\nThis link expires in 30 minutes. Your current email remains active until you confirm. If you did not request this, ignore this message.",
      html: "<p>A request was made to change your Dallyletter Elidems account email.</p><p><a href=\"" + confirmUrl + "\">Confirm my new email address</a></p><p>This link expires in 30 minutes. Your current email remains active until you confirm. If you did not request this, ignore this message.</p>",
    });
    res.json({ message: "Confirmation email sent to the new address. Your current email remains active until you confirm from that inbox." });
  } catch (error) {
    await pool.query("DELETE FROM email_change_requests WHERE user_id=$1 AND token_hash=$2", [actor.id, tokenHash]);
    const { logger } = await import("../lib/logger");
    logger.error({ event: "auth.email_change.delivery_failed", userId: actor.id, reason: error instanceof Error ? error.message.slice(0, 200) : "unknown" }, "Email-change confirmation was not sent");
    res.status(503).json({ error: error instanceof Error && /Resend is in testing mode/i.test(error.message) ? "Email provider setup is blocking delivery: verify a sending domain in Resend and set EMAIL_FROM to an address on that domain. Your current email remains unchanged." : "The email provider could not send the confirmation. Your current email remains unchanged; verify the sender/domain and recipient permissions, then try again." });
  }
});

// Opening the email link shows a confirmation page; the account changes only after the user presses Confirm.
router.get("/auth/confirm-email-change", async (req, res): Promise<void> => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!/^[a-f0-9]{64}$/i.test(token)) { res.status(400).type("html").send("<!doctype html><title>Invalid link</title><p>This email-change link is invalid. Request a new one from Profile Hub.</p>"); return; }
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send("<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Confirm email change</title></head><body style=\"font-family:system-ui;max-width:34rem;margin:12vh auto;padding:1.5rem\"><h1>Confirm your Dallyletter email change</h1><p>Your current email stays active until you confirm.</p><button id=\"confirm\" style=\"padding:.8rem 1.2rem;font-size:1rem\">Confirm new email</button><p id=\"result\" role=\"status\"></p><script>document.getElementById('confirm').addEventListener('click',async()=>{const b=document.getElementById('confirm'),r=document.getElementById('result');b.disabled=true;r.textContent='Confirming…';try{const response=await fetch('/api/auth/email-change/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:new URLSearchParams(location.search).get('token')})});const data=await response.json();r.textContent=data.message||data.error||'Unable to confirm this email change.';if(!response.ok)b.disabled=false;}catch{r.textContent='Could not contact Dallyletter. Please try again.';b.disabled=false;}});</script></body></html>");
});

router.post("/auth/email-change/confirm", async (req, res): Promise<void> => {
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  if (!/^[a-f0-9]{64}$/i.test(token)) { res.status(400).json({ error: "This confirmation link is invalid or expired. Request a new one." }); return; }
  await ensureEmailChangeSchema();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const result = await pool.query("SELECT user_id,new_email FROM email_change_requests WHERE token_hash=$1 AND expires_at>now()", [tokenHash]);
  const request = result.rows[0] as { user_id: number; new_email: string } | undefined;
  if (!request) { res.status(400).json({ error: "This confirmation link is invalid, expired, or already used. Request a new one." }); return; }
  const duplicate = await pool.query("SELECT id FROM users WHERE lower(email)=lower($1) AND id<>$2 LIMIT 1", [request.new_email, request.user_id]);
  if (duplicate.rows.length) {
    await pool.query("DELETE FROM email_change_requests WHERE user_id=$1 AND token_hash=$2", [request.user_id, tokenHash]);
    res.status(409).json({ error: "That email address is now associated with another account. Your current email remains unchanged." }); return;
  }
  const changed = await pool.query("UPDATE users SET email=$1 WHERE id=$2 AND EXISTS (SELECT 1 FROM email_change_requests WHERE user_id=$2 AND token_hash=$3 AND expires_at>now()) RETURNING id", [request.new_email, request.user_id, tokenHash]);
  if (!changed.rows.length) { res.status(400).json({ error: "This confirmation link has already been used or expired." }); return; }
  await pool.query("DELETE FROM email_change_requests WHERE user_id=$1 AND token_hash=$2", [request.user_id, tokenHash]);
  await revokeUserSessions(request.user_id);
  res.json({ message: "Email address confirmed and updated. Please sign in again with your new email address.", email: request.new_email });
});

// POST /auth/password-reset/request — generic response prevents account enumeration.
router.post("/auth/password-reset/request", async (req, res): Promise<void> => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
    res.status(400).json({ error: "Enter a valid email address." }); return;
  }
  const ipAddress = req.ip || "unknown";
  if (await consumeAuthAttempt("password-reset", email, ipAddress, 5, 60 * 60 * 1000, 60 * 60 * 1000)
      || await consumeAuthAttempt("password-reset-ip", "all-accounts", ipAddress, 20, 60 * 60 * 1000, 60 * 60 * 1000)) {
    res.status(429).json({ error: "Too many password recovery requests. Please try again later." }); return;
  }
  if (!isEmailConfigured()) {
    const { logger } = await import("../lib/logger");
    logger.error({ event: "auth.password_reset.delivery_unavailable", reason: "resend_not_configured" }, "Password recovery email was not sent because Resend is not configured");
    res.status(503).json({ error: "Password recovery email delivery is not configured on the server yet. No email has been sent." }); return;
  }
  try {
    // Always prefer an exact primary-email match. Otherwise allow a unique,
    // previously verified recovery email; never let an unverified address claim an account.
    const primaryResult = await pool.query("SELECT id, email, role FROM users WHERE lower(email) = $1 LIMIT 1", [email]);
    const primary = primaryResult.rows.map((row: { id: number | string; email: string; role: string }) => ({ id: Number(row.id), email: row.email, role: row.role }));
    await pool.query("CREATE TABLE IF NOT EXISTS account_recovery_profiles (user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, recovery_email text, recovery_email_verified_at timestamptz, recovery_phone text, recovery_phone_verified_at timestamptz, security_question text, security_answer_hash text, verification_code_hash text, verification_expires_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now())");
    let user: { id: number; email: string; role: string; securityQuestion?: string | null } | undefined = primary[0];
    let isRecoveryEmail = false;
    if (!user) {
      const recoveryMatches = await pool.query(
        "SELECT u.id, u.email, u.role, r.security_question FROM users u JOIN account_recovery_profiles r ON r.user_id = u.id WHERE lower(r.recovery_email) = $1 AND r.recovery_email_verified_at IS NOT NULL AND u.is_blocked = false AND u.is_suspended = false AND lower(u.role) NOT IN ('owner','admin','platform_owner') LIMIT 2",
        [email],
      );
      if (recoveryMatches.rows.length === 1) {
        user = { id: Number(recoveryMatches.rows[0].id), email: String(recoveryMatches.rows[0].email), role: String(recoveryMatches.rows[0].role), securityQuestion: recoveryMatches.rows[0].security_question ? String(recoveryMatches.rows[0].security_question) : null };
        isRecoveryEmail = true;
      }
    }
    // Owners use their separately configured owner-recovery process. This public
    // pathway must never create a reset token for an owner account.
    if (user && ["owner", "admin", "platform_owner"].includes(String(user.role || "").trim().toLowerCase())) {
      user = undefined;
    }
    if (user && !["owner", "admin", "platform_owner"].includes(String(user.role || "").trim().toLowerCase()) && (!isRecoveryEmail || Boolean(user.securityQuestion?.trim()))) {
      const resetToken = await createPasswordResetToken(user.id, isRecoveryEmail);
      // Send only to the exact address the requester supplied: either the account's
      // primary email or a uniquely matched, previously verified recovery email.
      // Sending to both addresses can make Resend test-mode delivery fail for all
      // recipients and unnecessarily exposes a password-reset event to another inbox.
      const recipients = [email];
      const baseUrl = (process.env.PUBLIC_APP_URL ?? process.env.APP_BASE_URL ?? "https://dallyletter-elidems-onlineschoolbye.vercel.app").replace(/\/$/, "");
      await sendEmail({
        to: recipients,
        subject: "Reset your Dallyletter Elidems password",
        text: "A password reset was requested for your Dallyletter Elidems account. Open this link within 30 minutes to choose a new password: " + baseUrl + "/reset-password?token=" + encodeURIComponent(resetToken) + (isRecoveryEmail ? "&recovery=1" : "") + "\n\nIf this is a backup-email recovery, you will also need to answer the security question saved in Profile Hub. If you did not request this, you can ignore this email.",
      });
    }
    res.status(202).json({ message: "If an account matches that email, password recovery instructions will be sent." });
  } catch (error) {
    const { logger } = await import("../lib/logger");
    logger.error({ event: "auth.password_reset.request_failed", err: error instanceof Error ? error.message : "unknown" }, "Password recovery request failed");
    res.status(503).json({ error: "Password recovery is temporarily unavailable. Please try again later." });
  }
});

// GET /auth/password-reset/details — reveal only the saved question for a valid, unused reset token.
router.get("/auth/password-reset/details", async (req, res): Promise<void> => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!/^[a-f0-9]{64}$/i.test(token)) { res.status(400).json({ error: "This reset link is invalid or expired. Request a new one." }); return; }
  const found = await pool.query("SELECT user_id, requires_security_answer FROM password_reset_tokens WHERE token_hash=$1 AND expires_at>now() AND used_at IS NULL", [createHash("sha256").update(token).digest("hex")]);
  if (!found.rows.length) { res.status(400).json({ error: "This reset link is invalid, expired, or already used. Request a new one." }); return; }
  if (!found.rows[0].requires_security_answer) { res.json({ requiresSecurityAnswer: false, securityQuestion: null }); return; }
  const question = await pool.query("SELECT security_question FROM account_recovery_profiles WHERE user_id=$1 AND recovery_email_verified_at IS NOT NULL", [Number(found.rows[0].user_id)]);
  const securityQuestion = String(question.rows[0]?.security_question || "").trim();
  if (!securityQuestion) { res.status(400).json({ error: "This backup-email recovery is missing its security question. Contact support or use your primary email recovery path." }); return; }
  res.json({ requiresSecurityAnswer: true, securityQuestion });
});

// POST /auth/password-reset/confirm — one-use, expiring token; revoke every existing session.
router.post("/auth/password-reset/confirm", async (req, res): Promise<void> => {
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
  const securityAnswer = typeof req.body?.securityAnswer === "string" ? req.body.securityAnswer : "";
  if (!/^[a-f0-9]{64}$/i.test(token) || newPassword.length < 8 || newPassword.length > 256) {
    res.status(400).json({ error: "A valid reset token and a password of at least 8 characters are required." }); return;
  }
  const ipAddress = req.ip || "unknown";
  if (await consumeAuthAttempt("password-reset-confirm", "all-tokens", ipAddress, 10, 15 * 60 * 1000, 15 * 60 * 1000)) {
    res.status(429).json({ error: "Too many password reset attempts. Please try again later." }); return;
  }
  const changed = await consumePasswordResetToken(token, await hashPassword(newPassword), securityAnswer);
  if (!changed) { res.status(400).json({ error: "This reset link is invalid or expired, or the security answer is incorrect. Your password has not been changed." }); return; }
  res.json({ message: "Password reset successfully. Sign in with your new password." });
});

export default router;
