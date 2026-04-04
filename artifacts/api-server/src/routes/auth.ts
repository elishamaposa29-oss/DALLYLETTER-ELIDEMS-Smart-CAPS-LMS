// Auth routes — login, register, logout, get current user
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { RegisterUserBody, LoginUserBody } from "@workspace/api-zod";
import crypto from "crypto";

const router: IRouter = Router();

// Simple password hashing using SHA-256 (not recommended for production — use bcrypt)
function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "dallyletter_salt_2024").digest("hex");
}

// Simple JWT-like token (base64 of user id + timestamp + secret)
function generateToken(userId: number): string {
  const payload = JSON.stringify({ userId, ts: Date.now() });
  return Buffer.from(payload).toString("base64");
}

function parseToken(token: string): { userId: number } | null {
  try {
    const payload = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    return { userId: payload.userId };
  } catch {
    return null;
  }
}

// Export token parser for middleware
export { parseToken };

// POST /auth/register — Register a new student or teacher
router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password, name, role, grade, subject, phone } = parsed.data;

  // Check if email already exists
  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing.length > 0) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

  // Create user
  const [user] = await db.insert(usersTable).values({
    email,
    passwordHash: hashPassword(password),
    name,
    role,
    grade: grade ?? null,
    subject: subject ?? null,
    phone: phone ?? null,
    isPrefect: false,
    isBlocked: false,
  }).returning();

  const token = generateToken(user.id);

  // Return user without password hash
  const { passwordHash: _, ...safeUser } = user;
  res.status(201).json({ user: safeUser, token });
});

// POST /auth/login — Login with email + password
router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  if (user.passwordHash !== hashPassword(password)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  if (user.isBlocked) {
    res.status(403).json({ error: "Your account has been blocked. Please contact support." });
    return;
  }

  const token = generateToken(user.id);
  const { passwordHash: _, ...safeUser } = user;
  res.json({ user: safeUser, token });
});

// POST /auth/logout — Logout (stateless, just returns OK)
router.post("/auth/logout", async (_req, res): Promise<void> => {
  res.json({ message: "Logged out successfully" });
});

// GET /auth/me — Get current user from token
router.get("/auth/me", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const token = authHeader.slice(7);
  const parsed = parseToken(token);
  if (!parsed) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, parsed.userId));
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const { passwordHash: _, ...safeUser } = user;
  res.json(safeUser);
});

export default router;
