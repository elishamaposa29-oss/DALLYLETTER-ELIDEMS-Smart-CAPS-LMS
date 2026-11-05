export type RoleLikeUser = {
  role: unknown;
  isManager?: unknown;
  teacherApplicationStatus?: unknown;
  managerLevel?: unknown;
};

export function normalizeRole(role: unknown): string {
  return typeof role === "string" ? role.trim().toLowerCase().replace(/[ -]+/g, "_") : "";
}

/** Only the actual owner and the explicit legacy platform_owner alias receive Owner authority. Admin is a separate operational role. */
export function isOwnerRole(role: unknown): boolean {
  return ["owner", "platform_owner"].includes(normalizeRole(role));
}

function isTeacherRestricted(user: RoleLikeUser): boolean {
  return normalizeRole(user.role) === "teacher" &&
    ["pending_review", "rejected_pending_conversion"].includes(String(user.teacherApplicationStatus ?? "").trim().toLowerCase());
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
  return role === "teacher" && user.isManager === true && !isTeacherRestricted(user);
}

/** Junior managers retain manager access but cannot perform senior-only approvals. */
export function isJuniorManager(user: RoleLikeUser): boolean {
  const role = normalizeRole(user.role);
  if (isOwnerRole(role) || isSeniorManager(user)) return false;
  if (role === "manager" || role === "junior_manager") return true;
  return role === "teacher" && user.isManager === true && !isTeacherRestricted(user);
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
  return role === "teacher" && user.isManager === true && !isTeacherRestricted(user);
}

/** API-level allowlist for applicants who have not yet been authorized to teach. */
export function canPendingTeacherUseRoute(user: RoleLikeUser & { id?: number }, methodValue: string, rawPath: string): boolean {
  if (!isTeacherRestricted(user)) return true;
  const method = methodValue.trim().toUpperCase();
  const normalizedPath = rawPath.split("?")[0].replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  const path = normalizedPath.startsWith("/api/") ? normalizedPath.slice(4) : normalizedPath;
  const selfId = String(user.id ?? "");
  // Authentication and account recovery must never be blocked by the teacher CV gate.
  // A pending applicant must be able to sign in, refresh /auth/me, and switch accounts.
  if (method === "OPTIONS" || path.startsWith("/auth/")) return true;
  const cvAllowed =
    (method === "GET" && path === "/users/me/teacher-cv") ||
    (method === "GET" && path === "/users/me/teacher-cv/pdf") ||
    (method === "PATCH" && path === "/users/me/teacher-cv") ||
    (method === "GET" && path === "/users/me/qualifications") ||
    (method === "POST" && path === "/users/me/qualifications") ||
    (method === "GET" && ["/users/me/enrollments-summary","/users/me/enrollments","/users/me/notification-email","/users/me/subjects","/users/me/payout-preferences","/users/me/recovery-profile","/academic-records/reports/me","/academic-records/transfer-requests","/academic-records/current-year","/achievements/my","/subjects/catalog"].includes(path)) ||
    // Profile Hub public/section endpoints enforce their own visibility and connection rules.
    (method === "GET" && new RegExp("^/profile/[0-9]+/social$").test(path)) ||
    (method === "GET" && new RegExp("^/profile/[0-9]+/section/[a-zA-Z0-9_-]+$").test(path)) ||
    (method === "GET" && new RegExp("^/users/[0-9]+/public-profile$").test(path)) ||
    (method === "GET" && new RegExp("^/users/[0-9]+/teacher-documents$").test(path)) ||
    (method === "POST" && new RegExp("^/profile/[0-9]+/connect$").test(path)) ||
    (method === "GET" && ["/profile/connections/friends","/profile/connections/requests","/notifications"].includes(path)) ||
    (method === "PUT" && path === "/profile/me/privacy") ||
    (method === "PATCH" && path.startsWith("/profile/connections/")) ||
    (method === "PATCH" && path.startsWith("/notifications/") && path.endsWith("/read")) ||
    // Direct messages are still governed by canMessageUser/canViewPrivateConversation;
    // the messages router separately denies group-chat access to restricted applicants.
    (method === "GET" && path === "/messages") ||
    (method === "POST" && path === "/messages") ||
    (method === "DELETE" && /^\\/messages\\/\\d+$/.test(path)) ||
    (method === "POST" && path === "/messages/media") ||
    (method === "GET" && path.startsWith("/messages/media/")) ||
    (method === "POST" && /^\\/messages\\/\\d+\\/report$/.test(path)) ||
    (method === "POST" && path === "/users/me/qualifications/bulk") ||
    (method === "POST" && path === "/users/me/teacher-documents") ||
    (method === "POST" && path === "/teacher-cv-workspace/submit") ||
    (method === "POST" && /^\/qualifications\/\d+\/document$/.test(path)) ||
    (method === "GET" && path === "/users/" + selfId + "/teacher-documents") ||
    (method === "GET" && /^\/users\/\d+\/teacher-documents\/\d+$/.test(path) && path.startsWith("/users/" + selfId + "/")) ||
    (method === "GET" && path === "/users/" + selfId + "/public-profile") ||
    (method === "GET" && path === "/users/" + selfId) ||
    (method === "PATCH" && path === "/users/" + selfId) ||
    ((method === "GET" || method === "POST") && path === "/teacher-cv-workspace/" + selfId + "/chat") ||
    (method === "PUT" && path === "/users/me/payout-preferences") ||
    (method === "POST" && ["/users/me/notification-email/request","/users/me/notification-email/verify","/users/me/recovery-email/request-verification","/users/me/recovery-email/confirm","/users/me/phone/request-verification","/users/me/phone/confirm","/users/me/avatar","/users/me/cover","/auth/email-change/request","/auth/email-change/confirm"].includes(path)) ||
    (method === "PATCH" && path === "/users/me/recovery-profile");
  const profileWrite = method === "PATCH" && path === "/users/" + selfId;
  return cvAllowed || profileWrite;
}

export function canManageAcademicContent(user: RoleLikeUser): boolean {
  const role = normalizeRole(user.role);
  if (isOwnerRole(role)) return true;
  if (role === "teacher") return !isTeacherRestricted(user);
  return hasManagerStaffRole(user);
}

export function canAccessManager(user: RoleLikeUser): boolean {
  return isOwnerRole(user.role) || hasManagerStaffRole(user);
}

export function canUseStaffAI(user: RoleLikeUser): boolean {
  const role = normalizeRole(user.role);
  if (isOwnerRole(role)) return true;
  if (role === "teacher") return !isTeacherRestricted(user);
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

/** Senior managers may override users below their level, never Owner/Admin or peer/senior managers. */
export function canModerateUser(actor: RoleLikeUser, target: RoleLikeUser): boolean {
  const actorRole = normalizeRole(actor.role);
  const targetRole = normalizeRole(target.role);
  if (isOwnerRole(targetRole)) return false;
  if (targetRole === "admin" && !isOwnerRole(actorRole)) return false;
  if (isOwnerRole(actorRole)) return true;
  if (isSeniorManager(actor)) {
    if (targetRole === "senior_manager") return false;
    if (targetRole === "manager" || targetRole === "junior_manager") return normalizedManagerLevel(target) === "junior";
    if (targetRole === "teacher" && target.isManager === true) return normalizedManagerLevel(target) === "junior";
    return ["teacher", "student", "learner", "prefect"].includes(targetRole);
  }
  if (!isJuniorManager(actor)) return false;
  if (["manager", "junior_manager", "senior_manager"].includes(targetRole)) return false;
  if (targetRole === "teacher" && target.isManager === true) return false;
  return ["teacher", "student", "learner", "prefect"].includes(targetRole);
}

/** Transfer decisions are senior authority: junior managers may view the queue but cannot approve or reject. */
export function canReviewAcademicTransfer(user: RoleLikeUser): boolean {
  return isSeniorManager(user);
}

/** Senior-only approvals and elevated review operations. */
export const SENIOR_ONLY_PERMISSION_KEYS = new Set([
  "transfers.approve", "reports.review", "achievements.approve",
  "teacher_cv.review", "teacher_cv.authorize", "qualifications.verify",
  "users.override.junior_manager", "manager.monitoring.view",
]);

/** The established Senior Manager operational catalogue; excludes every Owner-only capability. */
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

export const isSeniorOnlyManagerPermission = (permissionKey: string): boolean =>
  SENIOR_ONLY_PERMISSION_KEYS.has(permissionKey);

/** No operational permission is implied by role or seniority; every manager permission requires an explicit Owner grant. */
export function defaultManagerPermission(_role: unknown, _managerLevel: unknown, _isManager: unknown, _permissionKey: string): boolean {
  return false;
}
