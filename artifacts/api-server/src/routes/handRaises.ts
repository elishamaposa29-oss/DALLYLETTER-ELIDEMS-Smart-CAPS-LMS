import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, handRaisesTable, activityLogTable } from "@workspace/db";
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

// GET /raise-hand — List hand raises
router.get("/raise-hand", requireAuth, async (req, res): Promise<void> => {
  const queryParams = ListHandRaisesQueryParams.safeParse(req.query);
  if (!queryParams.success) { res.status(400).json({ error: queryParams.error.message }); return; }

  let handRaises;
  if (queryParams.data.classId != null) {
    handRaises = await db.select().from(handRaisesTable)
      .where(eq(handRaisesTable.classId, queryParams.data.classId))
      .orderBy(handRaisesTable.createdAt);
  } else {
    handRaises = await db.select().from(handRaisesTable).orderBy(handRaisesTable.createdAt);
  }

  res.json(handRaises.map(h => ({ ...h, createdAt: h.createdAt.toISOString() })));
});

// PATCH /raise-hand/:id/resolve — Lower/resolve a raised hand (student who raised OR teacher)
router.patch("/raise-hand/:id/resolve", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const currentUser = req.currentUser!;

  // Find the raise
  const [existing] = await db.select().from(handRaisesTable).where(eq(handRaisesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  // Only the student who raised OR a teacher/owner may resolve
  if (existing.studentId !== currentUser.id && currentUser.role !== "teacher" && currentUser.role !== "owner") {
    res.status(403).json({ error: "Not authorised to lower this hand" });
    return;
  }

  const [updated] = await db.update(handRaisesTable)
    .set({ isResolved: true })
    .where(eq(handRaisesTable.id, id))
    .returning();

  res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
});

export default router;
