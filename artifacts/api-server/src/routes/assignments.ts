import { Router } from "express";
import multer from "multer";
import { db, notificationsTable, auditLogsTable } from "@workspace/db";
import { assignmentsTable, assignmentSubmissionsTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { canManageAcademicContent, isOwnerRole, requireAuth } from "../lib/auth-middleware";
import { getAIProvider } from "../lib/ai-provider";
import { createMediaStorageKey, ensureMediaDirectory, getMediaDirectory, isAllowedMediaType, MAX_MEDIA_SIZE_BYTES, persistUploadedMedia, removeStoredMedia } from "../lib/media-storage";

const router = Router();
const materialUpload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, callback) => {
      try { await ensureMediaDirectory(); callback(null, getMediaDirectory()); } catch (error) { callback(error as Error, ""); }
    },
    filename: (_req, _file, callback) => callback(null, createMediaStorageKey()),
  }),
  limits: { fileSize: MAX_MEDIA_SIZE_BYTES },
  fileFilter: (_req, file, callback) => callback(null, isAllowedMediaType(file.mimetype)),
});

function normalizeGrade(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function isVisibleToStudent(assignment: { status: string; grade: string | null }, grade: string | null): boolean {
  if (assignment.status !== "active") return false;
  if (assignment.grade == null || !grade) return true;
  const required = normalizeGrade(assignment.grade);
  const learner = normalizeGrade(grade);
  if (required === learner) return true;
  const requiredBase = required.split("/")[0].trim();
  const learnerBase = learner.split("/")[0].trim();
  return requiredBase === learnerBase;
}

function isValidDueDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function parseTotalMarks(value: unknown): number | null {
  const marks = typeof value === "number" ? value : Number(value);
  return Number.isInteger(marks) && marks > 0 && marks <= 10000 ? marks : null;
}

function normalizeAttachmentUrl(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > 2048) return null;

  if (value.startsWith("/api/lessons/media/")) {
    try {
      const url = new URL(value, "https://internal.invalid");
      return /^\/api\/lessons\/media\/[a-f0-9-]{36}$/i.test(url.pathname) && !url.hash
        ? value
        : null;
    } catch {
      return null;
    }
  }

  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

router.post("/material", requireAuth, (req, res): void => {
  if (!canManageAcademicContent(req.currentUser!)) { res.status(403).json({ error: "Academic staff access required" }); return; }
  materialUpload.single("file")(req, res, (error) => {
    if (error) { res.status(400).json({ error: "A supported material file up to 250 MB is required" }); return; }
    const file = req.file;
    if (!file) { res.status(400).json({ error: "A supported material file is required" }); return; }
    persistUploadedMedia(file.filename, file.mimetype, file.path).then(() => res.status(201).json({ attachmentUrl: `/api/lessons/media/${file.filename}?type=${encodeURIComponent(file.mimetype)}`, fileName: file.originalname, mimeType: file.mimetype, size: file.size })).catch(() => res.status(503).json({ error: "Persistent media storage is temporarily unavailable. Please retry the upload." }));
  });
});

router.post("/submission-material", requireAuth, (req, res): void => {
  if (req.currentUser?.role !== "student") { res.status(403).json({ error: "Student access required" }); return; }
  materialUpload.single("file")(req, res, (error) => {
    if (error) { res.status(400).json({ error: "A supported submission file up to 250 MB is required" }); return; }
    const file = req.file;
    if (!file) { res.status(400).json({ error: "A supported submission file is required" }); return; }
    persistUploadedMedia(file.filename, file.mimetype, file.path).then(() => res.status(201).json({ attachmentUrl: `/api/lessons/media/${file.filename}?type=${encodeURIComponent(file.mimetype)}`, fileName: file.originalname, mimeType: file.mimetype, size: file.size })).catch(() => res.status(503).json({ error: "Persistent media storage is temporarily unavailable. Please retry the upload." }));
  });
});

router.get("/", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role !== "student" && !canManageAcademicContent(user)) { res.status(403).json({ error: "Assignment access required" }); return; }
  let rows;
  if (canManageAcademicContent(user)) {
    // Staff may preview all assignments, but mutation endpoints below enforce ownership.
    rows = await db.select().from(assignmentsTable).orderBy(desc(assignmentsTable.createdAt));
  } else {
    const activeRows = await db.select().from(assignmentsTable)
      .where(eq(assignmentsTable.status, "active"))
      .orderBy(desc(assignmentsTable.createdAt));
    rows = activeRows.filter(row => isVisibleToStudent(row, user.grade ?? null));
  }
  res.json(rows);
});

router.get("/:id", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role !== "student" && !canManageAcademicContent(user)) { res.status(403).json({ error: "Assignment access required" }); return; }
  const [assignment] = await db.select().from(assignmentsTable).where(eq(assignmentsTable.id, parseInt(String(req.params.id))));
  if (!assignment) { res.status(404).json({ error: "Not found" }); return; }
  if (user.role === "student" && !isVisibleToStudent(assignment, user.grade)) { res.status(404).json({ error: "Not found" }); return; }
    const submissions = user.role === "student"
    ? await db.select().from(assignmentSubmissionsTable).where(and(eq(assignmentSubmissionsTable.assignmentId, assignment.id), eq(assignmentSubmissionsTable.studentId, user.id)))
    : await db.select().from(assignmentSubmissionsTable).where(eq(assignmentSubmissionsTable.assignmentId, assignment.id));
  res.json({ ...assignment, submissions });
});

router.post("/", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!canManageAcademicContent(user)) { res.status(403).json({ error: "Forbidden" }); return; }
  const { title, description, subject, grade, dueDate, totalMarks, attachmentUrl } = req.body;
  const parsedMarks = parseTotalMarks(totalMarks ?? 100);
  const normalizedAttachmentUrl = normalizeAttachmentUrl(attachmentUrl);
  if (attachmentUrl != null && normalizedAttachmentUrl == null) {
    res.status(400).json({ error: "attachmentUrl must be a valid http(s) URL" }); return;
  }
  if (typeof title !== "string" || !title.trim() || typeof subject !== "string" || !subject.trim() || !isValidDueDate(dueDate) || parsedMarks == null) {
    res.status(400).json({ error: "title, subject, valid dueDate, and totalMarks between 1 and 10000 are required" }); return;
  }
  const [row] = await db.insert(assignmentsTable).values({
    title: title.trim(), description, subject: subject.trim(), grade: typeof grade === "string" && grade.trim() ? grade.trim() : null, dueDate, totalMarks: parsedMarks,
    teacherId: user.id, teacherName: user.name, attachmentUrl: normalizedAttachmentUrl,
  }).returning();
  res.status(201).json(row);
});

router.put("/:id", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!canManageAcademicContent(user)) { res.status(403).json({ error: "Forbidden" }); return; }
  const assignmentId = parseInt(String(req.params.id));
  const [existing] = await db.select({ teacherId: assignmentsTable.teacherId, attachmentUrl: assignmentsTable.attachmentUrl }).from(assignmentsTable).where(eq(assignmentsTable.id, assignmentId));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!isOwnerRole(user.role) && !user.isManager && existing.teacherId !== user.id) { res.status(403).json({ error: "You can only edit your own assignments" }); return; }
  const { title, description, subject, grade, dueDate, totalMarks, status, attachmentUrl } = req.body;
  const parsedMarks = parseTotalMarks(totalMarks);
  const normalizedAttachmentUrl = normalizeAttachmentUrl(attachmentUrl);
  if (attachmentUrl != null && normalizedAttachmentUrl == null) {
    res.status(400).json({ error: "attachmentUrl must be a valid http(s) URL" }); return;
  }
  if (typeof title !== "string" || !title.trim() || typeof subject !== "string" || !subject.trim() || !isValidDueDate(dueDate) || parsedMarks == null || (status !== "active" && status !== "archived")) {
    res.status(400).json({ error: "title, subject, valid dueDate, status, and totalMarks between 1 and 10000 are required" }); return;
  }
  const [row] = await db.update(assignmentsTable).set({ title: title.trim(), description, subject: subject.trim(), grade: typeof grade === "string" && grade.trim() ? grade.trim() : null, dueDate, totalMarks: parsedMarks, status, attachmentUrl: normalizedAttachmentUrl })
    .where(eq(assignmentsTable.id, assignmentId)).returning();
  await db.insert(auditLogsTable).values({ action: `Updated assignment #${assignmentId}`, category: "academic", performedBy: user.id, targetType: "assignment", targetId: assignmentId });
  if (existing.teacherId !== user.id) {
    const [assignmentOwner] = await db.select({ teacherId: assignmentsTable.teacherId, title: assignmentsTable.title }).from(assignmentsTable).where(eq(assignmentsTable.id, assignmentId));
    if (assignmentOwner?.teacherId) await db.insert(notificationsTable).values({ recipientId: assignmentOwner.teacherId, title: "Assignment updated", message: `Your assignment "${assignmentOwner.title}" was updated by authorized management staff.`, type: "assignment_update", link: `/teacher/assignments` });
  }
  res.json(row);
});

router.delete("/:id", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!isOwnerRole(user.role) && !user.isManager) { res.status(403).json({ error: "Manager or owner access required" }); return; }
  const assignmentId = parseInt(String(req.params.id));
  if (!Number.isInteger(assignmentId)) { res.status(400).json({ error: "Invalid assignment id" }); return; }
  const [existing] = await db.select({ teacherId: assignmentsTable.teacherId, attachmentUrl: assignmentsTable.attachmentUrl }).from(assignmentsTable).where(eq(assignmentsTable.id, assignmentId));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(assignmentsTable).where(eq(assignmentsTable.id, assignmentId));
  const storageKey = typeof existing.attachmentUrl === "string" ? existing.attachmentUrl.match(/\/api\/lessons\/media\/([a-f0-9-]{36})/i)?.[1] : null;
  if (storageKey) await removeStoredMedia(storageKey);
  res.json({ ok: true });
});

router.get("/:id/submissions", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role !== "student" && !canManageAcademicContent(user)) { res.status(403).json({ error: "Assignment access required" }); return; }
  const assignmentId = parseInt(String(req.params.id));
  if (user.role === "student") {
    const [assignment] = await db.select({ status: assignmentsTable.status, grade: assignmentsTable.grade }).from(assignmentsTable).where(eq(assignmentsTable.id, assignmentId));
    if (!assignment || !isVisibleToStudent(assignment, user.grade)) { res.status(404).json({ error: "Not found" }); return; }
    const [sub] = await db.select().from(assignmentSubmissionsTable)
      .where(and(eq(assignmentSubmissionsTable.assignmentId, assignmentId), eq(assignmentSubmissionsTable.studentId, user.id)));
    res.json(sub ? [sub] : []); return;
  }
  const [assignment] = await db.select({ teacherId: assignmentsTable.teacherId }).from(assignmentsTable).where(eq(assignmentsTable.id, assignmentId));
  if (!assignment) { res.status(404).json({ error: "Not found" }); return; }
  const subs = await db.select().from(assignmentSubmissionsTable).where(eq(assignmentSubmissionsTable.assignmentId, assignmentId));
  res.json(subs);
});

router.post("/:id/submit", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role !== "student") { res.status(403).json({ error: "Forbidden" }); return; }
  const assignmentId = parseInt(String(req.params.id));
  const { content, fileUrl, fileName } = req.body;
  if (typeof content !== "string" || !content.trim() || content.length > 100000) { res.status(400).json({ error: "content is required and must be at most 100000 characters" }); return; }
  const normalizedFileUrl = normalizeAttachmentUrl(fileUrl);
  if (fileUrl != null && normalizedFileUrl == null) { res.status(400).json({ error: "fileUrl must be a valid internal media or http(s) URL" }); return; }
  const [assignment] = await db.select({ status: assignmentsTable.status, grade: assignmentsTable.grade, dueDate: assignmentsTable.dueDate }).from(assignmentsTable).where(eq(assignmentsTable.id, assignmentId));
  if (!assignment || !isVisibleToStudent(assignment, user.grade)) { res.status(404).json({ error: "Not found" }); return; }
  if (new Date(`${assignment.dueDate}T23:59:59Z`) < new Date()) { res.status(409).json({ error: "This assignment is past its due date" }); return; }
  const [existing] = await db.select().from(assignmentSubmissionsTable)
    .where(and(eq(assignmentSubmissionsTable.assignmentId, assignmentId), eq(assignmentSubmissionsTable.studentId, user.id)));
  if (existing) {
    const [updated] = await db.update(assignmentSubmissionsTable).set({ content, fileUrl: normalizedFileUrl, fileName, status: "submitted" })
      .where(eq(assignmentSubmissionsTable.id, existing.id)).returning();
    res.json(updated); return;
  }
  const [row] = await db.insert(assignmentSubmissionsTable).values({
    assignmentId, studentId: user.id, studentName: user.name, content: content.trim(), fileUrl: normalizedFileUrl, fileName,
  }).returning();
  res.status(201).json(row);
});

router.post("/submissions/:subId/ai-grade", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!canManageAcademicContent(user)) { res.status(403).json({ error: "Academic staff access required" }); return; }
  const submissionId = parseInt(String(req.params.subId));
  const [row] = await db.select({
    submission: assignmentSubmissionsTable,
    assignment: assignmentsTable,
  }).from(assignmentSubmissionsTable).innerJoin(assignmentsTable, eq(assignmentSubmissionsTable.assignmentId, assignmentsTable.id))
    .where(eq(assignmentSubmissionsTable.id, submissionId));
  if (!row) { res.status(404).json({ error: "Submission not found" }); return; }
  if (!isOwnerRole(user.role) && !user.isManager && row.assignment.teacherId !== user.id) {
    res.status(403).json({ error: "You can only mark your own assignments" }); return;
  }
  try {
    const ai = await getAIProvider();
    const result = await ai.analyzeData({
      assignment: { title: row.assignment.title, subject: row.assignment.subject, description: row.assignment.description, totalMarks: row.assignment.totalMarks },
      submission: { content: row.submission.content },
    }, `Mark this educational assignment fairly. Return ONLY JSON with numeric marks between 0 and the totalMarks and a concise teacher feedback string. Do not invent unanswered work. JSON format: {"marks":0,"feedback":"..."}`);
    const match = result.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI returned invalid marking data");
    const parsed = JSON.parse(match[0]) as { marks?: unknown; feedback?: unknown };
    const marks = Number(parsed.marks);
    if (!Number.isFinite(marks) || marks < 0 || marks > row.assignment.totalMarks) throw new Error("AI returned invalid marks");
    const feedback = typeof parsed.feedback === "string" ? parsed.feedback.slice(0, 5000) : "";
    const [updated] = await db.update(assignmentSubmissionsTable).set({
      marks: marks.toString(), feedback, status: "graded", gradedBy: user.id, gradedAt: new Date(),
    }).where(eq(assignmentSubmissionsTable.id, submissionId)).returning();
    res.json({ provider: ai.name, submission: updated });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "AI marking unavailable" });
  }
});

router.put("/submissions/:subId/grade", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!canManageAcademicContent(user)) { res.status(403).json({ error: "Forbidden" }); return; }
  const { marks, feedback } = req.body;
  const submissionId = parseInt(String(req.params.subId));
  const [submission] = await db.select({ teacherId: assignmentsTable.teacherId, totalMarks: assignmentsTable.totalMarks }).from(assignmentSubmissionsTable)
    .innerJoin(assignmentsTable, eq(assignmentSubmissionsTable.assignmentId, assignmentsTable.id))
    .where(eq(assignmentSubmissionsTable.id, submissionId));
  if (!submission) { res.status(404).json({ error: "Not found" }); return; }
  if (!isOwnerRole(user.role) && !user.isManager && submission.teacherId !== user.id) { res.status(403).json({ error: "You can only grade your own assignments" }); return; }
  const numericMarks = typeof marks === "number" ? marks : Number(marks);
  if (!Number.isFinite(numericMarks) || numericMarks < 0 || numericMarks > submission.totalMarks || (feedback != null && (typeof feedback !== "string" || feedback.length > 5000))) {
    res.status(400).json({ error: `marks must be between 0 and ${submission.totalMarks}; feedback must be at most 5000 characters` }); return;
  }
  const [row] = await db.update(assignmentSubmissionsTable)
    .set({ marks: numericMarks.toString(), feedback, status: "graded", gradedBy: user.id, gradedAt: new Date() })
    .where(eq(assignmentSubmissionsTable.id, submissionId)).returning();
  res.json(row);
});

export default router;
