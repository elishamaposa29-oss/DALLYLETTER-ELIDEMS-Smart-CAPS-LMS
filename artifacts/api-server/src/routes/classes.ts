// Live classes routes — manage Google Meet classes
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, classesTable, activityLogTable } from "@workspace/db";
import {
  CreateClassBody,
  GetClassParams,
  UpdateClassParams,
  UpdateClassBody,
  DeleteClassParams,
} from "@workspace/api-zod";
import { requireAuth, requireTeacherOrOwner } from "../lib/auth-middleware";

const router: IRouter = Router();

// GET /classes — List all live classes
router.get("/classes", requireAuth, async (_req, res): Promise<void> => {
  const classes = await db.select().from(classesTable).orderBy(classesTable.createdAt);
  res.json(classes.map(c => ({ ...c, createdAt: c.createdAt.toISOString() })));
});

// POST /classes — Create a live class (teacher/owner only)
router.post("/classes", requireAuth, requireTeacherOrOwner, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;

  const parsed = CreateClassBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [cls] = await db.insert(classesTable).values({
    ...parsed.data,
    teacherId: currentUser.id,
    teacherName: currentUser.name,
  }).returning();

  // Log activity
  await db.insert(activityLogTable).values({
    type: "class_scheduled",
    description: `Live class "${cls.title}" scheduled for ${cls.subject}`,
    actorName: currentUser.name,
  });

  res.status(201).json({ ...cls, createdAt: cls.createdAt.toISOString() });
});

// GET /classes/:id — Get class by ID
router.get("/classes/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetClassParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, params.data.id));
  if (!cls) {
    res.status(404).json({ error: "Class not found" });
    return;
  }

  res.json({ ...cls, createdAt: cls.createdAt.toISOString() });
});

// PATCH /classes/:id — Update class
router.patch("/classes/:id", requireAuth, requireTeacherOrOwner, async (req, res): Promise<void> => {
  const params = UpdateClassParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateClassBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (body.data.title != null) updates.title = body.data.title;
  if (body.data.description != null) updates.description = body.data.description;
  if (body.data.subject != null) updates.subject = body.data.subject;
  if (body.data.grade != null) updates.grade = body.data.grade;
  if (body.data.meetLink != null) updates.meetLink = body.data.meetLink;
  if (body.data.scheduledAt != null) updates.scheduledAt = body.data.scheduledAt;
  if (body.data.status != null) updates.status = body.data.status;

  const [cls] = await db.update(classesTable)
    .set(updates)
    .where(eq(classesTable.id, params.data.id))
    .returning();

  if (!cls) {
    res.status(404).json({ error: "Class not found" });
    return;
  }

  res.json({ ...cls, createdAt: cls.createdAt.toISOString() });
});

// DELETE /classes/:id — Delete class
router.delete("/classes/:id", requireAuth, requireTeacherOrOwner, async (req, res): Promise<void> => {
  const params = DeleteClassParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(classesTable).where(eq(classesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
