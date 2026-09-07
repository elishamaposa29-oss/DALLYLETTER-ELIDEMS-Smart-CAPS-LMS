// Messages routes — group and private chat, including voice notes
import { Router, type IRouter } from "express";
import { eq, and, isNull, or, inArray } from "drizzle-orm";
import { db, messagesTable, activityLogTable, studyGroupMembersTable, studyGroupsTable } from "@workspace/db";
import {
  ListMessagesQueryParams,
  SendMessageBody,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth-middleware";

const router: IRouter = Router();

async function canAccessGroup(groupId: number, userId: number, role: string): Promise<boolean> {
  const [group] = await db.select({ id: studyGroupsTable.id }).from(studyGroupsTable).where(eq(studyGroupsTable.id, groupId));
  if (!group) return false;
  if (role === "teacher" || role === "owner") return true;
  const [membership] = await db.select({ id: studyGroupMembersTable.id })
    .from(studyGroupMembersTable)
    .where(and(eq(studyGroupMembersTable.groupId, groupId), eq(studyGroupMembersTable.userId, userId)));
  return Boolean(membership);
}

// GET /messages — List messages filtered by groupId or recipientId
router.get("/messages", requireAuth, async (req, res): Promise<void> => {
  const queryParams = ListMessagesQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const { groupId, recipientId } = queryParams.data;
  const currentUser = req.currentUser!;

  let messages;
  if (groupId != null) {
    if (!(await canAccessGroup(groupId, currentUser.id, currentUser.role))) {
      res.status(403).json({ error: "You must be a group member to view its messages" });
      return;
    }
    // Group messages
    messages = await db.select().from(messagesTable)
      .where(eq(messagesTable.groupId, groupId))
      .orderBy(messagesTable.createdAt);
  } else if (recipientId != null) {
    // Private messages between current user and recipient
    messages = await db.select().from(messagesTable)
      .where(
        or(
          and(eq(messagesTable.senderId, currentUser.id), eq(messagesTable.recipientId, recipientId)),
          and(eq(messagesTable.senderId, recipientId), eq(messagesTable.recipientId, currentUser.id))
        )
      )
      .orderBy(messagesTable.createdAt);
  } else {
    const memberships = await db.select({ groupId: studyGroupMembersTable.groupId })
      .from(studyGroupMembersTable)
      .where(eq(studyGroupMembersTable.userId, currentUser.id));
    const groupIds = memberships.map(({ groupId }) => groupId);
    messages = groupIds.length === 0
      ? []
      : await db.select().from(messagesTable)
        .where(and(isNull(messagesTable.recipientId), inArray(messagesTable.groupId, groupIds)))
        .orderBy(messagesTable.createdAt);
  }

  res.json(messages.map(m => ({ ...m, createdAt: m.createdAt.toISOString() })));
});

// POST /messages — Send a message
router.post("/messages", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;

  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.groupId != null && !(await canAccessGroup(parsed.data.groupId, currentUser.id, currentUser.role))) {
    res.status(403).json({ error: "You must be a group member to post messages" });
    return;
  }

  const [message] = await db.insert(messagesTable).values({
    ...parsed.data,
    senderId: currentUser.id,
    senderName: currentUser.name,
    senderRole: currentUser.role,
  }).returning();

  // Log activity for group messages
  if (message.groupId != null) {
    await db.insert(activityLogTable).values({
      type: "message_sent",
      description: `${currentUser.name} sent a message in a group`,
      actorName: currentUser.name,
    });
  }

  res.status(201).json({ ...message, createdAt: message.createdAt.toISOString() });
});

export default router;
