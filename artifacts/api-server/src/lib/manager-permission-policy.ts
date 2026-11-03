import type { Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";
import { isOwnerRole, normalizeRole } from "./role-access";

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
