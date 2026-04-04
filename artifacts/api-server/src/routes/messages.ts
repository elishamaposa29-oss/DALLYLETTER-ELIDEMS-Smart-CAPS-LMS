// Messages routes — group and private chat, including voice notes
import { Router, type IRouter } from "express";
import { eq, and, isNull, or } from "drizzle-orm";
import { db, messagesTable, activityLogTable } from "@workspace/db";
import {
  ListMessagesQueryParams,
  SendMessageBody,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth-middleware";

const router: IRouter = Router();

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
    // All group messages (no group filter)
    messages = await db.select().from(messagesTable)
      .where(isNull(messagesTable.recipientId))
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
