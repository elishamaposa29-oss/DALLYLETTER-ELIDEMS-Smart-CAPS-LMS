import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  GetUserParams, UpdateUserParams, UpdateUserBody,
  DeleteUserParams, BlockUserParams, BlockUserBody,
  PromoteUserParams, PromoteUserBody,
} from "@workspace/api-zod";
import { requireAuth, requireOwner } from "../lib/auth-middleware";

const router: IRouter = Router();

const safeUserFields = {
  id: usersTable.id,
  email: usersTable.email,
  name: usersTable.name,
  role: usersTable.role,
  isPrefect: usersTable.isPrefect,
  isBlocked: usersTable.isBlocked,
  isSuspended: usersTable.isSuspended,
  phone: usersTable.phone,
  grade: usersTable.grade,
  subject: usersTable.subject,
  avatarUrl: usersTable.avatarUrl,
  lastPaymentDate: usersTable.lastPaymentDate,
  createdAt: usersTable.createdAt,
};

// GET /users — List all users (owner only)
router.get("/users", requireAuth, requireOwner, async (_req, res): Promise<void> => {
  const users = await db.select(safeUserFields).from(usersTable).orderBy(usersTable.createdAt);
  res.json(users.map(u => ({ ...u, createdAt: u.createdAt.toISOString() })));
});

// GET /users/:id — Get user by ID
router.get("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [user] = await db.select(safeUserFields).from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ ...user, createdAt: user.createdAt.toISOString() });
});

// PATCH /users/:id — Update user details
router.patch("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const body = UpdateUserBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const currentUser = req.currentUser!;
  if (currentUser.role !== "owner" && currentUser.id !== params.data.id) {
    res.status(403).json({ error: "Cannot update another user's profile" }); return;
  }

  const updates: Record<string, unknown> = {};
  if (body.data.name != null) updates.name = body.data.name;
  if (body.data.email != null) updates.email = body.data.email;
  if (body.data.phone != null) updates.phone = body.data.phone;
  if (body.data.grade != null) updates.grade = body.data.grade;
  if (body.data.subject != null) updates.subject = body.data.subject;
  if (body.data.avatarUrl != null) updates.avatarUrl = body.data.avatarUrl;

  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, params.data.id)).returning(safeUserFields);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ ...user, createdAt: user.createdAt.toISOString() });
});

// DELETE /users/:id — Delete user (owner only)
router.delete("/users/:id", requireAuth, requireOwner, async (req, res): Promise<void> => {
  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(usersTable).where(eq(usersTable.id, params.data.id));
  res.sendStatus(204);
});

// PATCH /users/:id/block — Block or unblock (owner only)
router.patch("/users/:id/block", requireAuth, requireOwner, async (req, res): Promise<void> => {
  const params = BlockUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const body = BlockUserBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [user] = await db.update(usersTable)
    .set({ isBlocked: body.data.isBlocked })
    .where(eq(usersTable.id, params.data.id))
    .returning(safeUserFields);

  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ ...user, createdAt: user.createdAt.toISOString() });
});

// PATCH /users/:id/suspend — Suspend or unsuspend (owner only)
router.patch("/users/:id/suspend", requireAuth, requireOwner, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { isSuspended } = req.body as { isSuspended: boolean };
  if (typeof isSuspended !== "boolean") { res.status(400).json({ error: "isSuspended must be boolean" }); return; }

  const [user] = await db.update(usersTable)
    .set({ isSuspended })
    .where(eq(usersTable.id, id))
    .returning(safeUserFields);

  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ ...user, createdAt: user.createdAt.toISOString() });
});

// PATCH /users/:id/promote — Promote/demote (owner only)
router.patch("/users/:id/promote", requireAuth, requireOwner, async (req, res): Promise<void> => {
  const params = PromoteUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const body = PromoteUserBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const updates: Record<string, unknown> = {};
  if (body.data.role != null) updates.role = body.data.role;
  if (body.data.isPrefect != null) updates.isPrefect = body.data.isPrefect;

  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, params.data.id)).returning(safeUserFields);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ ...user, createdAt: user.createdAt.toISOString() });
});

export default router;
