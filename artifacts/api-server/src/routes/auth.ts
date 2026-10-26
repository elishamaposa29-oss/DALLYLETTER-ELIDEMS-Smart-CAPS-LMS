import { Router, type IRouter } from "express";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, usersTable, pool } from "@workspace/db";
import { RegisterUserBody, LoginUserBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth-middleware";
import { hashPassword, verifyPassword } from "../lib/password-hash";
import { generateSignedToken, parseSignedToken } from "../lib/signed-token";
import { isAllowedPublicRegistrationRole } from "../lib/registration-policy";
import { createAuthSession, revokeAuthSession, revokeUserSessions, createPasswordResetToken, consumePasswordResetToken, consumeAuthAttempt, clearAuthAttempts, updatePasswordAndRevokeSessions } from "../lib/auth-session-store";
import { sendEmail, isEmailConfigured } from "../lib/email-service";

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
    const verify = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential));
    if (!verify.ok) { res.status(401).json({ error: "Google sign-in could not verify this account. Please try again." }); return; }
    const claims = await verify.json() as { aud?: string; iss?: string; sub?: string; email?: string; email_verified?: string | boolean; name?: string; exp?: string | number };
    const expiresAt = Number(claims.exp);
    if (claims.aud !== clientId || !["accounts.google.com", "https://accounts.google.com"].includes(String(claims.iss))
      || typeof claims.sub !== "string" || !claims.sub || typeof claims.email !== "string"
      || String(claims.email_verified).toLowerCase() !== "true" || !Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
      res.status(401).json({ error: "Google identity token is invalid or its email is not verified." }); return;
    }
    const email = claims.email.trim().toLowerCase();
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
    const primaryResult = await pool.query("SELECT id, email FROM users WHERE lower(email) = $1 LIMIT 1", [email]);
    const primary = primaryResult.rows.map((row: { id: number | string; email: string }) => ({ id: Number(row.id), email: row.email }));
    await pool.query("CREATE TABLE IF NOT EXISTS account_recovery_profiles (user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, recovery_email text, recovery_email_verified_at timestamptz, recovery_phone text, recovery_phone_verified_at timestamptz, security_question text, security_answer_hash text, verification_code_hash text, verification_expires_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now())");
    let user = primary[0];
    if (!user) {
      const recoveryMatches = await pool.query(
        "SELECT u.id, u.email FROM users u JOIN account_recovery_profiles r ON r.user_id = u.id WHERE lower(r.recovery_email) = $1 AND r.recovery_email_verified_at IS NOT NULL AND u.is_blocked = false AND u.is_suspended = false LIMIT 2",
        [email],
      );
      if (recoveryMatches.rows.length === 1) {
        user = { id: Number(recoveryMatches.rows[0].id), email: String(recoveryMatches.rows[0].email) };
      }
    }
    if (user) {
      const resetToken = await createPasswordResetToken(user.id);
      const recovery = await pool.query("SELECT recovery_email FROM account_recovery_profiles WHERE user_id = $1 AND recovery_email_verified_at IS NOT NULL", [user.id]);
      const recoveryEmail = recovery.rows[0]?.recovery_email as string | undefined;
      const recipients = [...new Set([user.email, ...(recoveryEmail ? [recoveryEmail] : [])])];
      const baseUrl = (process.env.PUBLIC_APP_URL ?? process.env.APP_BASE_URL ?? "https://dallyletterelidemslearningplatformelishamaposa1-otbtqe1pf.vercel.app").replace(/\/$/, "");
      await sendEmail({
        to: recipients,
        subject: "Reset your Dallyletter Elidems password",
        text: "A password reset was requested for your Dallyletter Elidems account. Open this link within 30 minutes to choose a new password: " + baseUrl + "/reset-password?token=" + encodeURIComponent(resetToken) + "\n\nIf you did not request this, you can ignore this email.",
      });
    }
    res.status(202).json({ message: "If an account matches that email, password recovery instructions will be sent." });
  } catch (error) {
    const { logger } = await import("../lib/logger");
    logger.error({ event: "auth.password_reset.request_failed", err: error instanceof Error ? error.message : "unknown" }, "Password recovery request failed");
    res.status(503).json({ error: "Password recovery is temporarily unavailable. Please try again later." });
  }
});

// POST /auth/password-reset/confirm — one-use, expiring token; revoke every existing session.
router.post("/auth/password-reset/confirm", async (req, res): Promise<void> => {
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
  if (!/^[a-f0-9]{64}$/i.test(token) || newPassword.length < 8 || newPassword.length > 256) {
    res.status(400).json({ error: "A valid reset token and a password of at least 8 characters are required." }); return;
  }
  const ipAddress = req.ip || "unknown";
  if (await consumeAuthAttempt("password-reset-confirm", "all-tokens", ipAddress, 10, 15 * 60 * 1000, 15 * 60 * 1000)) {
    res.status(429).json({ error: "Too many password reset attempts. Please try again later." }); return;
  }
  const changed = await consumePasswordResetToken(token, await hashPassword(newPassword));
  if (!changed) { res.status(400).json({ error: "This password reset link is invalid or expired. Request a new one." }); return; }
  res.json({ message: "Password reset successfully. Sign in with your new password." });
});

export default router;
