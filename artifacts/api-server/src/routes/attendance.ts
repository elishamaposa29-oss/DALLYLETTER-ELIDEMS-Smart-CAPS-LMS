import { Router } from "express";
import { requireManagerPermissionIfManager } from "../lib/manager-permission-policy";
import { db, pool, auditLogsTable } from "@workspace/db";
import { attendanceTable, usersTable, classesTable } from "@workspace/db/schema";
import { eq, desc, and, inArray } from "drizzle-orm";
import { canManageAcademicContent, requireAuth, isOwnerRole } from "../lib/auth-middleware";
import { canModerateUser } from "../lib/role-access";
import { canViewProfileSection } from "./profileConnections";

const router = Router();

// GET /classes — classes available to this account's attendance workspace.
// This uses attendance.view, not classes.manage, so attendance-only managers
// can open registers without receiving class scheduling/edit authority.
router.get("/classes", requireAuth, requireManagerPermissionIfManager("attendance.view"), async(req,res):Promise<void>=>{
  const actor=req.currentUser!;
  if(!canManageAcademicContent(actor)){res.status(403).json({error:"Teacher or authorized academic staff access required"});return;}
  const rows=await db.select().from(classesTable).orderBy(desc(classesTable.createdAt));
  if(isOwnerRole(actor.role)){res.json(rows);return;}
  if(String(actor.role).toLowerCase()==="teacher"){res.json(rows.filter(row=>Number(row.teacherId)===actor.id));return;}
  const teacherIds=[...new Set(rows.map(row=>row.teacherId))];
  const teachers=teacherIds.length?await db.select({id:usersTable.id,role:usersTable.role,isManager:usersTable.isManager,managerLevel:usersTable.managerLevel}).from(usersTable).where(inArray(usersTable.id,teacherIds)):[];
  const byId=new Map(teachers.map(row=>[row.id,row]));
  res.json(rows.filter(row=>{const teacher=byId.get(row.teacherId);return Boolean(teacher&&canModerateUser(actor,teacher));}));
});

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
    return (req.currentUser!.id === classRow.teacherId || inAuthority) && (await canViewProfileSection(req.currentUser!,row.studentId,"attendance")) ? row : null;
  }));
  res.json(visible.filter(Boolean));
});

// GET /class/:classId/register — enrolled class roster joined to saved attendance evidence.
router.get("/class/:classId/register", requireAuth, requireManagerPermissionIfManager("attendance.view"), async (req,res):Promise<void> => {
  const classId=Number(req.params.classId);
  if(!Number.isSafeInteger(classId)||classId<=0){res.status(400).json({error:"Invalid class id"});return;}
  const [classRow]=await db.select({teacherId:classesTable.teacherId,title:classesTable.title}).from(classesTable).where(eq(classesTable.id,classId));
  if(!classRow){res.status(404).json({error:"Class not found"});return;}
  const actor=req.currentUser!;
  if(actor.id!==classRow.teacherId&&!isOwnerRole(actor.role)){
    const [teacher]=await db.select({role:usersTable.role,isManager:usersTable.isManager,managerLevel:usersTable.managerLevel}).from(usersTable).where(eq(usersTable.id,classRow.teacherId));
    if(!teacher||!canModerateUser(actor,teacher)){res.status(404).json({error:"Class not found"});return;}
  }
  const result=await pool.query(
    "SELECT DISTINCT ON (u.id) u.id AS \"studentId\",u.name AS \"studentName\",a.id,a.status,a.joined_at AS \"joinedAt\",a.is_late AS \"isLate\" FROM enrollments e JOIN users u ON u.id=e.learner_id LEFT JOIN attendance a ON a.class_id=e.class_id AND a.student_id=e.learner_id WHERE e.class_id=$1 AND e.status='active' AND lower(u.role) IN ('student','learner') AND u.is_blocked=false ORDER BY u.id,a.joined_at DESC NULLS LAST",
    [classId]
  );
  const isAssignedTeacher=Number(classRow.teacherId)===actor.id;
  const visible=await Promise.all(result.rows.map(async(row:any)=>(isAssignedTeacher||isOwnerRole(actor.role)||await canViewProfileSection(actor,Number(row.studentId),"attendance"))?row:null));
  res.json({classId,classTitle:classRow.title,learners:visible.filter(Boolean)});
});

// POST /class/:classId/mark — create or update a present/absent record for an enrolled learner.
router.post("/class/:classId/mark", requireAuth, requireManagerPermissionIfManager("attendance.edit"), async(req,res):Promise<void> => {
  const actor=req.currentUser!;
  if(!canManageAcademicContent(actor)){res.status(403).json({error:"Academic staff access required"});return;}
  const classId=Number(req.params.classId),studentId=Number(req.body?.studentId);
  const status=req.body?.status==="absent"?"absent":req.body?.status==="present"?"present":null;
  if(!Number.isSafeInteger(classId)||classId<=0||!Number.isSafeInteger(studentId)||studentId<=0||!status){res.status(400).json({error:"Valid classId, studentId and present/absent status are required"});return;}
  const [classRow]=await db.select({teacherId:classesTable.teacherId}).from(classesTable).where(eq(classesTable.id,classId));
  if(!classRow){res.status(404).json({error:"Class not found"});return;}
  const [target]=await db.select({id:usersTable.id,name:usersTable.name,role:usersTable.role,isManager:usersTable.isManager,managerLevel:usersTable.managerLevel}).from(usersTable).where(eq(usersTable.id,studentId));
  if(!target||!["student","learner"].includes(String(target.role).toLowerCase())){res.status(404).json({error:"Enrolled learner not found"});return;}
  const isAssignedTeacher=Number(classRow.teacherId)===actor.id;
  const isAuthorized=isAssignedTeacher||isOwnerRole(actor.role)||(await canModerateUser(actor,{role:target.role,isManager:target.isManager,managerLevel:target.managerLevel}));
  if(!isAuthorized){res.status(403).json({error:"You are not authorized to manage this class register"});return;}
  const enrolled=await pool.query("SELECT 1 FROM enrollments WHERE class_id=$1 AND learner_id=$2 LIMIT 1",[classId,studentId]);
  if(!enrolled.rows.length){res.status(404).json({error:"This learner is not enrolled in the selected class"});return;}
  if(!isAssignedTeacher&&!isOwnerRole(actor.role)&&!(await canViewProfileSection(actor,studentId,"attendance"))){res.status(403).json({error:"Attendance visibility is restricted by this learner's privacy settings"});return;}
  const [existing]=await db.select({id:attendanceTable.id}).from(attendanceTable).where(and(eq(attendanceTable.classId,classId),eq(attendanceTable.studentId,studentId))).orderBy(desc(attendanceTable.joinedAt)).limit(1);
  const [row]=existing
    ? await db.update(attendanceTable).set({status}).where(eq(attendanceTable.id,existing.id)).returning()
    : await db.insert(attendanceTable).values({classId,studentId,studentName:target.name,status}).returning();
  await db.insert(auditLogsTable).values({action:"Marked "+target.name+" "+status+" in class register",category:"attendance",performedBy:actor.id,targetType:"attendance",targetId:row.id,details:JSON.stringify({classId,studentId,status})});
  res.json(row);
});

router.get("/my", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const rows = await db.select({
    id: attendanceTable.id,
    classId: attendanceTable.classId,
    classTitle: classesTable.title,
    subject: classesTable.subject,
    status: attendanceTable.status,
    joinedAt: attendanceTable.joinedAt,
    leftAt: attendanceTable.leftAt,
    durationMinutes: attendanceTable.durationMinutes,
    isLate: attendanceTable.isLate,
    notes: attendanceTable.notes,
  }).from(attendanceTable)
    .innerJoin(classesTable,eq(attendanceTable.classId,classesTable.id))
    .where(eq(attendanceTable.studentId, user.id))
    .orderBy(desc(attendanceTable.joinedAt));
  res.json(rows);
});

router.get("/student/:studentId", requireAuth, requireManagerPermissionIfManager("attendance.view"), async (req, res): Promise<void> => {
  const studentId = Number(req.params.studentId);
  const [target] = Number.isSafeInteger(studentId) ? await db.select({ role: usersTable.role, isManager: usersTable.isManager, managerLevel: usersTable.managerLevel }).from(usersTable).where(eq(usersTable.id, studentId)) : [];
  const studentClasses = await db.select({ teacherId: classesTable.teacherId }).from(attendanceTable)
    .innerJoin(classesTable, eq(attendanceTable.classId, classesTable.id)).where(eq(attendanceTable.studentId, studentId));
  const isAssignedTeacher = studentClasses.some(row => Number(row.teacherId) === req.currentUser!.id);
  const inAuthority = req.currentUser!.id === studentId || isOwnerRole(req.currentUser!.role) || isAssignedTeacher || Boolean(target && canModerateUser(req.currentUser!, target));
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
  const classId = Number(req.params.classId);
  if (!Number.isSafeInteger(classId) || classId <= 0) { res.status(400).json({ error: "Invalid class." }); return; }
  const [classRow] = await db.select({ id: classesTable.id, status: classesTable.status }).from(classesTable).where(eq(classesTable.id, classId));
  if (!classRow) { res.status(404).json({ error: "Class not found." }); return; }
  if (String(classRow.status).toLowerCase() === "cancelled") { res.status(409).json({ error: "This class is cancelled and cannot accept attendance." }); return; }
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
  const id = Number(req.params.id);
  if (!status || !Number.isInteger(id)) { res.status(400).json({ error: "status must be present or absent" }); return; }
  const [existing] = await db.select({ studentId: attendanceTable.studentId, classId: attendanceTable.classId }).from(attendanceTable).where(eq(attendanceTable.id, id));
  if (!existing) { res.status(404).json({ error: "Attendance record not found" }); return; }
  const [target] = await db.select({ role: usersTable.role, isManager: usersTable.isManager, managerLevel: usersTable.managerLevel }).from(usersTable).where(eq(usersTable.id, existing.studentId));
  const [classRow] = await db.select({ teacherId: classesTable.teacherId }).from(classesTable).where(eq(classesTable.id, existing.classId));
  if (target && isOwnerRole(target.role) && !isOwnerRole(user.role)) { res.status(404).json({ error: "Attendance record not found" }); return; }
  if (!canManageAcademicContent(user) || (!isOwnerRole(user.role) && Number(classRow?.teacherId) !== user.id && !(target && canModerateUser(user, target)))) {
    res.status(403).json({ error: "You are not authorized to edit this class attendance record." }); return;
  }
  const [row] = await db.update(attendanceTable).set({ status }).where(eq(attendanceTable.id, id)).returning();
  await db.insert(auditLogsTable).values({ action: `Marked attendance ${status} for ${row.studentName}`, category: "attendance", performedBy: user.id, targetType: "attendance", targetId: row.id, details: JSON.stringify({ studentId: row.studentId, studentName: row.studentName, status }) });
  res.json(row);
});

router.put("/:id/leave", requireAuth, requireManagerPermissionIfManager("attendance.edit"), async (req, res): Promise<void> => {
  const leftAt = new Date();
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid attendance record." }); return; }
  const [row] = await db.select().from(attendanceTable).where(eq(attendanceTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const actor = req.currentUser!;
  const [target] = await db.select({ role: usersTable.role, isManager: usersTable.isManager, managerLevel: usersTable.managerLevel }).from(usersTable).where(eq(usersTable.id, row.studentId));
  const [classRow] = await db.select({ teacherId: classesTable.teacherId }).from(classesTable).where(eq(classesTable.id, row.classId));
  if (target && isOwnerRole(target.role) && !isOwnerRole(actor.role)) { res.status(404).json({ error: "Not found" }); return; }
  const isOwnSession = row.studentId === actor.id;
  const canCloseClassSession = canManageAcademicContent(actor) && (isOwnerRole(actor.role) || Number(classRow?.teacherId) === actor.id || Boolean(target && canModerateUser(actor, target)));
  if (!isOwnSession && !canCloseClassSession) { res.status(403).json({ error: "You cannot close another user attendance session." }); return; }
  const durationMs = leftAt.getTime() - new Date(row.joinedAt).getTime();
  const durationMinutes = Math.round(durationMs / 60000);
  const [updated] = await db.update(attendanceTable)
    .set({ leftAt, durationMinutes }).where(eq(attendanceTable.id, id)).returning();
  res.json(updated);
});

router.get("/stats", requireAuth, requireManagerPermissionIfManager("attendance.view"), async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!canManageAcademicContent(user)) { res.status(403).json({ error: "Forbidden" }); return; }
  const rows = await db.select({ classId: attendanceTable.classId, studentId: attendanceTable.studentId, durationMinutes: attendanceTable.durationMinutes, role: usersTable.role, isManager: usersTable.isManager, managerLevel: usersTable.managerLevel, teacherId: classesTable.teacherId }).from(attendanceTable).innerJoin(usersTable, eq(attendanceTable.studentId, usersTable.id)).innerJoin(classesTable,eq(attendanceTable.classId,classesTable.id));
  const teacherRows=await db.select({id:usersTable.id,role:usersTable.role,isManager:usersTable.isManager,managerLevel:usersTable.managerLevel}).from(usersTable);
  const teacherById=new Map(teacherRows.map(row=>[row.id,row]));
  const scopedRows = isOwnerRole(user.role) ? rows : rows.filter(row => {
    const studentAllowed=Number(row.studentId)===user.id||Number(row.teacherId)===user.id||canModerateUser(user,row);
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
