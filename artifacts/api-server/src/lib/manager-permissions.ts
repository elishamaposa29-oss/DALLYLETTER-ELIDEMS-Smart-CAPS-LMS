import { pool } from "@workspace/db";
import { isOwnerRole, normalizeRole } from "./role-access";

export const MANAGER_PERMISSION_KEYS = [
  "transferView", "transferReview", "reportView", "reportCreate", "reportReview",
  "teacherMonitor", "studentManage", "prefectManage", "awardIssue",
] as const;
export type ManagerPermissionKey = typeof MANAGER_PERMISSION_KEYS[number];
export type ManagerPermissionMap = Partial<Record<ManagerPermissionKey, boolean>>;

const seniorDefaults: ManagerPermissionMap = {
  transferView: true, transferReview: true, reportView: true, reportCreate: true,
  reportReview: true, teacherMonitor: true, studentManage: true, prefectManage: true,
  awardIssue: true,
};
const juniorDefaults: ManagerPermissionMap = {
  transferView: true, transferReview: false, reportView: true, reportCreate: true,
  reportReview: false, teacherMonitor: true, studentManage: false, prefectManage: false,
  awardIssue: false,
};

export function defaultManagerPermissions(role: unknown): ManagerPermissionMap {
  return normalizeRole(role) === "senior_manager" ? { ...seniorDefaults } : { ...juniorDefaults };
}

export async function getManagerPermissions(managerId: number, role: unknown): Promise<ManagerPermissionMap> {
  const result = await pool.query(
    "SELECT permissions FROM manager_action_permissions WHERE manager_id=$1",
    [managerId],
  );
  const saved = result.rows[0]?.permissions;
  return { ...defaultManagerPermissions(role), ...(saved && typeof saved === "object" ? saved : {}) };
}

export async function hasManagerPermission(
  user: { id: number; role: unknown; isManager?: unknown },
  permission: ManagerPermissionKey,
): Promise<boolean> {
  if (isOwnerRole(user.role)) return true;
  const role = normalizeRole(user.role);
  const isManager = role === "manager" || role === "junior_manager" || role === "senior_manager" ||
    (role === "teacher" && user.isManager === true);
  if (!isManager) return false;
  const permissions = await getManagerPermissions(user.id, role);
  return permissions[permission] === true;
}
