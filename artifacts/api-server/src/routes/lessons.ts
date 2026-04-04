// Lessons routes — CRUD for educational content
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, lessonsTable, activityLogTable } from "@workspace/db";
import {
  CreateLessonBody,
  GetLessonParams,
  UpdateLessonParams,
  UpdateLessonBody,
  DeleteLessonParams,
} from "@workspace/api-zod";
import { requireAuth, requireTeacherOrOwner } from "../lib/auth-middleware";

const router: IRouter = Router();

// GET /lessons — List all lessons
router.get("/lessons", requireAuth, async (_req, res): Promise<void> => {
  const lessons = await db.select().from(lessonsTable).orderBy(lessonsTable.createdAt);
  res.json(lessons.map(l => ({ ...l, createdAt: l.createdAt.toISOString() })));
});

// POST /lessons — Create lesson (teacher, prefect student, or owner)
router.post("/lessons", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;
  // Allow teachers, owners, and prefect students to upload lessons
  if (currentUser.role === "student" && !currentUser.isPrefect) {
    res.status(403).json({ error: "Only teachers, owners, or prefect students can upload lessons" });
    return;
  }

  const parsed = CreateLessonBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [lesson] = await db.insert(lessonsTable).values({
    ...parsed.data,
    teacherId: currentUser.id,
    teacherName: currentUser.name,
  }).returning();

  // Log activity
  await db.insert(activityLogTable).values({
    type: "lesson_added",
    description: `New lesson "${lesson.title}" added for ${lesson.subject}`,
    actorName: currentUser.name,
  });

  res.status(201).json({ ...lesson, createdAt: lesson.createdAt.toISOString() });
});

// GET /lessons/:id — Get lesson by ID
router.get("/lessons/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetLessonParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [lesson] = await db.select().from(lessonsTable).where(eq(lessonsTable.id, params.data.id));
  if (!lesson) {
    res.status(404).json({ error: "Lesson not found" });
    return;
  }

  res.json({ ...lesson, createdAt: lesson.createdAt.toISOString() });
});

// PATCH /lessons/:id — Update lesson
router.patch("/lessons/:id", requireAuth, requireTeacherOrOwner, async (req, res): Promise<void> => {
  const params = UpdateLessonParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateLessonBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (body.data.title != null) updates.title = body.data.title;
  if (body.data.description != null) updates.description = body.data.description;
  if (body.data.subject != null) updates.subject = body.data.subject;
  if (body.data.grade != null) updates.grade = body.data.grade;
  if (body.data.type != null) updates.type = body.data.type;
  if (body.data.mediaUrl != null) updates.mediaUrl = body.data.mediaUrl;
  if (body.data.content != null) updates.content = body.data.content;

  const [lesson] = await db.update(lessonsTable)
    .set(updates)
    .where(eq(lessonsTable.id, params.data.id))
    .returning();

  if (!lesson) {
    res.status(404).json({ error: "Lesson not found" });
    return;
  }

  res.json({ ...lesson, createdAt: lesson.createdAt.toISOString() });
});

// DELETE /lessons/:id — Delete lesson
router.delete("/lessons/:id", requireAuth, requireTeacherOrOwner, async (req, res): Promise<void> => {
  const params = DeleteLessonParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(lessonsTable).where(eq(lessonsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
