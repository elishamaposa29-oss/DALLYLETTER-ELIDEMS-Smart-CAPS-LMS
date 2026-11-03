import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { requireAuth, isOwnerRole } from "../lib/auth-middleware";
import {
  normalizeRole,
  isSeniorManager,
  isJuniorManager,
  canManageAcademicContent,
  canReviewAcademicTransfer,
  canApproveAchievementAwards,
  canRecommendAchievementAwards,
} from "../lib/role-access";

const router: IRouter = Router();

/**
 * The catalogue describes actions that can be requested. It does not grant them.
 * A missing grant is always denied. Owner-only powers are deliberately absent.
 */
export const MANAGER_PERMISSION_CATALOG = [
  { key: "manager.dashboard.view", group: "Dashboard", label: "View manager dashboard", description: "Open the manager overview and action queue." },
  { key: "users.view", group: "Users", label: "View users", description: "View permitted teacher, learner and prefect records." },
  { key: "users.block", group: "Users", label: "Block users", description: "Block eligible subordinate accounts from login." },
  { key: "users.suspend", group: "Users", label: "Suspend users", description: "Suspend eligible subordinate accounts with limited access." },
  { key: "users.override.teacher", group: "Users", label: "Override teacher actions", description: "Reverse or correct permitted teacher actions." },
  { key: "users.override.learner", group: "Users", label: "Override learner actions", description: "Reverse or correct permitted learner actions." },
  { key: "users.override.prefect", group: "Users", label: "Override prefect actions", description: "Reverse or correct permitted prefect actions." },
  { key: "users.override.junior_manager", group: "Users", label: "Override Junior Manager actions", description: "Senior-level review of Junior Manager actions only." },
  { key: "attendance.view", group: "Attendance", label: "View attendance", description: "View school-scoped attendance records." },
  { key: "attendance.edit", group: "Attendance", label: "Edit attendance", description: "Correct attendance records with an audit reason." },
  { key: "recordbook.view", group: "Academic", label: "View RecordBook", description: "View teacher and learner activity records." },
  { key: "recordbook.edit", group: "Academic", label: "Edit RecordBook marks", description: "Correct marks and trigger recalculation with an audit trail." },
  { key: "reports.view", group: "Academic", label: "View reports", description: "View school-scoped academic reports." },
  { key: "reports.review", group: "Academic", label: "Approve or reject reports", description: "Review submitted academic reports and record a decision." },
  { key: "transfers.view", group: "Transfers", label: "View transfer requests", description: "View school-scoped transfer requests and documents." },
  { key: "transfers.reject", group: "Transfers", label: "Reject transfer requests", description: "Reject eligible transfer requests with a reason; does not grant approval." },
  { key: "transfers.approve", group: "Transfers", label: "Approve transfer requests", description: "Approve eligible transfer requests with verification and audit history." },
  { key: "teacher_cv.view", group: "Teacher applications", label: "View teacher CV applications", description: "Review submitted teacher CV information." },
  { key: "teacher_cv.review", group: "Teacher applications", label: "Review teacher applications", description: "Request corrections or reject an application." },
  { key: "teacher_cv.authorize", group: "Teacher applications", label: "Authorize approved teachers", description: "Activate teaching access after Owner-defined approval checks." },
  { key: "qualifications.view", group: "Teacher applications", label: "View qualifications", description: "View qualification evidence submitted by teachers." },
  { key: "qualifications.verify", group: "Teacher applications", label: "Verify qualifications", description: "Verify or reject individual qualification records." },
  { key: "achievements.view", group: "Achievements", label: "View achievement recommendations", description: "View learner achievement recommendations." },
  { key: "achievements.recommend", group: "Achievements", label: "Recommend achievements", description: "Submit achievement recommendations for review." },
  { key: "achievements.approve", group: "Achievements", label: "Approve achievements", description: "Approve eligible achievement awards." },
  { key: "moderation.view", group: "Moderation", label: "View moderation queue", description: "Review school-scoped content flags." },
  { key: "moderation.action", group: "Moderation", label: "Take moderation action", description: "Resolve eligible content moderation cases." },
  { key: "notifications.view", group: "Communications", label: "View manager notifications", description: "View alerts and workflow notifications available to this manager." },
  { key: "groups.manage", group: "Communications", label: "Manage study groups", description: "Manage eligible school study groups and Connect spaces." },
  { key: "audit.view_subordinate", group: "Audit", label: "View subordinate audit history", description: "View permitted actions by subordinate users only; never Owner or Admin activity." },
  { key: "owner.chat", group: "Communications", label: "Chat with Owner", description: "Communicate with Owner without access to Owner controls or activity." },
] as const;

const allowedKeys = new Set<string>(MANAGER_PERMISSION_CATALOG.map((permission) => permission.key));
const managerRoles = new Set(["junior_manager", "senior_manager", "manager"]);

function ownerOnly(req: any, res: any, next: any) {
  if (!req.currentUser || !isOwnerRole(req.currentUser.role)) {
    res.status(403).json({ error: "Owner access required" });
    return;
  }
  next();
}

async function getTargetManager(userId: number) {
  const result = await pool.query(
    "SELECT id, name, email, role, is_manager, manager_level FROM users WHERE id=$1",
    [userId],
  );
  const target = result.rows[0] as { id: number; name: string; email: string; role: string; is_manager: boolean; manager_level: string } | undefined;
  if (!target || isOwnerRole(target.role) || normalizeRole(target.role) === "admin") return null;
  const role = normalizeRole(target.role);
  if (!managerRoles.has(role) && !(role === "teacher" && target.is_manager)) return null;
  return target;
}

router.get("/catalog", requireAuth, ownerOnly, (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ permissions: MANAGER_PERMISSION_CATALOG, protectedCapabilities: ["owner.account.manage", "owner.activity.view", "owner.audit.view", "owner.permissions.manage", "admin.account.manage"] });
});

/** Effective permissions: explicit grants only. No role-derived implicit grants. */
router.get("/me", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const isManager = managerRoles.has(normalizeRole(user.role)) || (normalizeRole(user.role) === "teacher" && user.isManager);
  if (!isOwnerRole(user.role) && !isManager) {
    res.status(403).json({ error: "Manager access required" });
    return;
  }
  const result = isOwnerRole(user.role)
    ? { rows: [] as Array<{ permission_key: string; granted: boolean }> }
    : await pool.query("SELECT permission_key, granted FROM manager_permission_grants WHERE manager_user_id=$1", [user.id]);
  const permissions = Object.fromEntries(MANAGER_PERMISSION_CATALOG.map((p) => [p.key, false]));
  for (const row of result.rows) if (allowedKeys.has(row.permission_key)) permissions[row.permission_key] = row.granted === true;
  res.setHeader("Cache-Control", "no-store");
  res.json({
    userId: user.id,
    role: normalizeRole(user.role),
    isOwner: isOwnerRole(user.role),
    permissions,
    legacyCapabilities: {
      accessManagerTools: isOwnerRole(user.role) || isManager,
      manageUsers: isOwnerRole(user.role),
      manageManagerPermissions: isOwnerRole(user.role),
      manageAcademicContent: canManageAcademicContent(user),
      reviewAcademicTransfers: canReviewAcademicTransfer(user),
      approveAchievementAwards: canApproveAchievementAwards(user),
      recommendAchievementAwards: canRecommendAchievementAwards(user),
      seniorManager: isSeniorManager(user),
      juniorManager: isJuniorManager(user),
    },
  });
});


/** Owner assigns or removes a distinct manager role. Admin and Owner targets are immutable here. */
router.patch("/:userId/role", requireAuth, ownerOnly, async (req, res): Promise<void> => {
  const userId = Number(req.params.userId);
  const nextRole = req.body?.role;
  if (!Number.isSafeInteger(userId) || userId <= 0 || !["junior_manager", "senior_manager", "teacher"].includes(nextRole)) {
    res.status(400).json({ error: "Provide a valid user ID and role: junior_manager, senior_manager or teacher." });
    return;
  }
  const targetResult = await pool.query("SELECT id,name,role FROM users WHERE id=$1", [userId]);
  const target = targetResult.rows[0] as { id: number; name: string; role: string } | undefined;
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (isOwnerRole(target.role) || normalizeRole(target.role) === "admin") {
    res.status(403).json({ error: "Owner and Admin roles cannot be changed through manager assignment." });
    return;
  }
  if (nextRole === "teacher" && !managerRoles.has(normalizeRole(target.role)) && normalizeRole(target.role) !== "teacher") {
    res.status(409).json({ error: "Only a teacher or manager account can be demoted through this control." });
    return;
  }
  await pool.query(
    "UPDATE users SET role=$2,is_manager=false,manager_level=$3,updated_at=now() WHERE id=$1",
    [userId, nextRole, nextRole === "senior_manager" ? "senior" : "junior"],
  );
  await pool.query(
    "INSERT INTO audit_logs (action,category,performed_by,target_type,target_id,details) VALUES ($1,'security',$2,'user',$3,$4)",
    [nextRole === "teacher" ? "Removed manager role" : "Assigned " + nextRole, req.currentUser!.id, userId, JSON.stringify({ previousRole: target.role, nextRole })],
  );
  res.json({ updated: true, userId, role: nextRole, name: target.name });
});

router.get("/:userId", requireAuth, ownerOnly, async (req, res): Promise<void> => {
  const userId = Number(req.params.userId);
  if (!Number.isSafeInteger(userId) || userId <= 0) { res.status(400).json({ error: "Invalid manager user ID" }); return; }
  const target = await getTargetManager(userId);
  if (!target) { res.status(404).json({ error: "Manager account not found" }); return; }
  const result = await pool.query("SELECT permission_key, granted, changed_by, changed_at FROM manager_permission_grants WHERE manager_user_id=$1 ORDER BY permission_key", [userId]);
  const grants = Object.fromEntries(MANAGER_PERMISSION_CATALOG.map((p) => [p.key, false]));
  for (const row of result.rows) if (allowedKeys.has(row.permission_key)) grants[row.permission_key] = row.granted === true;
  res.setHeader("Cache-Control", "no-store");
  res.json({ manager: { id: target.id, name: target.name, email: target.email, role: target.role, managerLevel: target.manager_level }, permissions: MANAGER_PERMISSION_CATALOG.map((p) => ({ ...p, granted: grants[p.key] })), updatedAt: result.rows.reduce((latest: string | null, row: any) => !latest || new Date(row.changed_at) > new Date(latest) ? row.changed_at : latest, null) });
});

router.put("/:userId", requireAuth, ownerOnly, async (req, res): Promise<void> => {
  const userId = Number(req.params.userId);
  if (!Number.isSafeInteger(userId) || userId <= 0) { res.status(400).json({ error: "Invalid manager user ID" }); return; }
  const target = await getTargetManager(userId);
  if (!target) { res.status(404).json({ error: "Manager account not found" }); return; }
  const permissions = req.body?.permissions;
  if (!Array.isArray(permissions) || permissions.length > MANAGER_PERMISSION_CATALOG.length) {
    res.status(400).json({ error: "permissions must be an array of known permission decisions" });
    return;
  }
  const seen = new Set<string>();
  for (const item of permissions) {
    if (!item || typeof item.key !== "string" || !allowedKeys.has(item.key) || typeof item.granted !== "boolean" || seen.has(item.key)) {
      res.status(400).json({ error: "Every permission must contain a unique known key and a boolean granted value" });
      return;
    }
    seen.add(item.key);
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const item of permissions as Array<{ key: string; granted: boolean }>) {
      const previous = await client.query("SELECT granted FROM manager_permission_grants WHERE manager_user_id=$1 AND permission_key=$2 FOR UPDATE", [userId, item.key]);
      const previousGranted = previous.rows[0]?.granted ?? null;
      await client.query(
        "INSERT INTO manager_permission_grants (manager_user_id,permission_key,granted,changed_by,changed_at) VALUES ($1,$2,$3,$4,now()) ON CONFLICT (manager_user_id,permission_key) DO UPDATE SET granted=EXCLUDED.granted,changed_by=EXCLUDED.changed_by,changed_at=now()",
        [userId, item.key, item.granted, req.currentUser!.id],
      );
      if (previousGranted !== item.granted) {
        await client.query(
          "INSERT INTO manager_permission_history (manager_user_id,permission_key,previous_granted,granted,changed_by) VALUES ($1,$2,$3,$4,$5)",
          [userId, item.key, previousGranted, item.granted, req.currentUser!.id],
        );
      }
    }
    await client.query(
      "INSERT INTO audit_logs (action,category,performed_by,target_type,target_id,details) VALUES ($1,'security',$2,'manager',$3,$4)",
      ["Updated individual manager permissions", req.currentUser!.id, userId, JSON.stringify({ changedKeys: permissions.map((p: any) => p.key) })],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  res.json({ saved: true, managerUserId: userId, changedCount: permissions.length });
});

router.get("/:userId/history", requireAuth, ownerOnly, async (req, res): Promise<void> => {
  const userId = Number(req.params.userId);
  if (!Number.isSafeInteger(userId) || userId <= 0) { res.status(400).json({ error: "Invalid manager user ID" }); return; }
  const target = await getTargetManager(userId);
  if (!target) { res.status(404).json({ error: "Manager account not found" }); return; }
  const result = await pool.query(
    "SELECT h.id,h.permission_key,h.previous_granted,h.granted,h.changed_at,u.name AS changed_by_name FROM manager_permission_history h JOIN users u ON u.id=h.changed_by WHERE h.manager_user_id=$1 ORDER BY h.changed_at DESC LIMIT 200",
    [userId],
  );
  res.json({ history: result.rows });
});

export default router;
