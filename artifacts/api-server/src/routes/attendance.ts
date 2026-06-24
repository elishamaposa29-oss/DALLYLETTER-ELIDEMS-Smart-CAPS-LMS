import { Router } from "express";
import { db } from "@workspace/db";
import { attendanceTable, usersTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";

const router = Router();

router.get("/class/:classId", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(attendanceTable)
    .where(eq(attendanceTable.classId, parseInt(String(req.params.classId))))
    .orderBy(desc(attendanceTable.joinedAt));
  res.json(rows);
});

router.get("/my", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const rows = await db.select().from(attendanceTable)
    .where(eq(attendanceTable.studentId, user.id))
    .orderBy(desc(attendanceTable.joinedAt));
  res.json(rows);
});

router.get("/student/:studentId", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const studentId = parseInt(String(req.params.studentId));
  if (user.role === "student" && user.id !== studentId) { res.status(403).json({ error: "Forbidden" }); return; }
  const rows = await db.select().from(attendanceTable)
    .where(eq(attendanceTable.studentId, studentId))
    .orderBy(desc(attendanceTable.joinedAt));
  res.json(rows);
});

router.post("/join/:classId", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  if (user.role !== "student") { res.status(403).json({ error: "Students only" }); return; }
  const classId = parseInt(String(req.params.classId));
  const existing = await db.select().from(attendanceTable)
    .where(and(eq(attendanceTable.classId, classId), eq(attendanceTable.studentId, user.id)));
  if (existing.length > 0) { res.json(existing[0]); return; }
  const [row] = await db.insert(attendanceTable).values({
    classId, studentId: user.id, studentName: user.name, status: "present",
  }).returning();
  await db.update(usersTable).set({ lastActiveDate: new Date().toISOString().split("T")[0] }).where(eq(usersTable.id, user.id));
  res.status(201).json(row);
});

router.put("/:id/leave", requireAuth, async (req, res): Promise<void> => {
  const leftAt = new Date();
  const [row] = await db.select().from(attendanceTable).where(eq(attendanceTable.id, parseInt(String(req.params.id))));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const durationMs = leftAt.getTime() - new Date(row.joinedAt).getTime();
  const durationMinutes = Math.round(durationMs / 60000);
  const [updated] = await db.update(attendanceTable)
    .set({ leftAt, durationMinutes }).where(eq(attendanceTable.id, parseInt(String(req.params.id)))).returning();
  res.json(updated);
});

router.get("/stats", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  if (user.role !== "owner" && !user.isManager && user.role !== "teacher") { res.status(403).json({ error: "Forbidden" }); return; }
  const rows = await db.select().from(attendanceTable);
  const totalSessions = new Set(rows.map((r: any) => r.classId)).size;
  const totalAttendances = rows.length;
  const uniqueStudents = new Set(rows.map((r: any) => r.studentId)).size;
  const withDuration = rows.filter((r: any) => r.durationMinutes);
  const avgDuration = withDuration.length > 0 ? withDuration.reduce((s: number, r: any) => s + r.durationMinutes, 0) / withDuration.length : 0;
  res.json({ totalSessions, totalAttendances, uniqueStudents, avgDuration: Math.round(avgDuration) });
});

export default router;
