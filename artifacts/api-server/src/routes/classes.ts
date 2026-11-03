// Live classes routes — manage Google Meet classes
import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, pool, classesTable, handRaisesTable, attendanceTable, activityLogTable, usersTable } from "@workspace/db";
import {
  CreateClassBody,
  GetClassParams,
  UpdateClassParams,
  UpdateClassBody,
  DeleteClassParams,
} from "@workspace/api-zod";
import { requireAuth, requireTeacherOrOwner, canAccessManager, isOwnerRole } from "../lib/auth-middleware";
import { requireManagerPermissionIfManager } from "../lib/manager-permission-policy";
import { canModerateUser } from "../lib/role-access";
import { removeStoredMedia } from "../lib/media-storage";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// GET /classes — List all live classes
router.get("/classes", requireAuth, requireManagerPermissionIfManager("classes.manage"), async (req, res): Promise<void> => {
  let classes = await db.select().from(classesTable).orderBy(classesTable.createdAt);
  const actor = req.currentUser!;
  if (canAccessManager(actor) && !isOwnerRole(actor.role)) {
    const teacherIds = [...new Set(classes.map(item => item.teacherId))];
    const targets = teacherIds.length ? await db.select({ id: usersTable.id, role: usersTable.role, isManager: usersTable.isManager, managerLevel: usersTable.managerLevel }).from(usersTable).where(inArray(usersTable.id, teacherIds)) : [];
    const targetById = new Map(targets.map(target => [target.id, target]));
    classes = classes.filter(item => item.teacherId === actor.id || Boolean(targetById.get(item.teacherId) && canModerateUser(actor, targetById.get(item.teacherId)!)));
  }
  const role = String(req.currentUser!.role).toLowerCase();
  let preferred = new Set<string>();
  if (["student", "learner", "prefect"].includes(role)) {
    const result = await pool.query("SELECT subjects FROM learner_subjects WHERE user_id = $1", [req.currentUser!.id]).catch(() => ({ rows: [] as Array<{ subjects: string[] }> }));
    const selected = result.rows[0]?.subjects;
    if (Array.isArray(selected)) preferred = new Set(selected.map((v: unknown) => String(v).trim().toLowerCase()));
  }
  const ordered = [...classes].sort((a, b) => {
    const aPreferred = preferred.has(String(a.subject || "").trim().toLowerCase());
    const bPreferred = preferred.has(String(b.subject || "").trim().toLowerCase());
    return Number(bPreferred) - Number(aPreferred) || b.createdAt.getTime() - a.createdAt.getTime();
  });
  res.json(ordered.map(c => ({ ...c, createdAt: c.createdAt.toISOString() })));
});

// POST /classes — Create a live class (teacher/owner only)
router.post("/classes", requireAuth, requireManagerPermissionIfManager("classes.manage"), requireTeacherOrOwner, async (req, res): Promise<void> => {
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
router.get("/classes/:id", requireAuth, requireManagerPermissionIfManager("classes.manage"), async (req, res): Promise<void> => {
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
  const actor = req.currentUser!;
  if (canAccessManager(actor) && !isOwnerRole(actor.role) && actor.id !== cls.teacherId) {
    const [target] = await db.select({ role: usersTable.role, isManager: usersTable.isManager, managerLevel: usersTable.managerLevel }).from(usersTable).where(eq(usersTable.id, cls.teacherId));
    if (!target || !canModerateUser(actor, target)) { res.status(404).json({ error: "Class not found" }); return; }
  }

  res.json({ ...cls, createdAt: cls.createdAt.toISOString() });
});

// PATCH /classes/:id — Update class
router.patch("/classes/:id", requireAuth, requireManagerPermissionIfManager("classes.manage"), requireTeacherOrOwner, async (req, res): Promise<void> => {
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
  const [existing] = await db.select({ teacherId: classesTable.teacherId }).from(classesTable).where(eq(classesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Class not found." }); return; }
  const actor = req.currentUser!;
  if (canAccessManager(actor) && !isOwnerRole(actor.role) && actor.id !== existing.teacherId) {
    const [target] = await db.select({ role: usersTable.role, isManager: usersTable.isManager, managerLevel: usersTable.managerLevel }).from(usersTable).where(eq(usersTable.id, existing.teacherId));
    if (!target || !canModerateUser(actor, target)) { res.status(404).json({ error: "Class not found." }); return; }
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
router.delete("/classes/:id", requireAuth, requireManagerPermissionIfManager("classes.manage"), requireTeacherOrOwner, async (req, res): Promise<void> => {
  const params = DeleteClassParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db.select({ teacherId: classesTable.teacherId }).from(classesTable).where(eq(classesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Class not found." }); return; }
  const actor = req.currentUser!;
  if (canAccessManager(actor) && !isOwnerRole(actor.role) && actor.id !== existing.teacherId) {
    const [target] = await db.select({ role: usersTable.role, isManager: usersTable.isManager, managerLevel: usersTable.managerLevel }).from(usersTable).where(eq(usersTable.id, existing.teacherId));
    if (!target || !canModerateUser(actor, target)) { res.status(404).json({ error: "Class not found." }); return; }
  }

  // Only clean up attachments that this application created for a hand raise.
  // Older rows and caller-supplied URLs are never treated as owned objects.
  const handRaises = await db.select({ mediaUrl: handRaisesTable.mediaUrl, mediaOwned: handRaisesTable.mediaOwned })
    .from(handRaisesTable).where(eq(handRaisesTable.classId, params.data.id));
  await db.transaction(async (tx) => {
    // These records are scoped to the class and their foreign keys do not
    // currently cascade. Delete them in the same transaction so the class
    // deletion cannot fail with a foreign-key violation.
    await tx.delete(handRaisesTable).where(eq(handRaisesTable.classId, params.data.id));
    await tx.delete(attendanceTable).where(eq(attendanceTable.classId, params.data.id));
    await tx.delete(classesTable).where(eq(classesTable.id, params.data.id));
  });
  const ownedKeys = new Set(handRaises.filter(row => row.mediaOwned).map(row =>
    row.mediaUrl?.match(/\/api\/(?:lessons|messages)\/media\/([a-f0-9-]{36})/i)?.[1]
  ).filter((key): key is string => Boolean(key)));
  const failedCleanup: string[] = [];
  for (const key of ownedKeys) {
    try { await removeStoredMedia(key); } catch { failedCleanup.push(key); }
  }
  if (failedCleanup.length) logger.warn({ classId: params.data.id, failedMediaCount: failedCleanup.length }, "Class deleted; some owned hand-raise attachments need cleanup");
  res.sendStatus(204);
});

export default router;
