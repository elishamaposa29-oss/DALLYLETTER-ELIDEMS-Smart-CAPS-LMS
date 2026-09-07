// Lessons routes — CRUD for educational content
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { createReadStream } from "node:fs";
import multer from "multer";
import { db, lessonsTable, activityLogTable } from "@workspace/db";
import {
  CreateLessonBody,
  GetLessonParams,
  UpdateLessonParams,
  UpdateLessonBody,
  DeleteLessonParams,
} from "@workspace/api-zod";
import { requireAuth, requireTeacherOrOwner } from "../lib/auth-middleware";
import {
  createMediaStorageKey,
  ensureMediaDirectory,
  getMediaDirectory,
  getMediaPath,
  getMediaStats,
  isAllowedMediaType,
  MAX_MEDIA_SIZE_BYTES,
} from "../lib/media-storage";

const router: IRouter = Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, callback) => {
      try {
        await ensureMediaDirectory();
        callback(null, getMediaDirectory());
      } catch (error) {
        callback(error as Error, "");
      }
    },
    filename: (_req, _file, callback) => callback(null, createMediaStorageKey()),
  }),
  limits: { fileSize: MAX_MEDIA_SIZE_BYTES },
  fileFilter: (_req, file, callback) => callback(null, isAllowedMediaType(file.mimetype)),
});

function normalizeYouTubeUrl(value: string): string {
  try {
    const url = new URL(value);
    let videoId: string | null = null;
    if (url.hostname === "youtu.be") videoId = url.pathname.slice(1).split("/")[0] || null;
    if (url.hostname.endsWith("youtube.com")) {
      videoId = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:embed\/|shorts\/|live\/)([\w-]+)/)?.[1] ?? null;
    }
    return videoId && /^[\w-]{11}$/.test(videoId) ? `https://www.youtube.com/embed/${videoId}` : value;
  } catch {
    return value;
  }
}

router.post("/lessons/media", requireAuth, requireTeacherOrOwner, upload.single("file"), (req, res): void => {
  if (!req.file) {
    res.status(400).json({ error: "A supported media file is required" });
    return;
  }

  res.status(201).json({
    mediaUrl: `/api/lessons/media/${req.file.filename}?type=${encodeURIComponent(req.file.mimetype)}`,
    storageKey: req.file.filename,
    mimeType: req.file.mimetype,
    size: req.file.size,
  });
});

router.get("/lessons/media/:storageKey", requireAuth, async (req, res): Promise<void> => {
  const storageKey = typeof req.params.storageKey === "string" ? req.params.storageKey : null;
  if (!storageKey) {
    res.status(400).json({ error: "Invalid media key" });
    return;
  }

  try {
    const mediaStats = await getMediaStats(storageKey);
    const mediaType = typeof req.query.type === "string" && isAllowedMediaType(req.query.type)
      ? req.query.type
      : "application/octet-stream";
    res.setHeader("Content-Type", mediaType);
    const range = req.headers.range;
    if (!range) {
      res.setHeader("Content-Length", mediaStats.size);
      createReadStream(getMediaPath(storageKey)).pipe(res);
      return;
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      res.status(416).end();
      return;
    }
    const start = match[1] ? Number(match[1]) : Math.max(mediaStats.size - Number(match[2]), 0);
    const end = match[2] ? Number(match[2]) : mediaStats.size - 1;
    if (start > end || start >= mediaStats.size) {
      res.status(416).end();
      return;
    }
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${mediaStats.size}`);
    res.setHeader("Content-Length", end - start + 1);
    res.setHeader("Accept-Ranges", "bytes");
    createReadStream(getMediaPath(storageKey), { start, end }).pipe(res);
  } catch {
    res.status(404).json({ error: "Media not found" });
  }
});

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
    mediaUrl: parsed.data.mediaUrl ? normalizeYouTubeUrl(parsed.data.mediaUrl) : parsed.data.mediaUrl,
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
