import { Router } from "express";
import { db, pool } from "@workspace/db";
import { ownerAlertsTable } from "@workspace/db/schema";
import { eq, desc, inArray, and } from "drizzle-orm";
import { requireAuth, isOwnerRole, canAccessManager } from "../lib/auth-middleware";
import { managerHasPermission } from "../lib/manager-permission-policy";
import { canModerateUser } from "../lib/role-access";

const router = Router();

const isOwnerOrAdmin = (role: string): boolean => isOwnerRole(role);
const managerVisibleCategories = ["academic", "attendance", "content", "student", "teacher", "moderation", "general"];
const permissionForAlert = (alert: any): string => {
  if (alert.targetType === "transfer_request") return "transfers.view";
  if (alert.targetType === "academic_report_draft") return "reports.view";
  if (alert.targetType === "user") return "users.view";
  if (alert.category === "attendance") return "attendance.view";
  if (["content", "moderation"].includes(alert.category)) return "moderation.view";
  if (["student", "teacher"].includes(alert.category)) return "users.view";
  if (alert.category === "academic") return "reports.view";
  return "notifications.view";
};
async function visibleManagerAlerts(user: NonNullable<Express.Request["currentUser"]>) {
  const [rows, ownerRows] = await Promise.all([
    db.select().from(ownerAlertsTable).where(inArray(ownerAlertsTable.category, managerVisibleCategories)).orderBy(desc(ownerAlertsTable.createdAt)),
    pool.query("SELECT id FROM users WHERE lower(role) IN ('owner','platform_owner')"),
  ]);
  const relatedIds=[...new Set(rows.flatMap((row:any)=>[Number(row.reportedBy||0),row.targetType==="user"?Number(row.targetId||0):0]).filter((id:number)=>Number.isSafeInteger(id)&&id>0))];
  const related=relatedIds.length?await pool.query("SELECT id,role,is_manager,manager_level FROM users WHERE id=ANY($1::int[])",[relatedIds]):{rows:[] as any[]};
  const byId=new Map(related.rows.map((row:any)=>[Number(row.id),row]));
  const filtered = rows.filter((row: any) => {
    if(row.reporterRole==="owner"||row.reporterRole==="platform_owner")return false;
    const reporter=byId.get(Number(row.reportedBy));
    if(reporter && Number(reporter.id)!==user.id && !canModerateUser(user,{role:reporter.role,isManager:reporter.is_manager,managerLevel:reporter.manager_level}))return false;
    if(row.targetType==="user"){
      const target=byId.get(Number(row.targetId));
      if(!target || !canModerateUser(user,{role:target.role,isManager:target.is_manager,managerLevel:target.manager_level}))return false;
    }
    return true;
  });
  const allowed = await Promise.all(filtered.map(async (row: any) => (await managerHasPermission(user, permissionForAlert(row))) ? row : null));
  return allowed.filter(Boolean);
}
async function canManagerAccessAlert(user: NonNullable<Express.Request["currentUser"]>, alert: any) {
  if (alert.reporterRole === "owner" || alert.reporterRole === "platform_owner") return false;
  if (alert.targetType === "user") {
    const target = await pool.query("SELECT role FROM users WHERE id=$1", [alert.targetId]);
    if (isOwnerRole(target.rows[0]?.role)) return false;
  }
  return managerVisibleCategories.includes(alert.category) && managerHasPermission(user, permissionForAlert(alert));
}

router.get("/owner-alerts", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (isOwnerOrAdmin(user.role)) {
    const rows = await db.select().from(ownerAlertsTable).orderBy(desc(ownerAlertsTable.createdAt));
    res.json(rows); return;
  }
  if (canAccessManager(user)) {
    const rows = await visibleManagerAlerts(user);
    res.json(rows); return;
  }
  const rows = await db.select().from(ownerAlertsTable).where(eq(ownerAlertsTable.reportedBy, user.id)).orderBy(desc(ownerAlertsTable.createdAt));
  res.json(rows);
});

router.get("/owner-alerts/unread-count", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (isOwnerOrAdmin(user.role)) {
    const rows = await db.select().from(ownerAlertsTable).where(eq(ownerAlertsTable.isRead, false));
    res.json({ count: rows.length }); return;
  }
  if (canAccessManager(user)) {
    const rows = await visibleManagerAlerts(user);
    res.json({ count: rows.filter((row: any) => !row.isRead).length }); return;
  }
  res.json({ count: 0 });
});

router.post("/owner-alerts", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const { title, description, category, severity, targetType, targetId, targetName, attachmentUrl } = req.body;
  if (!title || !description) { res.status(400).json({ error: "title and description required" }); return; }
  const [row] = await db.insert(ownerAlertsTable).values({
    title, description,
    category: category ?? "general",
    severity: severity ?? "medium",
    reportedBy: user.id,
    reporterName: user.name,
    reporterRole: user.role,
    targetType, targetId, targetName, attachmentUrl,
  }).returning();
  res.status(201).json(row);
});

router.put("/owner-alerts/:id/read", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const id = parseInt(String(req.params.id));
  const [existing] = await db.select().from(ownerAlertsTable).where(eq(ownerAlertsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Alert not found." }); return; }
  if (!isOwnerOrAdmin(user.role) && (!canAccessManager(user) || !(await canManagerAccessAlert(user, existing)))) { res.status(403).json({ error: "You cannot update this alert." }); return; }
  const [row] = await db.update(ownerAlertsTable).set({ isRead: true }).where(eq(ownerAlertsTable.id, id)).returning();
  res.json(row);
});

router.put("/owner-alerts/:id/resolve", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const id = parseInt(String(req.params.id));
  const [existing] = await db.select().from(ownerAlertsTable).where(eq(ownerAlertsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Alert not found." }); return; }
  if (!isOwnerOrAdmin(user.role) && (!canAccessManager(user) || !(await canManagerAccessAlert(user, existing)))) { res.status(403).json({ error: "You cannot resolve this alert." }); return; }
  const { resolution } = req.body;
  const [row] = await db.update(ownerAlertsTable)
    .set({ status: "resolved", isRead: true, resolution, resolvedBy: user.id, resolvedAt: new Date() })
    .where(eq(ownerAlertsTable.id, id)).returning();
  res.json(row);
});

router.delete("/owner-alerts/:id", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!isOwnerOrAdmin(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(ownerAlertsTable).where(eq(ownerAlertsTable.id, parseInt(String(req.params.id))));
  res.json({ ok: true });
});

export default router;
