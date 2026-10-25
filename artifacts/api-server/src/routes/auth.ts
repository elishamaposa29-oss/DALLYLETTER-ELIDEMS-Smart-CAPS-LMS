import { Router, type IRouter } from "express";
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
    res.status(503).json({ error: "Password recovery is temporarily unavailable. Please contact support." }); return;
  }
  try {
    const [user] = await db.select({ id: usersTable.id, email: usersTable.email }).from(usersTable).where(eq(usersTable.email, email));
    if (user) {
      const resetToken = await createPasswordResetToken(user.id);
      await pool.query("CREATE TABLE IF NOT EXISTS account_recovery_profiles (user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, recovery_email text, recovery_email_verified_at timestamptz, recovery_phone text, recovery_phone_verified_at timestamptz, security_question text, security_answer_hash text, verification_code_hash text, verification_expires_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now())");
      const recovery = await pool.query("SELECT recovery_email FROM account_recovery_profiles WHERE user_id = $1 AND recovery_email_verified_at IS NOT NULL", [user.id]);
      const recoveryEmail = recovery.rows[0]?.recovery_email as string | undefined;
      const recipients = [...new Set([user.email, ...(recoveryEmail ? [recoveryEmail] : [])])];
      const baseUrl = (process.env.PUBLIC_APP_URL ?? process.env.APP_BASE_URL ?? "https://dallyletterelidemslearningplatforme-six.vercel.app").replace(/\/$/, "");
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
