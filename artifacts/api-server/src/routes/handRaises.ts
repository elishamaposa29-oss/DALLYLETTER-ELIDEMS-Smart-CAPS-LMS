import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db, handRaisesTable, activityLogTable, classesTable } from "@workspace/db";
import { RaiseHandBody, ListHandRaisesQueryParams } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth-middleware";

const router: IRouter = Router();

// POST /raise-hand — Raise hand in a class
router.post("/raise-hand", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;
  const parsed = RaiseHandBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [handRaise] = await db.insert(handRaisesTable).values({
    studentId: currentUser.id,
    studentName: currentUser.name,
    classId: parsed.data.classId,
    question: parsed.data.question ?? null,
    isResolved: false,
  }).returning();

  await db.insert(activityLogTable).values({
    type: "hand_raised",
    description: `${currentUser.name} raised a hand in class`,
    actorName: currentUser.name,
  });

  res.status(201).json({ ...handRaise, createdAt: handRaise.createdAt.toISOString() });
});

// GET /raise-hand — list only hand raises the current role may view
router.get("/raise-hand", requireAuth, async (req, res): Promise<void> => {
  const queryParams = ListHandRaisesQueryParams.safeParse(req.query);
  if (!queryParams.success) { res.status(400).json({ error: queryParams.error.message }); return; }
  const user = req.currentUser!;
  const classId = queryParams.data.classId;
  let rows;
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
  res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
});

export default router;
