import { Router, type IRouter } from "express";
import multer from "multer";
import { and, eq, inArray, like } from "drizzle-orm";
import { db, handRaisesTable, activityLogTable, classesTable } from "@workspace/db";
import { RaiseHandBody, ListHandRaisesQueryParams } from "@workspace/api-zod";
import { requireAuth, isOwnerRole } from "../lib/auth-middleware";
import { createMediaStorageKey, ensureMediaDirectory, getMediaDirectory, isAllowedMediaType, MAX_MEDIA_SIZE_BYTES, persistUploadedMedia, removeStoredMedia } from "../lib/media-storage";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const handRaiseUpload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, callback) => {
      try { await ensureMediaDirectory(); callback(null, getMediaDirectory()); }
      catch (error) { callback(error as Error, ""); }
    },
    filename: (_req, _file, callback) => callback(null, createMediaStorageKey()),
  }),
  limits: { fileSize: MAX_MEDIA_SIZE_BYTES },
  fileFilter: (_req, file, callback) => callback(null, isAllowedMediaType(file.mimetype)),
});

// POST /raise-hand — Raise hand in a class
router.post("/raise-hand", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;
  const parsed = RaiseHandBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  if (parsed.data.mediaUrl) { res.status(400).json({ error: "Attachments must be uploaded through /raise-hand/with-media" }); return; }
  const mediaUrl = null;
  const [handRaise] = await db.insert(handRaisesTable).values({
    studentId: currentUser.id,
    studentName: currentUser.name,
    classId: parsed.data.classId,
    question: parsed.data.question ?? null,
    mediaUrl,
    isResolved: false,
  }).returning();

  await db.insert(activityLogTable).values({
    type: "hand_raised",
    description: `${currentUser.name} raised a hand in class`,
    actorName: currentUser.name,
  });

  res.status(201).json({ ...handRaise, createdAt: handRaise.createdAt.toISOString() });
});

// POST /raise-hand/with-media — atomically upload a supported attachment and create the hand raise.
router.post("/raise-hand/with-media", requireAuth, (req, res): void => {
  if (req.currentUser?.role !== "student") { res.status(403).json({ error: "Student access required" }); return; }
  handRaiseUpload.single("file")(req, res, (uploadError) => {
    if (uploadError || !req.file) { res.status(400).json({ error: "A supported attachment up to the configured storage limit is required" }); return; }
    void (async () => {
      const user = req.currentUser!;
      const classId = Number(req.body?.classId);
      const question = typeof req.body?.question === "string" ? req.body.question.slice(0, 5000) : "";
      const key = req.file!.filename;
      try {
        await persistUploadedMedia(key, req.file!.mimetype, req.file!.path);
        const mediaUrl = "/api/lessons/media/" + key + "?type=" + encodeURIComponent(req.file!.mimetype);
        const [handRaise] = await db.insert(handRaisesTable).values({
          studentId: user.id, studentName: user.name, classId, question: question || null, mediaUrl, mediaOwned: true, isResolved: false,
        }).returning();
        await db.insert(activityLogTable).values({ type: "hand_raised", description: user.name + " raised a hand with an attachment", actorName: user.name });
        res.status(201).json({ ...handRaise, createdAt: handRaise.createdAt.toISOString() });
      } catch (error) {
        await removeStoredMedia(key).catch(() => undefined);
        logger.warn({ error: error instanceof Error ? error.message.slice(0, 300) : "unknown" }, "Hand-raise media creation failed");
        res.status(503).json({ error: "Could not save the hand raise and its attachment. Please retry." });
      }
    })();
  });
});
// GET /raise-hand — list only hand raises the current role may view
router.get("/raise-hand", requireAuth, async (req, res): Promise<void> => {
  const queryParams = ListHandRaisesQueryParams.safeParse(req.query);
  if (!queryParams.success) { res.status(400).json({ error: queryParams.error.message }); return; }
  const user = req.currentUser!;
  const classId = queryParams.data.classId;
  let rows: (typeof handRaisesTable.$inferSelect)[];
  if (user.role === "owner" || (user.isManager === true && user.managerLevel === "senior")) {
    rows = classId == null
      ? await db.select().from(handRaisesTable).orderBy(handRaisesTable.createdAt)
      : await db.select().from(handRaisesTable).where(eq(handRaisesTable.classId, classId)).orderBy(handRaisesTable.createdAt);
  } else if (user.role === "teacher") {
    const ownedClasses = await db.select({ id: classesTable.id }).from(classesTable).where(eq(classesTable.teacherId, user.id));
    const classIds = ownedClasses.map(item => item.id);
    if (classId != null && !classIds.includes(classId)) { res.status(403).json({ error: "You can only monitor hand raises in your own classes." }); return; }
    if (!classIds.length) { res.json([]); return; }
    rows = classId == null
      ? await db.select().from(handRaisesTable).where(inArray(handRaisesTable.classId, classIds)).orderBy(handRaisesTable.createdAt)
      : await db.select().from(handRaisesTable).where(and(inArray(handRaisesTable.classId, classIds), eq(handRaisesTable.classId, classId))).orderBy(handRaisesTable.createdAt);
  } else if (user.role === "student") {
    rows = classId == null
      ? await db.select().from(handRaisesTable).where(eq(handRaisesTable.studentId, user.id)).orderBy(handRaisesTable.createdAt)
      : await db.select().from(handRaisesTable).where(and(eq(handRaisesTable.studentId, user.id), eq(handRaisesTable.classId, classId))).orderBy(handRaisesTable.createdAt);
  } else {
    res.status(403).json({ error: "Hand-raise access is not available for this role." }); return;
  }
  res.json(rows.map(h => ({ ...h, createdAt: h.createdAt.toISOString() })));
});

// DELETE /raise-hand/:id — remove a hand raise and clean up its attached media.
router.delete("/raise-hand/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
  const user = req.currentUser!;
  const [existing] = await db.select().from(handRaisesTable).where(eq(handRaisesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  let allowed = existing.studentId === user.id || isOwnerRole(user.role) || (user.isManager === true && user.managerLevel === "senior");
  if (!allowed && user.role === "teacher") {
    const [ownedClass] = await db.select({ id: classesTable.id }).from(classesTable)
      .where(and(eq(classesTable.id, existing.classId), eq(classesTable.teacherId, user.id)));
    allowed = Boolean(ownedClass);
  }
  if (!allowed) { res.status(403).json({ error: "Not authorised to delete this hand raise." }); return; }
  await db.delete(handRaisesTable).where(eq(handRaisesTable.id, id));
  const storageKey = existing.mediaOwned ? existing.mediaUrl?.match(/\/api\/(?:lessons|messages)\/media\/([a-f0-9-]{36})/i)?.[1] : null;
  if (storageKey) {
    try { await removeStoredMedia(storageKey); }
    catch { res.status(200).json({ ok: true, warning: "Hand raise deleted, but media cleanup needs attention." }); return; }
  }
  res.json({ ok: true });
});
// PATCH /raise-hand/:id/resolve — lower own hand or resolve a hand in a managed class
router.patch("/raise-hand/:id/resolve", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
  const user = req.currentUser!;
  const [existing] = await db.select().from(handRaisesTable).where(eq(handRaisesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  let allowed = existing.studentId === user.id;
  if (!allowed && (user.role === "owner" || (user.isManager === true && user.managerLevel === "senior"))) allowed = true;
  if (!allowed && user.role === "teacher") {
    const [ownedClass] = await db.select({ id: classesTable.id }).from(classesTable)
      .where(and(eq(classesTable.id, existing.classId), eq(classesTable.teacherId, user.id)));
    allowed = Boolean(ownedClass);
  }
  if (!allowed) { res.status(403).json({ error: "Not authorised to lower this hand." }); return; }
  const [updated] = await db.update(handRaisesTable).set({ isResolved: true }).where(eq(handRaisesTable.id, id)).returning();
  const storageKey = existing.mediaOwned ? existing.mediaUrl?.match(/\/api\/(?:lessons|messages)\/media\/([a-f0-9-]{36})/i)?.[1] : null;
  if (storageKey) {
    try {
      await removeStoredMedia(storageKey);
      const [cleaned] = await db.update(handRaisesTable).set({ mediaUrl: null, mediaOwned: false }).where(eq(handRaisesTable.id, id)).returning();
      res.json({ ...cleaned, createdAt: cleaned.createdAt.toISOString() });
    } catch {
      res.status(200).json({ ...updated, createdAt: updated.createdAt.toISOString(), warning: "Hand resolved, but attachment cleanup needs attention." });
    }
    return;
  }
  res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
});

export default router;
