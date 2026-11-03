import type { Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";
import { isOwnerRole, isSeniorManager, normalizeRole } from "./role-access";

const MANAGER_ROLES = new Set(["junior_manager", "senior_manager", "manager"]);
export const SENIOR_DEFAULT_PERMISSION_KEYS = new Set([
  "manager.dashboard.view", "manager.monitoring.view",
  "users.view", "users.block", "users.restore", "users.suspend",
  "users.override.teacher", "users.override.learner", "users.override.prefect", "users.override.junior_manager",
  "attendance.view", "attendance.edit", "recordbook.view", "recordbook.edit",
  "reports.create", "reports.view", "reports.review",
  "transfers.view", "transfers.reject", "transfers.approve",
  "teacher_cv.chat", "teacher_cv.view", "teacher_cv.review", "teacher_cv.authorize",
  "qualifications.view", "qualifications.verify",
  "achievements.view", "achievements.recommend", "achievements.approve",
  "moderation.view", "moderation.action", "notifications.create",
  "classes.manage", "lessons.create", "lessons.edit", "lessons.delete", "lessons.notify",
  "polls.manage", "messages.send", "content.view_comments", "content.comment",
  "notifications.broadcast", "notifications.view", "groups.manage", "audit.view_subordinate", "owner.chat",
]);
export const SENIOR_ONLY_PERMISSION_KEYS = new Set([
  "transfers.approve", "reports.review", "achievements.approve",
  "teacher_cv.review", "teacher_cv.authorize", "qualifications.verify",
  "users.override.junior_manager", "manager.monitoring.view",
]);
export const isSeniorOnlyManagerPermission = (permissionKey: string): boolean =>
  SENIOR_ONLY_PERMISSION_KEYS.has(permissionKey);

export function defaultManagerPermission(role: unknown, managerLevel: unknown, isManager: unknown, _permissionKey: string): boolean {
  // Preserve the established Senior Manager operational authority. Owner-only
  // capabilities are never part of this catalogue or this policy.
  return SENIOR_DEFAULT_PERMISSION_KEYS.has(_permissionKey) && isSeniorManager({ role, managerLevel: typeof managerLevel === "string" ? managerLevel : undefined, isManager: isManager === true });
}

type CurrentAuthority = {
  id: number;
  role: string;
  is_manager: boolean;
  manager_level: string | null;
  granted: boolean | null;
};

/**
 * Read the live account role and grant together on every protected request.
 * JWT role claims can be stale after a demotion or permission revocation.
 */
async function readCurrentAuthority(userId: number, permissionKey: string): Promise<CurrentAuthority | null> {
  const result = await pool.query(
    `SELECT u.id,u.role,u.is_manager,u.manager_level,g.granted
       FROM users u
       LEFT JOIN manager_permission_grants g
         ON g.manager_user_id=u.id AND g.permission_key=$2
      WHERE u.id=$1
      LIMIT 1`,
    [userId, permissionKey],
  );
  return (result.rows[0] as CurrentAuthority | undefined) ?? null;
}

function isManagerAccount(account: CurrentAuthority): boolean {
  const role = normalizeRole(account.role);
  return MANAGER_ROLES.has(role) || (role === "teacher" && account.is_manager === true);
}

/** Explicit per-user grants only. Owner authority is checked against the live DB role. */
export function requireManagerPermission(permissionKey: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.currentUser;
    if (!user) { res.status(401).json({ error: "Authentication required" }); return; }
    try {
      const account = await readCurrentAuthority(user.id, permissionKey);
      if (!account) { res.status(401).json({ error: "Account no longer exists" }); return; }
      if (isOwnerRole(account.role)) { next(); return; }
      if (!isManagerAccount(account)) {
        res.status(403).json({ error: "Manager access required" });
        return;
      }
      if (isSeniorOnlyManagerPermission(permissionKey) && !isSeniorManager({
        role: account.role,
        managerLevel: account.manager_level ?? undefined,
        isManager: account.is_manager,
      })) {
        res.status(403).json({ error: "Senior Manager or Owner authority required", permission: permissionKey });
        return;
      }
      const granted = account.granted === null ? defaultManagerPermission(account.role,account.manager_level,account.is_manager,permissionKey) : account.granted === true;
      if (!granted) {
        res.status(403).json({ error: "Permission not granted by Owner", permission: permissionKey });
        return;
      }
      next();
    } catch {
      // Fail closed if the permission schema or database is unavailable.
      res.status(503).json({ error: "Manager permission service is unavailable. Contact the Owner." });
    }
  };
}

/** Select a permission from validated request data, e.g. approve vs reject. */
export function requireManagerPermissionForRequest(resolvePermission: (req: Request) => string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = resolvePermission(req);
    if (!key || typeof key !== "string") {
      res.status(400).json({ error: "Invalid permission action" });
      return;
    }
    void requireManagerPermission(key)(req, res, next);
  };
}

/**
 * Preserve non-manager self-service, but determine the live role from PostgreSQL
 * rather than trusting a potentially stale JWT role claim.
 */
export function requireManagerPermissionIfManager(permissionKey: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.currentUser;
    if (!user) { res.status(401).json({ error: "Authentication required" }); return; }
    try {
      const account = await readCurrentAuthority(user.id, permissionKey);
      if (!account) { res.status(401).json({ error: "Account no longer exists" }); return; }
      if (isOwnerRole(account.role) || !isManagerAccount(account)) { next(); return; }
      void requireManagerPermission(permissionKey)(req, res, next);
    } catch {
      res.status(503).json({ error: "Manager permission service is unavailable. Contact the Owner." });
    }
  };
}

/** Query effective grant for response shaping; uses current database role, never stale JWT role. */
export async function managerHasPermission(user: NonNullable<Request["currentUser"]>, permissionKey: string): Promise<boolean> {
  try {
    const account = await readCurrentAuthority(user.id, permissionKey);
    if (!account) return false;
    if (isOwnerRole(account.role)) return true;
    if (!isManagerAccount(account)) return false;
    if (isSeniorOnlyManagerPermission(permissionKey) && !isSeniorManager({
      role: account.role,
      managerLevel: account.manager_level ?? undefined,
      isManager: account.is_manager,
    })) return false;
    return account.granted === null ? defaultManagerPermission(account.role,account.manager_level,account.is_manager,permissionKey) : account.granted === true;
  } catch {
    return false;
  }
}
