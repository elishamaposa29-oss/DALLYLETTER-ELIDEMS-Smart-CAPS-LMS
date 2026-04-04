// Hand raises routes — students raise hands during live classes
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, handRaisesTable, activityLogTable } from "@workspace/db";
import {
  RaiseHandBody,
  ListHandRaisesQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth-middleware";

const router: IRouter = Router();

// POST /raise-hand — Raise hand in a class
router.post("/raise-hand", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;

  const parsed = RaiseHandBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

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

// GET /raise-hand — List hand raises for a class
router.get("/raise-hand", requireAuth, async (req, res): Promise<void> => {
  const queryParams = ListHandRaisesQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  let handRaises;
  if (queryParams.data.classId != null) {
    handRaises = await db.select().from(handRaisesTable)
      .where(eq(handRaisesTable.classId, queryParams.data.classId))
      .orderBy(handRaisesTable.createdAt);
  } else {
    handRaises = await db.select().from(handRaisesTable)
      .orderBy(handRaisesTable.createdAt);
  }

  res.json(handRaises.map(h => ({ ...h, createdAt: h.createdAt.toISOString() })));
});

export default router;
