export type RoleLikeUser = { role: unknown; isManager?: unknown };

export function normalizeRole(role: unknown): string {
  return typeof role === "string" ? role.trim().toLowerCase().replace(/[ -]+/g, "_") : "";
}

/** Existing owner policy includes admins; platform_owner is a normalized legacy alias. */
export function isOwnerRole(role: unknown): boolean {
  return ["owner", "admin", "platform_owner"].includes(normalizeRole(role));
}

export function canManageAcademicContent(user: RoleLikeUser): boolean {
  const role = normalizeRole(user.role);
  return role === "teacher" || isOwnerRole(role) || user.isManager === true;
}

export function canAccessManager(user: RoleLikeUser): boolean {
  return isOwnerRole(user.role) || user.isManager === true;
}

export function canUseStaffAI(user: RoleLikeUser): boolean {
  const role = normalizeRole(user.role);
  return ["owner", "admin", "platform_owner", "teacher"].includes(role) || user.isManager === true;
}
