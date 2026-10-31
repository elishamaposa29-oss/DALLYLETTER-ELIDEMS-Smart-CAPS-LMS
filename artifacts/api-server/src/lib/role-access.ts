export type RoleLikeUser = {
  role: unknown;
  isManager?: unknown;
  teacherApplicationStatus?: unknown;
};

export function normalizeRole(role: unknown): string {
  const normalized = typeof role === "string" ? role.trim().toLowerCase().replace(/[ -]+/g, "_") : "";
  if (normalized === "jnr_manager") return "junior_manager";
  if (normalized === "snr_manager") return "senior_manager";
  return normalized;
}

/** Existing owner policy includes admins; platform_owner is a normalized legacy alias. */
export function isOwnerRole(role: unknown): boolean {
  return ["owner", "admin", "platform_owner"].includes(normalizeRole(role));
}

function isTeacherPendingReview(user: RoleLikeUser): boolean {
  return normalizeRole(user.role) === "teacher" && user.teacherApplicationStatus === "pending_review";
}

function hasManagerStaffRole(user: RoleLikeUser): boolean {
  const role = normalizeRole(user.role);
  if (isTeacherPendingReview(user)) return false;
  // Explicit manager roles are authoritative. The legacy isManager flag is only
  // needed for teachers who are additionally granted manager access.
  return ["manager", "junior_manager", "senior_manager"].includes(role)
    || (role === "teacher" && user.isManager === true);
}

export function canManageAcademicContent(user: RoleLikeUser): boolean {
  const role = normalizeRole(user.role);
  if (isOwnerRole(role)) return true;
  if (role === "teacher") return !isTeacherPendingReview(user);
  return hasManagerStaffRole(user);
}

export function canAccessManager(user: RoleLikeUser): boolean {
  return isOwnerRole(user.role) || hasManagerStaffRole(user);
}

export function canUseStaffAI(user: RoleLikeUser): boolean {
  const role = normalizeRole(user.role);
  if (isOwnerRole(role)) return true;
  if (role === "teacher") return !isTeacherPendingReview(user);
  return hasManagerStaffRole(user);
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
