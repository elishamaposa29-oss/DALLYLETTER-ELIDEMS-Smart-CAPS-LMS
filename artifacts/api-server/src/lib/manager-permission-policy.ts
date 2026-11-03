import type { Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";
import { isOwnerRole, isSeniorManager, normalizeRole } from "./role-access";

const MANAGER_ROLES = new Set(["junior_manager", "senior_manager", "manager"]);

/** Explicit per-user grants only. Owner bypass is intentional; no manager role receives implicit grants. */
export function requireManagerPermission(permissionKey: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.currentUser;
    if (!user) { res.status(401).json({ error: "Authentication required" }); return; }
    if (isOwnerRole(user.role)) { next(); return; }
    const role = normalizeRole(user.role);
    const isManager = MANAGER_ROLES.has(role) || (role === "teacher" && user.isManager === true);
    if (!isManager) { res.status(403).json({ error: "Manager access required" }); return; }
    const seniorOnly = new Set(["transfers.approve", "reports.review", "achievements.approve", "teacher_cv.review", "teacher_cv.authorize", "qualifications.verify", "users.override.junior_manager"]);
    if (seniorOnly.has(permissionKey) && !isSeniorManager(user)) { res.status(403).json({ error: "Senior Manager or Owner authority required", permission: permissionKey }); return; }
    try {
      const result = await pool.query(
        "SELECT granted FROM manager_permission_grants WHERE manager_user_id=$1 AND permission_key=$2",
        [user.id, permissionKey],
      );
      if (result.rows[0]?.granted !== true) {
        res.status(403).json({ error: "Permission not granted by Owner", permission: permissionKey });
        return;
      }
      next();
    } catch {
      // Fail closed when the additive permission migration has not been installed.
      res.status(503).json({ error: "Manager permission service is unavailable. Contact the Owner." });
    }
  };
}

/** Select a permission from validated request data, e.g. approve vs reject. */
export function requireManagerPermissionForRequest(resolvePermission: (req: Request) => string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = resolvePermission(req);
    if (!key || typeof key !== "string") { res.status(400).json({ error: "Invalid permission action" }); return; }
    void requireManagerPermission(key)(req, res, next);
  };
}

/** Preserve teacher/learner self-service while requiring explicit grants from manager accounts. */
export function requireManagerPermissionIfManager(permissionKey: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.currentUser;
    if (!user) { res.status(401).json({ error: "Authentication required" }); return; }
    const role = normalizeRole(user.role);
    if (isOwnerRole(role)) { next(); return; }
    if (!MANAGER_ROLES.has(role) && !(role === "teacher" && user.isManager === true)) { next(); return; }
    void requireManagerPermission(permissionKey)(req, res, next);
  };
}
