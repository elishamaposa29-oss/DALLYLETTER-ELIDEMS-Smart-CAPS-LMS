import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { RegisterUserBody, LoginUserBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth-middleware";
import crypto from "crypto";

const router: IRouter = Router();

function getAuthSecret(): string {
  const fallbackSecret = process.env.NODE_ENV === "production" ? undefined : "dallyletter-local-secret";
  const secret = process.env.JWT_SECRET ?? process.env.AUTH_SECRET ?? fallbackSecret;

  if (!secret) {
    throw new Error("JWT_SECRET must be set in production");
  }

  return secret;
}

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "dallyletter_salt_2024").digest("hex");
}

function generateToken(userId: number): string {
  const payload = JSON.stringify({ userId, ts: Date.now() });
  const encodedPayload = Buffer.from(payload).toString("base64url");
  const signature = crypto.createHmac("sha256", getAuthSecret()).update(encodedPayload).digest("hex");
  return `${encodedPayload}.${signature}`;
}

function parseToken(token: string): { userId: number } | null {
  try {
    const [encodedPayload, signature] = token.split(".");
    if (!encodedPayload || !signature) {
      return null;
    }

    const expectedSignature = crypto.createHmac("sha256", getAuthSecret()).update(encodedPayload).digest("hex");
    if (expectedSignature !== signature) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    return { userId: payload.userId };
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

// POST /auth/register
router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { email, password, name, role, grade, subject, phone } = parsed.data;

  try {
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, email));
    if (existing.length > 0) { res.status(400).json({ error: "Email already registered" }); return; }

    const [user] = await db.insert(usersTable).values({
      email, passwordHash: hashPassword(password), name, role,
      grade: grade ?? null, subject: subject ?? null, phone: phone ?? null,
      isPrefect: false, isBlocked: false, isSuspended: false,
    }).returning();

    const token = generateToken(user.id);
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
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
});

// POST /auth/login
router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const { email, password } = parsed.data;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
    if (!user || user.passwordHash !== hashPassword(password)) {
      res.status(401).json({ error: "Invalid email or password" }); return;
    }

    if (user.isBlocked) {
      res.status(403).json({ error: "Your account has been blocked. Please contact the school administrator." }); return;
    }

    const token = generateToken(user.id);
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
    res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// POST /auth/logout
router.post("/auth/logout", async (_req, res): Promise<void> => {
  res.json({ message: "Logged out successfully" });
});

// GET /auth/me
router.get("/auth/me", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) { res.status(401).json({ error: "Not authenticated" }); return; }

  const token = authHeader.slice(7);
  const parsed = parseToken(token);
  if (!parsed) { res.status(401).json({ error: "Invalid token" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, parsed.userId));
  if (!user) { res.status(401).json({ error: "User not found" }); return; }

  const { passwordHash: _, ...safeUser } = user;
  res.json(safeUser);
});

// POST /auth/change-password — Change own password (any authenticated user)
router.post("/auth/change-password", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "currentPassword and newPassword are required" }); return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: "New password must be at least 6 characters" }); return;
  }

  // Re-fetch user with password hash
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, currentUser.id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  if (user.passwordHash !== hashPassword(currentPassword)) {
    res.status(400).json({ error: "Current password is incorrect" }); return;
  }

  await db.update(usersTable).set({ passwordHash: hashPassword(newPassword) }).where(eq(usersTable.id, currentUser.id));
  res.json({ message: "Password changed successfully" });
});

export default router;
