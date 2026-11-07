import { Router } from "express";
import { requireManagerPermissionIfManager } from "../lib/manager-permission-policy";
import { db, auditLogsTable } from "@workspace/db";
import { attendanceTable, usersTable, classesTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { canManageAcademicContent, requireAuth, isOwnerRole } from "../lib/auth-middleware";
import { canModerateUser } from "../lib/role-access";
import { canViewProfileSection } from "./profileConnections";

const router = Router();

router.get("/class/:classId", requireAuth, requireManagerPermissionIfManager("attendance.view"), async (req, res): Promise<void> => {
  const classId = Number(req.params.classId);
  const [classRow] = await db.select({ teacherId: classesTable.teacherId }).from(classesTable).where(eq(classesTable.id, classId));
  if (!classRow) { res.status(404).json({ error: "Class not found." }); return; }
  const [teacher] = await db.select({ role: usersTable.role, isManager: usersTable.isManager, managerLevel: usersTable.managerLevel }).from(usersTable).where(eq(usersTable.id, classRow.teacherId));
  if (teacher && req.currentUser!.id !== classRow.teacherId && !isOwnerRole(req.currentUser!.role) && !canModerateUser(req.currentUser!, teacher)) { res.status(404).json({ error: "Class not found." }); return; }
  const rows = await db.select().from(attendanceTable)
    .where(eq(attendanceTable.classId, classId))
    .orderBy(desc(attendanceTable.joinedAt));
  const visible = await Promise.all(rows.map(async row => {
    const [target] = await db.select({ role: usersTable.role, isManager: usersTable.isManager, managerLevel: usersTable.managerLevel }).from(usersTable).where(eq(usersTable.id, row.studentId));
    const inAuthority = req.currentUser!.id === row.studentId || isOwnerRole(req.currentUser!.role) || Boolean(target && canModerateUser(req.currentUser!, target));
    return inAuthority && (await canViewProfileSection(req.currentUser!,row.studentId,"attendance")) ? row : null;
  }));
  res.json(visible.filter(Boolean));
});

router.get("/my", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const rows = await db.select().from(attendanceTable)
    .where(eq(attendanceTable.studentId, user.id))
    .orderBy(desc(attendanceTable.joinedAt));
  res.json(rows);
});

router.get("/student/:studentId", requireAuth, requireManagerPermissionIfManager("attendance.view"), async (req, res): Promise<void> => {
  const studentId = parseInt(String(req.params.studentId));
  const [target] = Number.isSafeInteger(studentId) ? await db.select({ role: usersTable.role, isManager: usersTable.isManager, managerLevel: usersTable.managerLevel }).from(usersTable).where(eq(usersTable.id, studentId)) : [];
  const inAuthority = req.currentUser!.id === studentId || isOwnerRole(req.currentUser!.role) || Boolean(target && canModerateUser(req.currentUser!, target));
  if (!Number.isSafeInteger(studentId) || studentId <= 0 || !inAuthority) { res.status(404).json({ error: "User not found." }); return; }
  if (!(await canViewProfileSection(req.currentUser!,studentId,"attendance"))) { res.status(403).json({ error: "Attendance visibility is restricted by this profile's privacy settings." }); return; }
  const rows = await db.select().from(attendanceTable)
    .where(eq(attendanceTable.studentId, studentId))
    .orderBy(desc(attendanceTable.joinedAt));
  res.json(rows);
});

router.post("/join/:classId", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role !== "student") { res.status(403).json({ error: "Students only" }); return; }
  const classId = parseInt(String(req.params.classId));
  const existing = await db.select().from(attendanceTable)
    .where(and(eq(attendanceTable.classId, classId), eq(attendanceTable.studentId, user.id)));
  if (existing.length > 0) { res.json(existing[0]); return; }
  const [row] = await db.insert(attendanceTable).values({
    classId, studentId: user.id, studentName: user.name, status: "present",
  }).returning();
  await db.update(usersTable).set({ lastActiveDate: new Date().toISOString().split("T")[0] }).where(eq(usersTable.id, user.id));
  await db.insert(auditLogsTable).values({ action: `Marked attendance present for ${user.name}`, category: "attendance", performedBy: user.id, targetType: "attendance", targetId: row.id, details: JSON.stringify({ userId: user.id, userName: user.name, status: "present" }) });
  res.status(201).json(row);
});

router.put("/:id/status", requireAuth, requireManagerPermissionIfManager("attendance.edit"), async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!canManageAcademicContent(user)) { res.status(403).json({ error: "Academic staff access required" }); return; }
  const status = req.body?.status === "absent" ? "absent" : req.body?.status === "present" ? "present" : null;
  const id = parseInt(String(req.params.id));
  if (!status || !Number.isInteger(id)) { res.status(400).json({ error: "status must be present or absent" }); return; }
  const [existing] = await db.select({ studentId: attendanceTable.studentId }).from(attendanceTable).where(eq(attendanceTable.id, id));
  if (!existing) { res.status(404).json({ error: "Attendance record not found" }); return; }
  const [target] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, existing.studentId));
  if (target && isOwnerRole(target.role) && !isOwnerRole(user.role)) { res.status(404).json({ error: "Attendance record not found" }); return; }
  const [row] = await db.update(attendanceTable).set({ status }).where(eq(attendanceTable.id, id)).returning();
  await db.insert(auditLogsTable).values({ action: `Marked attendance ${status} for ${row.studentName}`, category: "attendance", performedBy: user.id, targetType: "attendance", targetId: row.id, details: JSON.stringify({ studentId: row.studentId, studentName: row.studentName, status }) });
  res.json(row);
});

router.put("/:id/leave", requireAuth, requireManagerPermissionIfManager("attendance.edit"), async (req, res): Promise<void> => {
  const leftAt = new Date();
  const [row] = await db.select().from(attendanceTable).where(eq(attendanceTable.id, parseInt(String(req.params.id))));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const actor = req.currentUser!;
  if (row.studentId !== actor.id && !canManageAcademicContent(actor)) { res.status(403).json({ error: "You cannot close another user's attendance session." }); return; }
  const [target] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, row.studentId));
  if (target && isOwnerRole(target.role) && !isOwnerRole(actor.role)) { res.status(404).json({ error: "Not found" }); return; }
  const durationMs = leftAt.getTime() - new Date(row.joinedAt).getTime();
  const durationMinutes = Math.round(durationMs / 60000);
  const [updated] = await db.update(attendanceTable)
    .set({ leftAt, durationMinutes }).where(eq(attendanceTable.id, parseInt(String(req.params.id)))).returning();
  res.json(updated);
});

router.get("/stats", requireAuth, requireManagerPermissionIfManager("attendance.view"), async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!canManageAcademicContent(user)) { res.status(403).json({ error: "Forbidden" }); return; }
  const rows = await db.select({ classId: attendanceTable.classId, studentId: attendanceTable.studentId, durationMinutes: attendanceTable.durationMinutes, role: usersTable.role, isManager: usersTable.isManager, managerLevel: usersTable.managerLevel, teacherId: classesTable.teacherId }).from(attendanceTable).innerJoin(usersTable, eq(attendanceTable.studentId, usersTable.id)).innerJoin(classesTable,eq(attendanceTable.classId,classesTable.id));
  const teacherRows=await db.select({id:usersTable.id,role:usersTable.role,isManager:usersTable.isManager,managerLevel:usersTable.managerLevel}).from(usersTable);
  const teacherById=new Map(teacherRows.map(row=>[row.id,row]));
  const scopedRows = isOwnerRole(user.role) ? rows : rows.filter(row => {
    const studentAllowed=Number(row.studentId)===user.id||canModerateUser(user,row);
    const teacher=teacherById.get(row.teacherId);
    const teacherAllowed=Number(row.teacherId)===user.id||Boolean(teacher&&canModerateUser(user,teacher));
    return studentAllowed&&teacherAllowed;
  });
  const totalSessions = new Set(scopedRows.map((r: any) => r.classId)).size;
  const totalAttendances = scopedRows.length;
  const uniqueStudents = new Set(scopedRows.map((r: any) => r.studentId)).size;
  const withDuration = scopedRows.filter((r: any) => r.durationMinutes);
  const avgDuration = withDuration.length > 0 ? withDuration.reduce((s: number, r: any) => s + r.durationMinutes, 0) / withDuration.length : 0;
  res.json({ totalSessions, totalAttendances, uniqueStudents, avgDuration: Math.round(avgDuration) });
});

export default router;
