export type RoleLikeUser = {
  role: unknown;
  isManager?: unknown;
  teacherApplicationStatus?: unknown;
  managerLevel?: unknown;
};

export function normalizeRole(role: unknown): string {
  return typeof role === "string" ? role.trim().toLowerCase().replace(/[ -]+/g, "_") : "";
}

/** Existing owner policy includes admins; platform_owner is a normalized legacy alias. */
export function isOwnerRole(role: unknown): boolean {
  return ["owner", "admin", "platform_owner"].includes(normalizeRole(role));
}

function isTeacherPendingReview(user: RoleLikeUser): boolean {
  return normalizeRole(user.role) === "teacher" && user.teacherApplicationStatus === "pending_review";
}

function normalizedManagerLevel(user: RoleLikeUser): string {
  return typeof user.managerLevel === "string" ? user.managerLevel.trim().toLowerCase() : "junior";
}

/** Senior authority is explicit; legacy teacher-manager accounts use managerLevel. */
export function isSeniorManager(user: RoleLikeUser): boolean {
  const role = normalizeRole(user.role);
  if (isOwnerRole(role) || role === "senior_manager") return true;
  if (normalizedManagerLevel(user) !== "senior") return false;
  if (role === "manager") return true;
  return role === "teacher" && user.isManager === true && !isTeacherPendingReview(user);
}

/** Junior managers retain manager access but cannot perform senior-only approvals. */
export function isJuniorManager(user: RoleLikeUser): boolean {
  const role = normalizeRole(user.role);
  if (isOwnerRole(role) || isSeniorManager(user)) return false;
  if (role === "manager" || role === "junior_manager") return true;
  return role === "teacher" && user.isManager === true && !isTeacherPendingReview(user);
}

/** Recommendation is available to both manager levels; approval is senior/owner only. */
export function canRecommendAchievementAwards(user: RoleLikeUser): boolean {
  return isJuniorManager(user) || isSeniorManager(user);
}

export function canApproveAchievementAwards(user: RoleLikeUser): boolean {
  return isSeniorManager(user);
}

function hasManagerStaffRole(user: RoleLikeUser): boolean {
  const role = normalizeRole(user.role);
  // Manager roles remain eligible for existing manager tools at either level.
  if (["manager", "senior_manager", "junior_manager"].includes(role)) return true;
  return role === "teacher" && user.isManager === true && !isTeacherPendingReview(user);
}

/** API-level allowlist for applicants who have not yet been authorized to teach. */
export function canPendingTeacherUseRoute(user: RoleLikeUser & { id?: number }, methodValue: string, rawPath: string): boolean {
  if (!isTeacherPendingReview(user)) return true;
  const method = methodValue.toUpperCase();
  const path = rawPath.startsWith("/api/") ? rawPath.slice(4) : rawPath;
  const selfId = String(user.id ?? "");
  const cvAllowed =
    (method === "GET" && path === "/users/me/teacher-cv") ||
    (method === "PATCH" && path === "/users/me/teacher-cv") ||
    (method === "GET" && path === "/users/me/qualifications") ||
    (method === "POST" && path === "/users/me/qualifications") ||
    (method === "POST" && path === "/users/me/teacher-documents") ||
    (method === "POST" && /^\/qualifications\/\d+\/document$/.test(path)) ||
    (method === "GET" && path === "/users/" + selfId + "/teacher-documents") ||
    (method === "GET" && path === "/users/" + selfId + "/public-profile") ||
    (method === "GET" && path === "/users/" + selfId) ||
    (method === "PATCH" && path === "/users/" + selfId) ||
    ((method === "GET" || method === "POST") && path === "/teacher-cv-workspace/" + selfId + "/chat");
  const teachingReadPrefixes = ["/dashboard","/teacher","/teacher-dashboard","/teacher-panel","/manager","/manager-panel","/classes","/lessons","/assignments","/exercises","/polls","/study-groups","/attendance","/daily-attendance","/ai","/live-classes","/reports","/academic-records","/record-book","/recordbook","/marking"];
  const teachingRead = method === "GET" && teachingReadPrefixes.some(prefix => path === prefix || path.startsWith(prefix + "/"));
  const profileWrite = method === "PATCH" && path === "/users/" + selfId;
  return !teachingRead && (!["POST","PUT","PATCH","DELETE"].includes(method) || cvAllowed || profileWrite);
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

/** Transfer decisions are limited to owner-class accounts and authorized managers. */
export function canReviewAcademicTransfer(user: RoleLikeUser): boolean {
  const role = normalizeRole(user.role);
  return isOwnerRole(role) || role === "manager" || role === "senior_manager" || (role === "teacher" && user.isManager === true && !isTeacherPendingReview(user));
}
