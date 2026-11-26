import type { Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";
import { defaultManagerPermission, isActiveTeacherManager, isOwnerRole, isSeniorManager, isSeniorOnlyManagerPermission, normalizeRole } from "./role-access";

const MANAGER_ROLES = new Set(["junior_manager", "senior_manager", "manager"]);
const ADMIN_CV_PERMISSION_KEYS = new Set(["teacher_cv.view","teacher_cv.chat","qualifications.view"]);
function isAdminCvAuthority(role: unknown, permissionKey: string): boolean { return normalizeRole(role) === "admin" && ADMIN_CV_PERMISSION_KEYS.has(permissionKey); }
type CurrentAuthority = {
  id: number;
  role: string;
  is_manager: boolean;
  manager_level: string | null;
  teacher_application_status: string | null;
  granted: boolean | null;
};

/**
 * Read the live account role and grant together on every protected request.
 * JWT role claims can be stale after a demotion or permission revocation.
 */
async function readCurrentAuthority(userId: number, permissionKey: string): Promise<CurrentAuthority | null> {
  const result = await pool.query(
    `SELECT u.id,u.role,u.is_manager,u.manager_level,u.teacher_application_status,g.granted
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
  return MANAGER_ROLES.has(role) || isActiveTeacherManager({ role: account.role, isManager: account.is_manager, teacherApplicationStatus: account.teacher_application_status });
}

/** Replace stale JWT role claims with the live database authority for downstream route checks. */
function syncCurrentAuthority(user: NonNullable<Request["currentUser"]>, account: CurrentAuthority): void {
  Object.assign(user, {
    role: account.role,
    isManager: account.is_manager,
    managerLevel: account.manager_level ?? undefined,
    teacherApplicationStatus: account.teacher_application_status ?? undefined,
  });
}

/** Explicit per-user grants only. Owner authority is checked against the live DB role. */
export function requireManagerPermission(permissionKey: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.currentUser;
    if (!user) { res.status(401).json({ error: "Authentication required" }); return; }
    try {
      const account = await readCurrentAuthority(user.id, permissionKey);
      if (!account) { res.status(401).json({ error: "Account no longer exists" }); return; }
      syncCurrentAuthority(user, account);
      if (isOwnerRole(account.role) || isAdminCvAuthority(account.role, permissionKey)) { next(); return; }
      if (!isManagerAccount(account)) {
        res.status(403).json({ error: "Manager access required" });
        return;
      }
      if (isSeniorOnlyManagerPermission(permissionKey) && !isSeniorManager({
        role: account.role,
        managerLevel: account.manager_level ?? undefined,
        isManager: account.is_manager,
        teacherApplicationStatus: account.teacher_application_status ?? undefined,
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
      syncCurrentAuthority(user, account);
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
    syncCurrentAuthority(user, account);
    if (isOwnerRole(account.role) || isAdminCvAuthority(account.role, permissionKey)) return true;
    if (!isManagerAccount(account)) return false;
    if (isSeniorOnlyManagerPermission(permissionKey) && !isSeniorManager({
      role: account.role,
      managerLevel: account.manager_level ?? undefined,
      isManager: account.is_manager,
      teacherApplicationStatus: account.teacher_application_status ?? undefined,
    })) return false;
    return account.granted === null ? defaultManagerPermission(account.role,account.manager_level,account.is_manager,permissionKey) : account.granted === true;
  } catch {
    return false;
  }
}
