// Study groups routes — create, join, and manage study groups
import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, studyGroupsTable, studyGroupMembersTable, usersTable, activityLogTable, groupSettingsTable, groupMemberControlsTable, messagesTable } from "@workspace/db";
import {
  CreateStudyGroupBody,
  GetStudyGroupParams,
  JoinStudyGroupParams,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth-middleware";

const router: IRouter = Router();

// Helper to get members of a study group
function canManageGroup(user: any, group: any) { return user.role === "owner" || user.isManager || user.isPrefect || group.creatorId === user.id; }\n\nasync function getGroupMembers(groupId: number) {
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

// POST /study-groups/:id/leave — Leave a study group
router.post("/study-groups/:id/leave", requireAuth, async (req, res): Promise<void> => {
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
  if (group.creatorId === currentUser.id) {
    res.status(400).json({ error: "The group owner cannot leave their own group" });
    return;
  }

  await db.delete(studyGroupMembersTable).where(
    and(eq(studyGroupMembersTable.groupId, group.id), eq(studyGroupMembersTable.userId, currentUser.id)),
  );
  const members = await getGroupMembers(group.id);
  res.json({ ...group, memberCount: members.length, members, createdAt: group.createdAt.toISOString() });
});

export default router;


// GET /study-groups/:id/settings
router.get("/study-groups/:id/settings", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [group] = await db.select().from(studyGroupsTable).where(eq(studyGroupsTable.id, id));
  if (!group) { res.status(404).json({ error: "Study group not found" }); return; }
  const [settings] = await db.select().from(groupSettingsTable).where(eq(groupSettingsTable.groupId, id));
  res.json(settings ?? { groupId: id, rules: null, announcementsOnly: false, allowPolls: true, allowMedia: true, maxMembers: 1024 });
});

// PATCH /study-groups/:id/settings
router.patch("/study-groups/:id/settings", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id), user = req.currentUser!;
  const [group] = await db.select().from(studyGroupsTable).where(eq(studyGroupsTable.id, id));
  if (!group) { res.status(404).json({ error: "Study group not found" }); return; }
  if (!canManageGroup(user, group)) { res.status(403).json({ error: "Group management access required" }); return; }
  const values = {
    rules: typeof req.body?.rules === "string" ? req.body.rules : undefined,
    announcementsOnly: typeof req.body?.announcementsOnly === "boolean" ? req.body.announcementsOnly : undefined,
    allowPolls: typeof req.body?.allowPolls === "boolean" ? req.body.allowPolls : undefined,
    allowMedia: typeof req.body?.allowMedia === "boolean" ? req.body.allowMedia : undefined,
    maxMembers: Number.isInteger(req.body?.maxMembers) ? Math.max(2, Math.min(1024, req.body.maxMembers)) : undefined,
    updatedBy: user.id,
  };
  const [existing] = await db.select().from(groupSettingsTable).where(eq(groupSettingsTable.groupId, id));
  const [settings] = existing
    ? await db.update(groupSettingsTable).set(values).where(eq(groupSettingsTable.groupId, id)).returning()
    : await db.insert(groupSettingsTable).values({ groupId: id, ...values } as any).returning();
  res.json(settings);
});

// POST /study-groups/:id/members/:userId/control
router.post("/study-groups/:id/members/:userId/control", requireAuth, async (req, res): Promise<void> => {
  const groupId = Number(req.params.id), userId = Number(req.params.userId), user = req.currentUser!;
  const [group] = await db.select().from(studyGroupsTable).where(eq(studyGroupsTable.id, groupId));
  if (!group || !canManageGroup(user, group)) { res.status(403).json({ error: "Group management access required" }); return; }
  const [member] = await db.select().from(studyGroupMembersTable).where(and(eq(studyGroupMembersTable.groupId, groupId), eq(studyGroupMembersTable.userId, userId)));
  if (!member) { res.status(404).json({ error: "User is not a group member" }); return; }
  const allowed = ["blocked","mediaBlocked","suspended","muted"];
  const patch: any = { updatedBy: user.id };
  for (const key of allowed) if (typeof req.body?.[key] === "boolean") patch[key] = req.body[key];
  const [existing] = await db.select().from(groupMemberControlsTable).where(and(eq(groupMemberControlsTable.groupId, groupId), eq(groupMemberControlsTable.userId, userId)));
  const [control] = existing
    ? await db.update(groupMemberControlsTable).set(patch).where(eq(groupMemberControlsTable.id, existing.id)).returning()
    : await db.insert(groupMemberControlsTable).values({ groupId, userId, ...patch }).returning();
  res.json(control);
});

// DELETE /study-groups/:id/members/:userId
router.delete("/study-groups/:id/members/:userId", requireAuth, async (req, res): Promise<void> => {
  const groupId = Number(req.params.id), userId = Number(req.params.userId), user = req.currentUser!;
  const [group] = await db.select().from(studyGroupsTable).where(eq(studyGroupsTable.id, groupId));
  if (!group || !canManageGroup(user, group)) { res.status(403).json({ error: "Group management access required" }); return; }
  if (userId === group.creatorId) { res.status(400).json({ error: "The group owner cannot be removed" }); return; }
  await db.delete(studyGroupMembersTable).where(and(eq(studyGroupMembersTable.groupId, groupId), eq(studyGroupMembersTable.userId, userId)));
  res.sendStatus(204);
});

// DELETE /study-groups/:id/messages
router.delete("/study-groups/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const groupId = Number(req.params.id), user = req.currentUser!;
  const [group] = await db.select().from(studyGroupsTable).where(eq(studyGroupsTable.id, groupId));
  if (!group || !canManageGroup(user, group)) { res.status(403).json({ error: "Group management access required" }); return; }
  await db.delete(messagesTable).where(eq(messagesTable.groupId, groupId));
  res.sendStatus(204);
});
