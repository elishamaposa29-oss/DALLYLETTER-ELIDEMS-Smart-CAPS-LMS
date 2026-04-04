// Study groups routes — create, join, and manage study groups
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, studyGroupsTable, studyGroupMembersTable, usersTable, activityLogTable } from "@workspace/db";
import {
  CreateStudyGroupBody,
  GetStudyGroupParams,
  JoinStudyGroupParams,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth-middleware";

const router: IRouter = Router();

// Helper to get members of a study group
async function getGroupMembers(groupId: number) {
  const memberRows = await db.select({
    id: usersTable.id,
    email: usersTable.email,
    name: usersTable.name,
    role: usersTable.role,
    isPrefect: usersTable.isPrefect,
    isBlocked: usersTable.isBlocked,
    phone: usersTable.phone,
    grade: usersTable.grade,
    subject: usersTable.subject,
    avatarUrl: usersTable.avatarUrl,
    lastPaymentDate: usersTable.lastPaymentDate,
    createdAt: usersTable.createdAt,
  })
  .from(studyGroupMembersTable)
  .innerJoin(usersTable, eq(studyGroupMembersTable.userId, usersTable.id))
  .where(eq(studyGroupMembersTable.groupId, groupId));

  return memberRows.map(m => ({ ...m, createdAt: m.createdAt.toISOString() }));
}

// GET /study-groups — List all study groups
router.get("/study-groups", requireAuth, async (_req, res): Promise<void> => {
  const groups = await db.select().from(studyGroupsTable).orderBy(studyGroupsTable.createdAt);

  const result = await Promise.all(groups.map(async (g) => {
    const members = await getGroupMembers(g.id);
    return {
      ...g,
      memberCount: members.length,
      members,
      createdAt: g.createdAt.toISOString(),
    };
  }));

  res.json(result);
});

// POST /study-groups — Create a study group
router.post("/study-groups", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;

  const parsed = CreateStudyGroupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [group] = await db.insert(studyGroupsTable).values({
    ...parsed.data,
    creatorId: currentUser.id,
    creatorName: currentUser.name,
  }).returning();

  // Auto-join creator
  await db.insert(studyGroupMembersTable).values({
    groupId: group.id,
    userId: currentUser.id,
  });

  await db.insert(activityLogTable).values({
    type: "user_joined",
    description: `${currentUser.name} created study group "${group.name}"`,
    actorName: currentUser.name,
  });

  const members = await getGroupMembers(group.id);
  res.status(201).json({
    ...group,
    memberCount: members.length,
    members,
    createdAt: group.createdAt.toISOString(),
  });
});

// GET /study-groups/:id — Get study group by ID
router.get("/study-groups/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetStudyGroupParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [group] = await db.select().from(studyGroupsTable).where(eq(studyGroupsTable.id, params.data.id));
  if (!group) {
    res.status(404).json({ error: "Study group not found" });
    return;
  }

  const members = await getGroupMembers(group.id);
  res.json({
    ...group,
    memberCount: members.length,
    members,
    createdAt: group.createdAt.toISOString(),
  });
});

// POST /study-groups/:id/join — Join a study group
router.post("/study-groups/:id/join", requireAuth, async (req, res): Promise<void> => {
  const params = JoinStudyGroupParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const currentUser = req.currentUser!;
  const [group] = await db.select().from(studyGroupsTable).where(eq(studyGroupsTable.id, params.data.id));
  if (!group) {
    res.status(404).json({ error: "Study group not found" });
    return;
  }

  // Check if already a member
  const existing = await db.select().from(studyGroupMembersTable)
    .where(
      eq(studyGroupMembersTable.groupId, params.data.id)
    );
  const alreadyMember = existing.some(m => m.userId === currentUser.id);

  if (!alreadyMember) {
    await db.insert(studyGroupMembersTable).values({
      groupId: params.data.id,
      userId: currentUser.id,
    });
  }

  const members = await getGroupMembers(group.id);
  res.json({
    ...group,
    memberCount: members.length,
    members,
    createdAt: group.createdAt.toISOString(),
  });
});

export default router;
