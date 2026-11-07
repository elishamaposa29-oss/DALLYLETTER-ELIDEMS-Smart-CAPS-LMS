import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { requireAuth, isOwnerRole } from "../lib/auth-middleware";
import {
  normalizeRole,
  isSeniorManager,
  isSeniorOnlyManagerPermission,
} from "../lib/role-access";

const router: IRouter = Router();

/**
 * The catalogue describes actions that can be requested. It does not grant them.
 * No manager receives operational capabilities from role or seniority.
 * Owner grants every permission individually; senior-only actions remain unavailable to Junior Managers.
 * Owner-only powers are deliberately absent.
 */
export const MANAGER_PERMISSION_CATALOG = [
  { key: "manager.dashboard.view", group: "Dashboard", label: "View manager dashboard", description: "Open the manager overview and action queue." },
  { key: "manager.monitoring.view", seniorOnly: true, group: "Monitoring", label: "View operational monitoring", description: "Read system health, error and service monitoring information; no operational controls." },
  { key: "users.view", group: "Users", label: "View users", description: "View permitted teacher, learner and prefect records." },
  { key: "users.block", group: "Users", label: "Block users", description: "Block eligible subordinate accounts from login." },
  { key: "users.restore", group: "Users", label: "Restore user access", description: "Unblock or unsuspend eligible subordinate accounts." },
  { key: "users.suspend", group: "Users", label: "Suspend users", description: "Suspend eligible subordinate accounts with limited access." },
  { key: "users.override.teacher", group: "Users", label: "Override teacher actions", description: "Reverse or correct permitted teacher actions." },
  { key: "users.override.learner", group: "Users", label: "Override learner actions", description: "Reverse or correct permitted learner actions." },
  { key: "users.override.prefect", group: "Users", label: "Override prefect actions", description: "Reverse or correct permitted prefect actions." },
  { key: "users.override.junior_manager", group: "Users", label: "Override Junior Manager actions", description: "Senior-level review of Junior Manager actions only." },
  { key: "attendance.view", group: "Attendance", label: "View attendance", description: "View school-scoped attendance records." },
  { key: "attendance.edit", group: "Attendance", label: "Edit attendance", description: "Correct attendance records with an audit reason." },
  { key: "recordbook.view", group: "Academic", label: "View RecordBook", description: "View teacher and learner activity records." },
  { key: "recordbook.edit", group: "Academic", label: "Edit RecordBook marks", description: "Correct marks and trigger recalculation with an audit trail." },
  { key: "reports.create", group: "Academic", label: "Create academic reports", description: "Create and submit school-scoped report drafts." },
  { key: "reports.view", group: "Academic", label: "View reports", description: "View school-scoped academic reports." },
  { key: "reports.review", seniorOnly: true, group: "Academic", label: "Approve or reject reports", description: "Review submitted academic reports and record a decision." },
  { key: "transfers.view", group: "Transfers", label: "View transfer requests", description: "View school-scoped transfer requests and documents." },
  { key: "transfers.reject", group: "Transfers", label: "Reject transfer requests", description: "Reject eligible transfer requests with a reason; does not grant approval." },
  { key: "transfers.approve", seniorOnly: true, group: "Transfers", label: "Approve transfer requests", description: "Approve eligible transfer requests with verification and audit history." },
  { key: "teacher_cv.chat", group: "Teacher CV", label: "Chat with applying teachers", description: "Use the existing private application conversation with applicants." },
  { key: "teacher_cv.view", group: "Teacher applications", label: "View teacher CV applications", description: "Review submitted teacher CV information." },
  { key: "teacher_cv.review", seniorOnly: true, group: "Teacher applications", label: "Review teacher applications", description: "Request corrections or reject an application." },
  { key: "teacher_cv.authorize", seniorOnly: true, group: "Teacher applications", label: "Authorize approved teachers", description: "Activate teaching access after Owner-defined approval checks." },
  { key: "qualifications.view", group: "Teacher applications", label: "View qualifications", description: "View qualification evidence submitted by teachers." },
  { key: "qualifications.verify", seniorOnly: true, group: "Teacher applications", label: "Verify qualifications", description: "Verify or reject individual qualification records." },
  { key: "achievements.view", group: "Achievements", label: "View achievement recommendations", description: "View learner achievement recommendations." },
  { key: "achievements.recommend", group: "Achievements", label: "Recommend achievements", description: "Submit achievement recommendations for review." },
  { key: "achievements.approve", seniorOnly: true, group: "Achievements", label: "Approve achievements", description: "Approve eligible achievement awards." },
  { key: "moderation.view", group: "Moderation", label: "View moderation queue", description: "Review school-scoped content flags." },
  { key: "moderation.action", group: "Moderation", label: "Take moderation action", description: "Resolve eligible content moderation cases." },
  { key: "notifications.create", group: "Communications", label: "Send notifications", description: "Create school-scoped notifications for permitted recipients." },
  { key: "classes.manage", group: "Learning content", label: "Create and manage live classes", description: "Schedule, edit and cancel classes owned by teachers below your manager authority." },
  { key: "lessons.create", group: "Learning content", label: "Create lessons", description: "Create lesson content and upload lesson media." },
  { key: "lessons.edit", group: "Learning content", label: "Edit subordinate lessons", description: "Edit lesson content owned by teachers below your manager authority." },
  { key: "lessons.delete", group: "Learning content", label: "Delete subordinate lessons", description: "Delete lesson content owned by teachers below your manager authority." },
  { key: "lessons.notify", group: "Learning content", label: "Notify lesson followers", description: "Send lesson updates to opted-in followers for permitted teachers." },
  { key: "polls.manage", group: "Learning content", label: "Create and manage polls", description: "Create, generate, edit and delete school polls." },
  { key: "messages.send", group: "Communications", label: "Send private messages to subordinates", description: "Use the existing private messaging system with eligible subordinate accounts." },
  { key: "content.view_comments", group: "Moderation", label: "View teacher content comments", description: "Read existing manager comments on subordinate educational content." },
  { key: "content.comment", group: "Moderation", label: "Comment on teacher work", description: "Leave an auditable manager comment on eligible teacher content." },
  { key: "notifications.broadcast", group: "Communications", label: "Send broadcasts", description: "Send school-scoped broadcast messages to selected recipients." },
  { key: "notifications.view", group: "Communications", label: "View manager notifications", description: "View alerts and workflow notifications available to this manager." },
  { key: "groups.manage", group: "Communications", label: "Manage study groups", description: "Manage eligible school study groups and Connect spaces." },
  { key: "audit.view_subordinate", group: "Audit", label: "View subordinate audit history", description: "View permitted actions by subordinate users only; never Owner or Admin activity." },
  { key: "owner.chat", group: "Communications", label: "Chat with Owner", description: "Communicate with Owner without access to Owner controls or activity." },
  { key: "ai.agent.use", group: "ELIDEMS AI Agent", label: "Use ELIDEMS AI Agent", description: "Open staff agent mode. This does not grant any task permission by itself." },
  { key: "ai.agent.read_academic", group: "ELIDEMS AI Agent", label: "Read academic information", description: "Ask the agent to summarize academic information already visible to this manager." },
  { key: "ai.agent.read_learners", group: "ELIDEMS AI Agent", label: "Read permitted learner records", description: "Ask the agent to analyze learner records within existing subordinate and school scope." },
  { key: "ai.agent.create_learning", group: "ELIDEMS AI Agent", label: "Prepare learning activities", description: "Prepare lessons, exercises, polls and assignments through existing authorized workflows." },
  { key: "ai.agent.communicate", group: "ELIDEMS AI Agent", label: "Prepare communications", description: "Draft messages and notifications; sending still requires existing communication permissions and confirmation." },
  { key: "ai.agent.moderate", group: "ELIDEMS AI Agent", label: "Assist content moderation", description: "Analyze and summarize permitted moderation cases; human review remains required." },
  { key: "ai.agent.manage_accounts", seniorOnly: true, group: "ELIDEMS AI Agent", label: "Prepare account actions", description: "Prepare eligible subordinate account actions; existing account permission and confirmation are still required." },
  { key: "ai.agent.approve_workflows", seniorOnly: true, group: "ELIDEMS AI Agent", label: "Assist approval workflows", description: "Prepare approval recommendations; final approval must use the existing authorized workflow." },
  { key: "ai.agent.read_financials", seniorOnly: true, group: "ELIDEMS AI Agent", label: "Read permitted financial summaries", description: "Summarize financial information already available to this Senior Manager; no payout execution." },
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
  res.json({ permissions: MANAGER_PERMISSION_CATALOG.map((p) => ({ ...p, seniorOnly: isSeniorOnlyManagerPermission(p.key) })), protectedCapabilities: ["owner.account.manage", "owner.activity.view", "owner.audit.view", "owner.permissions.manage", "admin.account.manage"] });
});

/** Effective permissions: persisted per-user Owner decisions only; no role-based defaults. */
router.get("/me", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  // Resolve role and manager level from PostgreSQL on every read so role changes
  // are reflected immediately instead of trusting stale JWT role claims.
  const accountResult = await pool.query(
    "SELECT role,is_manager,manager_level,teacher_application_status FROM users WHERE id=$1 LIMIT 1",
    [user.id],
  );
  const account = accountResult.rows[0] as { role: string; is_manager: boolean; manager_level: string | null; teacher_application_status: string | null } | undefined;
  if (!account) { res.status(401).json({ error: "Account no longer exists" }); return; }
  const currentRole = normalizeRole(account.role);
  const isOwner = isOwnerRole(currentRole);
  const isManager = managerRoles.has(currentRole) || (currentRole === "teacher" && account.is_manager === true && account.teacher_application_status !== "pending_review");
  if (!isOwner && !isManager) {
    res.status(403).json({ error: "Manager access required" });
    return;
  }
  const result = isOwner
    ? { rows: [] as Array<{ permission_key: string; granted: boolean }> }
    : await pool.query("SELECT permission_key, granted FROM manager_permission_grants WHERE manager_user_id=$1", [user.id]);
  const permissions = Object.fromEntries(MANAGER_PERMISSION_CATALOG.map((p) => [p.key, false]));
  for (const row of result.rows) if (allowedKeys.has(row.permission_key)) permissions[row.permission_key] = row.granted === true;
  res.setHeader("Cache-Control", "no-store");
  res.json({
    userId: user.id,
    role: currentRole,
    isOwner,
    protectedCapabilities: ["owner.account.manage", "owner.activity.view", "owner.audit.view", "owner.permissions.manage", "admin.account.manage"],
    permissions,
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
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query("SELECT id,name,role,is_manager FROM users WHERE id=$1 FOR UPDATE", [userId]);
    const target = selected.rows[0] as { id: number; name: string; role: string; is_manager: boolean } | undefined;
    if (!target) { await client.query("ROLLBACK"); res.status(404).json({ error: "User not found" }); return; }
    const previousRole = normalizeRole(target.role);
    if (isOwnerRole(previousRole) || previousRole === "admin") {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "Owner and Admin roles cannot be changed through manager assignment." });
      return;
    }
    if (nextRole === "teacher") {
      if (!managerRoles.has(previousRole) && target.is_manager !== true) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "This account is not currently a manager." });
        return;
      }
      const savedRole = await client.query("SELECT original_role FROM manager_role_assignments WHERE manager_user_id=$1", [userId]);
      const restoredRole = savedRole.rows[0]?.original_role || "teacher";
      await client.query("UPDATE users SET role=$2,is_manager=false,manager_level='junior',updated_at=now() WHERE id=$1", [userId, restoredRole]);
      await client.query("DELETE FROM manager_role_assignments WHERE manager_user_id=$1", [userId]);
      const currentGrants = await client.query("SELECT permission_key,granted FROM manager_permission_grants WHERE manager_user_id=$1 AND granted=true FOR UPDATE", [userId]);
      for (const grant of currentGrants.rows) {
        await client.query("UPDATE manager_permission_grants SET granted=false,changed_by=$2,changed_at=now() WHERE manager_user_id=$1 AND permission_key=$3", [userId, req.currentUser!.id, grant.permission_key]);
        await client.query("INSERT INTO manager_permission_history (manager_user_id,permission_key,previous_granted,granted,changed_by) VALUES ($1,$2,true,false,$3)", [userId, grant.permission_key, req.currentUser!.id]);
      }
      await client.query(
        "INSERT INTO audit_logs (action,category,performed_by,target_type,target_id,details) VALUES ($1,'security',$2,'user',$3,$4)",
        ["Removed manager role and revoked all grants", req.currentUser!.id, userId, JSON.stringify({ previousRole, restoredRole, revokedPermissions: currentGrants.rows.map((r: any) => r.permission_key) })],
      );
      await client.query("COMMIT");
      res.json({ updated: true, userId, role: restoredRole, name: target.name, revokedPermissions: currentGrants.rows.length });
      return;
    }
    if (!managerRoles.has(previousRole)) {
      if (!["teacher", "student", "learner", "prefect"].includes(previousRole)) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "This account type cannot be promoted to manager." });
        return;
      }
      await client.query(
        "INSERT INTO manager_role_assignments (manager_user_id,original_role,assigned_by) VALUES ($1,$2,$3) ON CONFLICT (manager_user_id) DO NOTHING",
        [userId, previousRole, req.currentUser!.id],
      );
    }
    await client.query("UPDATE users SET role=$2,is_manager=false,manager_level=$3,updated_at=now() WHERE id=$1", [userId, nextRole, nextRole === "senior_manager" ? "senior" : "junior"]);
    // Role assignment never grants permissions. Preserve only prior explicit grants;
    // revoke senior-only grants on demotion so approval powers cannot survive demotion.
    for (const permission of MANAGER_PERMISSION_CATALOG) {
      const prior = await client.query(
        "SELECT granted FROM manager_permission_grants WHERE manager_user_id=$1 AND permission_key=$2 FOR UPDATE",
        [userId, permission.key],
      );
      const previous = prior.rows[0]?.granted ?? null;
      const granted = nextRole === "junior_manager" && isSeniorOnlyManagerPermission(permission.key)
        ? false
        : previous === true;
      if (previous === null && !granted) continue;
      await client.query(
        "INSERT INTO manager_permission_grants(manager_user_id,permission_key,granted,changed_by,changed_at) VALUES($1,$2,$3,$4,now()) ON CONFLICT(manager_user_id,permission_key) DO UPDATE SET granted=EXCLUDED.granted,changed_by=EXCLUDED.changed_by,changed_at=now()",
        [userId, permission.key, granted, req.currentUser!.id],
      );
      if (previous !== granted) {
        await client.query(
          "INSERT INTO manager_permission_history(manager_user_id,permission_key,previous_granted,granted,changed_by) VALUES($1,$2,$3,$4,$5)",
          [userId, permission.key, previous, granted, req.currentUser!.id],
        );
      }
    }
    await client.query(
      "INSERT INTO audit_logs (action,category,performed_by,target_type,target_id,details) VALUES ($1,'security',$2,'user',$3,$4)",
      ["Assigned " + nextRole, req.currentUser!.id, userId, JSON.stringify({ previousRole, nextRole })],
    );
    await client.query("COMMIT");
    res.json({ updated: true, userId, role: nextRole, name: target.name });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
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
  res.json({ manager: { id: target.id, name: target.name, email: target.email, role: target.role, managerLevel: target.manager_level }, permissions: MANAGER_PERMISSION_CATALOG.map((p) => ({ ...p, seniorOnly: isSeniorOnlyManagerPermission(p.key), granted: grants[p.key] })), updatedAt: result.rows.reduce((latest: string | null, row: any) => !latest || new Date(row.changed_at) > new Date(latest) ? row.changed_at : latest, null) });
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
  const targetIsSenior = isSeniorManager({ role: target.role, managerLevel: target.manager_level, isManager: target.is_manager });
  if (!targetIsSenior && (permissions as Array<{ key: string; granted: boolean }>).some((item) => isSeniorOnlyManagerPermission(item.key) && item.granted)) {
    res.status(400).json({ error: "Senior-only permissions cannot be granted to a Junior Manager." });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize permission edits with role changes; re-check the live role under the same row lock.
    const lockedTarget = await client.query(
      "SELECT id,role,is_manager,manager_level FROM users WHERE id=$1 FOR UPDATE",
      [userId],
    );
    const liveTarget = lockedTarget.rows[0] as { id: number; role: string; is_manager: boolean; manager_level: string } | undefined;
    if (!liveTarget || isOwnerRole(liveTarget.role) || normalizeRole(liveTarget.role) === "admin" ||
        (!managerRoles.has(normalizeRole(liveTarget.role)) && !(normalizeRole(liveTarget.role) === "teacher" && liveTarget.is_manager))) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "The target is no longer an eligible manager account." });
      return;
    }
    const liveTargetIsSenior = isSeniorManager(liveTarget);
    if (!liveTargetIsSenior && (permissions as Array<{ key: string; granted: boolean }>).some((item) => isSeniorOnlyManagerPermission(item.key) && item.granted)) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Senior-only permissions cannot be granted after a role change to Junior Manager." });
      return;
    }
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
