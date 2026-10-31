import { Router } from "express";
import { pool, db, auditLogsTable, usersTable } from "@workspace/db";
import { eq, or, inArray } from "drizzle-orm";
import { requireAuth, isOwnerRole } from "../lib/auth-middleware";
import { MANAGER_PERMISSION_KEYS, defaultManagerPermissions, getManagerPermissions, type ManagerPermissionMap } from "../lib/manager-permissions";

const router = Router();

router.get("/me", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const role = String(user.role || "").toLowerCase().replace(/[ -]+/g, "_");
  const managerRole = ["manager", "junior_manager", "senior_manager"].includes(role)
    || (role === "teacher" && user.isManager === true);
  if (!isOwnerRole(role) && !managerRole) { res.status(403).json({ error: "Manager permissions are not available for this account." }); return; }
  if (isOwnerRole(role)) {
    res.json(Object.fromEntries(MANAGER_PERMISSION_KEYS.map(key => [key, true])));
    return;
  }
  res.json(await getManagerPermissions(user.id, role));
});

router.get("/", requireAuth, async (req, res): Promise<void> => {
  if (!isOwnerRole(req.currentUser!.role)) { res.status(403).json({ error: "Only the owner can manage manager permissions." }); return; }
  const managers = await db.select({
    id: usersTable.id, name: usersTable.name, email: usersTable.email,
    role: usersTable.role, isManager: usersTable.isManager, managerLevel: usersTable.managerLevel,
  }).from(usersTable).where(or(
    inArray(usersTable.role, ["manager", "junior_manager", "jnr_manager", "senior_manager", "snr_manager"]),
    eq(usersTable.isManager, true),
  ));
  const result = await Promise.all(managers.filter(m => !isOwnerRole(m.role)).map(async manager => ({
    ...manager,
    permissions: await getManagerPermissions(manager.id, manager.role),
  })));
  res.json(result);
});

router.put("/:managerId", requireAuth, async (req, res): Promise<void> => {
  const actor = req.currentUser!;
  if (!isOwnerRole(actor.role)) { res.status(403).json({ error: "Only the owner can grant or revoke manager permissions." }); return; }
  const managerId = Number(req.params.managerId);
  if (!Number.isSafeInteger(managerId) || managerId < 1) { res.status(400).json({ error: "Invalid manager ID." }); return; }
  const [manager] = await db.select({ id: usersTable.id, role: usersTable.role, isManager: usersTable.isManager }).from(usersTable).where(eq(usersTable.id, managerId));
  if (!manager || isOwnerRole(manager.role) || !(["manager", "junior_manager", "jnr_manager", "senior_manager", "snr_manager"].includes(String(manager.role).toLowerCase()) || manager.isManager === true)) {
    res.status(404).json({ error: "Manager account not found." }); return;
  }
  const body = req.body?.permissions;
  if (!body || typeof body !== "object" || Array.isArray(body)) { res.status(400).json({ error: "Provide a permissions object." }); return; }
  const permissions: ManagerPermissionMap = {};
  for (const key of MANAGER_PERMISSION_KEYS) {
    if (typeof body[key] !== "boolean") { res.status(400).json({ error: "Every permission must be explicitly true or false: " + key }); return; }
    permissions[key] = body[key];
  }
  await pool.query(
    `INSERT INTO manager_action_permissions (manager_id, permissions, updated_by, updated_at)
     VALUES ($1, $2::jsonb, $3, now())
     ON CONFLICT (manager_id) DO UPDATE SET permissions=EXCLUDED.permissions, updated_by=EXCLUDED.updated_by, updated_at=now()`,
    [managerId, JSON.stringify(permissions), actor.id],
  );
  await db.insert(auditLogsTable).values({
    performedBy: actor.id, action: "manager.permissions_updated", category: "staff",
    targetType: "user", targetId: managerId, details: JSON.stringify({ permissions }),
  });
  res.json({ managerId, permissions: { ...defaultManagerPermissions(manager.role), ...permissions }, updatedAt: new Date().toISOString() });
});

export default router;
