export type RoleLikeUser = { role: unknown; isManager?: unknown };

export function normalizeRole(role: unknown): string {
  return typeof role === "string" ? role.trim().toLowerCase().replace(/[ -]+/g, "_") : "";
}

/** Existing owner policy includes admins; platform_owner is a normalized legacy alias. */
export function isOwnerRole(role: unknown): boolean {
  return ["owner", "admin", "platform_owner"].includes(normalizeRole(role));
}

function hasManagerStaffRole(user: RoleLikeUser): boolean {
  const role = normalizeRole(user.role);
  return user.isManager === true && ["teacher", "manager", "senior_manager"].includes(role);
}

export function canManageAcademicContent(user: RoleLikeUser): boolean {
  const role = normalizeRole(user.role);
  return role === "teacher" || isOwnerRole(role) || hasManagerStaffRole(user);
}

export function canAccessManager(user: RoleLikeUser): boolean {
  return isOwnerRole(user.role) || hasManagerStaffRole(user);
}

export function canUseStaffAI(user: RoleLikeUser): boolean {
  const role = normalizeRole(user.role);
  return ["owner", "admin", "platform_owner", "teacher"].includes(role) || hasManagerStaffRole(user);
}

export type AuthRequestLike = { currentUser?: RoleLikeUser | null };
export type AuthResponseLike = { status(code:number): AuthResponseLike; json(payload:unknown): unknown };
export type AuthNextLike = () => void;

export function enforceAuthenticated(req:AuthRequestLike,res:AuthResponseLike,next:AuthNextLike):void {
  if (!req.currentUser) { res.status(401).json({error:"Authentication required"}); return; }
  next();
}
export function enforceOwnerAccess(req:AuthRequestLike,res:AuthResponseLike,next:AuthNextLike):void {
  if (!req.currentUser || !isOwnerRole(req.currentUser.role)) { res.status(403).json({error:"Owner access required"}); return; }
  next();
}
export function enforceAcademicStaffAccess(req:AuthRequestLike,res:AuthResponseLike,next:AuthNextLike):void {
  if (!req.currentUser || !canManageAcademicContent(req.currentUser)) { res.status(403).json({error:"Teacher or manager access required"}); return; }
  next();
}
