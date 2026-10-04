// Study groups routes — create, join, and manage study groups
import { Router, type IRouter } from "express";
import { eq, and, count } from "drizzle-orm";
import { db, studyGroupsTable, studyGroupMembersTable, usersTable, activityLogTable, groupSettingsTable, groupMemberControlsTable, messagesTable } from "@workspace/db";
import {
  CreateStudyGroupBody,
  GetStudyGroupParams,
  JoinStudyGroupParams,
} from "@workspace/api-zod";
import { requireAuth, isOwnerRole } from "../lib/auth-middleware";

const router: IRouter = Router();

// Helper to get members of a study group
function canManageGroup(user: any, group: any) {
  return isOwnerRole(user.role) || user.isManager === true || group.creatorId === user.id;
}

async function canManageGroupSettings(user: any, groupId: number, group?: any) {
  if (group && (isOwnerRole(user.role) || user.isManager === true || group.creatorId === user.id)) return true;
  const [control] = await db.select({ canManageSettings: groupMemberControlsTable.canManageSettings })
    .from(groupMemberControlsTable)
    .where(and(eq(groupMemberControlsTable.groupId, groupId), eq(groupMemberControlsTable.userId, user.id)));
  return control?.canManageSettings === true;
}

async function isGroupMember(groupId: number, userId: number): Promise<boolean> {
  const [membership] = await db
    .select({ id: studyGroupMembersTable.id })
    .from(studyGroupMembersTable)
    .where(and(eq(studyGroupMembersTable.groupId, groupId), eq(studyGroupMembersTable.userId, userId)));
  return Boolean(membership);
}

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
    control: {
      blocked: groupMemberControlsTable.blocked,
      mediaBlocked: groupMemberControlsTable.mediaBlocked,
      suspended: groupMemberControlsTable.suspended,
      muted: groupMemberControlsTable.muted,
      canManageSettings: groupMemberControlsTable.canManageSettings,
    },
  })
  .from(studyGroupMembersTable)
  .innerJoin(usersTable, eq(studyGroupMembersTable.userId, usersTable.id))
  .leftJoin(groupMemberControlsTable, and(
    eq(groupMemberControlsTable.groupId, groupId),
    eq(groupMemberControlsTable.userId, usersTable.id),
  ))
  .where(eq(studyGroupMembersTable.groupId, groupId));

  return memberRows.map(m => ({
    ...m,
    control: m.control && Object.values(m.control).some(value => value !== null) ? {
      blocked: Boolean(m.control.blocked),
      mediaBlocked: Boolean(m.control.mediaBlocked),
      suspended: Boolean(m.control.suspended),
      muted: Boolean(m.control.muted),
      canManageSettings: Boolean(m.control.canManageSettings),
    } : null,
    createdAt: m.createdAt.toISOString(),
  }));
}

// GET /study-groups — List all study groups
router.get("/study-groups", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;
  const groups = await db.select().from(studyGroupsTable).orderBy(studyGroupsTable.createdAt);

  const result = await Promise.all(groups.map(async (g) => {
    const members = await getGroupMembers(g.id);
    const isMember = members.some(member => member.id === currentUser.id);
    const canManage = canManageGroup(currentUser, g);
    const [settings] = await db.select().from(groupSettingsTable).where(eq(groupSettingsTable.groupId, g.id));
    return {
      ...g,
      memberCount: members.length,
      isMember,
      members: isMember || canManage ? members : [],
      settings: settings ?? { groupId: g.id, rules: null, announcementsOnly: false, allowPolls: true, allowMedia: true, maxMembers: 1024 },
      createdAt: g.createdAt.toISOString(),
    };
  }));

  res.json(result);
});

// POST /study-groups — Create a study group
router.post("/study-groups", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;
  const canCreate = isOwnerRole(currentUser.role) || currentUser.isManager === true || currentUser.isPrefect === true || currentUser.role === "teacher";
  if (!canCreate) {
    res.status(403).json({ error: "Only teachers, prefects, managers, and owners can create study groups" });
    return;
  }

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

  // Keep every created group immediately readable by Connect/settings.
  await db.insert(groupSettingsTable).values({
    groupId: group.id,
    updatedBy: currentUser.id,
  }).onConflictDoNothing({ target: groupSettingsTable.groupId });

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

  const alreadyMember = await isGroupMember(params.data.id, currentUser.id);

  if (!alreadyMember) {
    const [settings] = await db.select().from(groupSettingsTable).where(eq(groupSettingsTable.groupId, group.id));
    const [{ memberCount }] = await db
      .select({ memberCount: count() })
      .from(studyGroupMembersTable)
      .where(eq(studyGroupMembersTable.groupId, group.id));
    if (memberCount >= (settings?.maxMembers ?? 1024)) {
      res.status(409).json({ error: "This study group is full" });
      return;
    }
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
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid group id" }); return; }
  const [group] = await db.select().from(studyGroupsTable).where(eq(studyGroupsTable.id, id));
  if (!group) { res.status(404).json({ error: "Study group not found" }); return; }
  if (!(await canManageGroupSettings(req.currentUser!, id, group))) { res.status(403).json({ error: "Group settings access required" }); return; }
  const [settings] = await db.select().from(groupSettingsTable).where(eq(groupSettingsTable.groupId, id));
  res.json(settings ?? { groupId: id, rules: null, announcementsOnly: false, allowPolls: true, allowMedia: true, maxMembers: 1024 });
});

// PATCH /study-groups/:id/settings
router.patch("/study-groups/:id/settings", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id), user = req.currentUser!;
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid group id" }); return; }
  const [group] = await db.select().from(studyGroupsTable).where(eq(studyGroupsTable.id, id));
  if (!group) { res.status(404).json({ error: "Study group not found" }); return; }
  if (!(await canManageGroupSettings(user, id, group))) { res.status(403).json({ error: "Group settings access required" }); return; }
  const values = {
    rules: typeof req.body?.rules === "string" ? req.body.rules.trim().slice(0, 4000) : req.body?.rules === null ? null : undefined,
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
  if (!group || !(await canManageGroupSettings(user, groupId, group))) { res.status(403).json({ error: "Group management access required" }); return; }
  const [member] = await db.select().from(studyGroupMembersTable).where(and(eq(studyGroupMembersTable.groupId, groupId), eq(studyGroupMembersTable.userId, userId)));
  if (!member) { res.status(404).json({ error: "User is not a group member" }); return; }
  const allowed = ["blocked","mediaBlocked","suspended","muted","canManageSettings"];
  const patch: any = { updatedBy: user.id };
  for (const key of allowed) if (typeof req.body?.[key] === "boolean") patch[key] = req.body[key];
  const [existing] = await db.select().from(groupMemberControlsTable).where(and(eq(groupMemberControlsTable.groupId, groupId), eq(groupMemberControlsTable.userId, userId)));
  const [control] = existing
    ? await db.update(groupMemberControlsTable).set(patch).where(eq(groupMemberControlsTable.id, existing.id)).returning()
    : await db.insert(groupMemberControlsTable).values({ groupId, userId, ...patch }).returning();
  res.json(control);
});

// GET /study-groups/:id/members — members plus effective moderation controls
router.get("/study-groups/:id/members", requireAuth, async (req, res): Promise<void> => {
  const groupId = Number(req.params.id);
  if (!Number.isInteger(groupId) || groupId <= 0) { res.status(400).json({ error: "Invalid group id" }); return; }
  const [group] = await db.select().from(studyGroupsTable).where(eq(studyGroupsTable.id, groupId));
  if (!group) { res.status(404).json({ error: "Study group not found" }); return; }
  if (!(await isGroupMember(groupId, req.currentUser!.id) || canManageGroup(req.currentUser!, group))) {
    res.status(403).json({ error: "You must be a group member to view members" });
    return;
  }
  const members = await getGroupMembers(groupId);
  const controls = await db.select().from(groupMemberControlsTable).where(eq(groupMemberControlsTable.groupId, groupId));
  const controlsByUser = new Map(controls.map(control => [control.userId, control]));
  res.json(members.map(member => ({ ...member, control: controlsByUser.get(member.id) ?? null })));
});

// DELETE /study-groups/:id/members/:userId
router.delete("/study-groups/:id/members/:userId", requireAuth, async (req, res): Promise<void> => {
  const groupId = Number(req.params.id), userId = Number(req.params.userId), user = req.currentUser!;
  const [group] = await db.select().from(studyGroupsTable).where(eq(studyGroupsTable.id, groupId));
  if (!group || !(await canManageGroupSettings(user, groupId, group))) { res.status(403).json({ error: "Group management access required" }); return; }
  if (userId === group.creatorId) { res.status(400).json({ error: "The group owner cannot be removed" }); return; }
  await db.delete(studyGroupMembersTable).where(and(eq(studyGroupMembersTable.groupId, groupId), eq(studyGroupMembersTable.userId, userId)));
  res.sendStatus(204);
});

// DELETE /study-groups/:id/messages
router.delete("/study-groups/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const groupId = Number(req.params.id), user = req.currentUser!;
  const [group] = await db.select().from(studyGroupsTable).where(eq(studyGroupsTable.id, groupId));
  if (!group || !(await canManageGroupSettings(user, groupId, group))) { res.status(403).json({ error: "Group management access required" }); return; }
  await db.delete(messagesTable).where(eq(messagesTable.groupId, groupId));
  res.sendStatus(204);
});
