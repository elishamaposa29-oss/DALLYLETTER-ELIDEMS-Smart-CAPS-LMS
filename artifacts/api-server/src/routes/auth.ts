import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { RegisterUserBody, LoginUserBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth-middleware";
import crypto from "crypto";

const router: IRouter = Router();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "dallyletter_salt_2024").digest("hex");
}

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

export { parseToken };

// POST /auth/register
router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { email, password, name, role, grade, subject, phone } = parsed.data;

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
});

// POST /auth/login
router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

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
