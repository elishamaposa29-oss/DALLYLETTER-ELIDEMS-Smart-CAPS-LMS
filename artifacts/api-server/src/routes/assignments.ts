import { Router } from "express";
import { db } from "@workspace/db";
import { assignmentsTable, assignmentSubmissionsTable, usersTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";

const router = Router();

router.get("/", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  let rows;
  if (user.role === "owner" || user.role === "teacher") {
    rows = await db.select().from(assignmentsTable).orderBy(desc(assignmentsTable.createdAt));
  } else {
    rows = await db.select().from(assignmentsTable)
      .where(eq(assignmentsTable.status, "active"))
      .orderBy(desc(assignmentsTable.createdAt));
  }
  res.json(rows);
});

router.get("/:id", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const [assignment] = await db.select().from(assignmentsTable).where(eq(assignmentsTable.id, parseInt(String(req.params.id))));
  if (!assignment) { res.status(404).json({ error: "Not found" }); return; }
  if (user.role === "student" && assignment.status !== "active") { res.status(404).json({ error: "Not found" }); return; }
    if (user.role === "teacher" && assignment.teacherId !== user.id) { res.status(403).json({ error: "You can only view your own assignments" }); return; }
  const submissions = user.role === "student"
    ? await db.select().from(assignmentSubmissionsTable).where(and(eq(assignmentSubmissionsTable.assignmentId, assignment.id), eq(assignmentSubmissionsTable.studentId, user.id)))
    : await db.select().from(assignmentSubmissionsTable).where(eq(assignmentSubmissionsTable.assignmentId, assignment.id));
  res.json({ ...assignment, submissions });
});

router.post("/", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role !== "teacher" && user.role !== "owner") { res.status(403).json({ error: "Forbidden" }); return; }
  const { title, description, subject, grade, dueDate, totalMarks, attachmentUrl } = req.body;
  if (!title || !subject || !dueDate) { res.status(400).json({ error: "title, subject, dueDate required" }); return; }
  const [row] = await db.insert(assignmentsTable).values({
    title, description, subject, grade, dueDate, totalMarks: totalMarks ?? 100,
    teacherId: user.id, teacherName: user.name, attachmentUrl,
  }).returning();
  res.status(201).json(row);
});

router.put("/:id", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role !== "teacher" && user.role !== "owner") { res.status(403).json({ error: "Forbidden" }); return; }
  const assignmentId = parseInt(String(req.params.id));
  const [existing] = await db.select({ teacherId: assignmentsTable.teacherId }).from(assignmentsTable).where(eq(assignmentsTable.id, assignmentId));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (user.role !== "owner" && existing.teacherId !== user.id) { res.status(403).json({ error: "You can only edit your own assignments" }); return; }
  const { title, description, dueDate, totalMarks, status } = req.body;
  const [row] = await db.update(assignmentsTable).set({ title, description, dueDate, totalMarks, status })
    .where(eq(assignmentsTable.id, assignmentId)).returning();
  res.json(row);
});

router.delete("/:id", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role !== "owner") { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(assignmentsTable).where(eq(assignmentsTable.id, parseInt(String(req.params.id))));
  res.json({ ok: true });
});

router.get("/:id/submissions", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const assignmentId = parseInt(String(req.params.id));
  if (user.role === "student") {
    const [assignment] = await db.select({ status: assignmentsTable.status }).from(assignmentsTable).where(eq(assignmentsTable.id, assignmentId));
    if (!assignment || assignment.status !== "active") { res.status(404).json({ error: "Not found" }); return; }
    const [sub] = await db.select().from(assignmentSubmissionsTable)
      .where(and(eq(assignmentSubmissionsTable.assignmentId, assignmentId), eq(assignmentSubmissionsTable.studentId, user.id)));
    res.json(sub ? [sub] : []); return;
  }
  const [assignment] = await db.select({ teacherId: assignmentsTable.teacherId }).from(assignmentsTable).where(eq(assignmentsTable.id, assignmentId));
  if (!assignment) { res.status(404).json({ error: "Not found" }); return; }
  if (user.role !== "owner" && (user.role !== "teacher" || assignment.teacherId !== user.id)) {
    res.status(403).json({ error: "You can only view submissions for your own assignments" });
    return;
  }
  const subs = await db.select().from(assignmentSubmissionsTable).where(eq(assignmentSubmissionsTable.assignmentId, assignmentId));
  res.json(subs);
});

router.post("/:id/submit", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role !== "student") { res.status(403).json({ error: "Forbidden" }); return; }
  const assignmentId = parseInt(String(req.params.id));
  const { content, fileUrl, fileName } = req.body;
    const [assignment] = await db.select({ status: assignmentsTable.status }).from(assignmentsTable).where(eq(assignmentsTable.id, assignmentId));
    if (!assignment || assignment.status !== "active") { res.status(404).json({ error: "Not found" }); return; }
  const [existing] = await db.select().from(assignmentSubmissionsTable)
    .where(and(eq(assignmentSubmissionsTable.assignmentId, assignmentId), eq(assignmentSubmissionsTable.studentId, user.id)));
  if (existing) {
    const [updated] = await db.update(assignmentSubmissionsTable).set({ content, fileUrl, fileName, status: "submitted" })
      .where(eq(assignmentSubmissionsTable.id, existing.id)).returning();
    res.json(updated); return;
  }
  const [row] = await db.insert(assignmentSubmissionsTable).values({
    assignmentId, studentId: user.id, studentName: user.name, content, fileUrl, fileName,
  }).returning();
  res.status(201).json(row);
});

router.put("/submissions/:subId/grade", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role !== "teacher" && user.role !== "owner") { res.status(403).json({ error: "Forbidden" }); return; }
  const { marks, feedback } = req.body;
  const submissionId = parseInt(String(req.params.subId));
  const [submission] = await db.select({ teacherId: assignmentsTable.teacherId }).from(assignmentSubmissionsTable)
    .innerJoin(assignmentsTable, eq(assignmentSubmissionsTable.assignmentId, assignmentsTable.id))
    .where(eq(assignmentSubmissionsTable.id, submissionId));
  if (!submission) { res.status(404).json({ error: "Not found" }); return; }
  if (user.role !== "owner" && submission.teacherId !== user.id) { res.status(403).json({ error: "You can only grade your own assignments" }); return; }
  const [row] = await db.update(assignmentSubmissionsTable)
    .set({ marks, feedback, status: "graded", gradedBy: user.id, gradedAt: new Date() })
    .where(eq(assignmentSubmissionsTable.id, submissionId)).returning();
  res.json(row);
});

export default router;
