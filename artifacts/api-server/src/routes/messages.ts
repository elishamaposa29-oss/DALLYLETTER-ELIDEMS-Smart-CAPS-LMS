// Messages routes — group and private chat, including voice notes
import { Router, type IRouter } from "express";
import { eq, and, isNull, or, inArray } from "drizzle-orm";
import { createReadStream } from "node:fs";
import multer from "multer";
import { db, messagesTable, activityLogTable, studyGroupMembersTable, studyGroupsTable, contentFlagsTable, auditLogsTable, groupMemberControlsTable, groupSettingsTable, usersTable } from "@workspace/db";
import {
  ListMessagesQueryParams,
  SendMessageBody,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth-middleware";
import { getAIProvider } from "../lib/ai-provider";
import { createMediaStorageKey, ensureMediaDirectory, getMediaDirectory, getMediaPath, getMediaStats, isAllowedMediaType, deleteStoredMedia, MAX_MEDIA_SIZE_BYTES } from "../lib/media-storage";

const MAX_CHAT_MEDIA_SIZE_BYTES = MAX_MEDIA_SIZE_BYTES;
import { isOwnerRole, normalizeRole } from "../lib/auth-middleware";

const router: IRouter = Router();

const voiceUpload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, callback) => {
      try {
        await ensureMediaDirectory();
        callback(null, getMediaDirectory());
      } catch (error) {
        callback(error as Error, "");
      }
    },
    filename: (_req, _file, callback) => callback(null, createMediaStorageKey()),
  }),
  limits: { fileSize: MAX_CHAT_MEDIA_SIZE_BYTES },
  fileFilter: (_req, file, callback) => callback(null, isAllowedMediaType(file.mimetype)),
});

async function canAccessGroup(groupId: number, userId: number, role: string): Promise<boolean> {
  const [group] = await db.select({ id: studyGroupsTable.id }).from(studyGroupsTable).where(eq(studyGroupsTable.id, groupId));
  if (!group) return false;
  if (normalizeRole(role) === "teacher" || isOwnerRole(role)) return true;
  const [membership] = await db.select({ id: studyGroupMembersTable.id })
    .from(studyGroupMembersTable)
    .where(and(eq(studyGroupMembersTable.groupId, groupId), eq(studyGroupMembersTable.userId, userId)));
  return Boolean(membership);
}

async function canMessageUser(sender: NonNullable<Express.Request["currentUser"]>, recipientId: number): Promise<boolean> {
  if (!Number.isInteger(recipientId) || recipientId <= 0 || recipientId === sender.id) return false;
  const [recipient] = await db.select({ id: usersTable.id, role: usersTable.role, isPrefect: usersTable.isPrefect, isBlocked: usersTable.isBlocked, isSuspended: usersTable.isSuspended })
    .from(usersTable)
    .where(eq(usersTable.id, recipientId));
  if (!recipient || recipient.isBlocked || recipient.isSuspended) return false;
  const senderRole = normalizeRole(sender.role);
  const recipientRole = normalizeRole(recipient.role);
  if (senderRole === "student") {
    return recipientRole === "teacher" || isOwnerRole(recipientRole) || recipient.isPrefect === true;
  }
  return true;
}

function messageMediaPath(storageKey: string): string {
  return `/api/messages/media/${storageKey}`;
}

router.post("/messages/media", requireAuth, (req, res): void => {
  voiceUpload.single("file")(req, res, (error) => {
    void (async () => {
      if (error || !req.file) {
        res.status(400).json({ error: "A supported learning media file up to 250 MB is required" });
        return;
      }

      const groupId = req.body?.groupId == null || req.body.groupId === "" ? null : Number(req.body.groupId);
      const recipientId = req.body?.recipientId == null || req.body.recipientId === "" ? null : Number(req.body.recipientId);
      const currentUser = req.currentUser!;
      const validTarget = (groupId != null && recipientId == null) || (groupId == null && recipientId != null);
      const allowed = validTarget
        && (groupId != null
          ? await canAccessGroup(groupId, currentUser.id, currentUser.role)
          : await canMessageUser(currentUser, recipientId!));
      if (!allowed) {
        await deleteStoredMedia(req.file.filename);
        res.status(403).json({ error: "You cannot upload media to this conversation" });
        return;
      }
      if (groupId != null) {
        const [settings] = await db.select().from(groupSettingsTable).where(eq(groupSettingsTable.groupId, groupId));
        const [control] = await db.select().from(groupMemberControlsTable).where(and(eq(groupMemberControlsTable.groupId, groupId), eq(groupMemberControlsTable.userId, currentUser.id)));
        if (settings?.allowMedia === false || control?.mediaBlocked || control?.blocked || control?.suspended || control?.muted) {
          await deleteStoredMedia(req.file.filename);
          res.status(403).json({ error: "Media uploads are disabled for you in this group" });
          return;
        }
      }

      res.status(201).json({
        mediaUrl: messageMediaPath(req.file.filename) + "?type=" + encodeURIComponent(req.file.mimetype),
        storageKey: req.file.filename,
        mimeType: req.file.mimetype,
        size: req.file.size,
      });
    })().catch(() => {
      res.status(500).json({ error: "Media upload failed" });
    });
  });
});

router.get("/messages/media/:storageKey", requireAuth, async (req, res): Promise<void> => {
  const storageKey = String(req.params.storageKey);
  if (!/^[a-f0-9-]{36}$/i.test(storageKey)) { res.status(400).json({ error: "Invalid media key" }); return; }
  const mediaUrl = messageMediaPath(storageKey);
  const [message] = await db.select({ senderId: messagesTable.senderId, groupId: messagesTable.groupId, recipientId: messagesTable.recipientId })
    .from(messagesTable)
    .where(eq(messagesTable.mediaUrl, mediaUrl));
  if (!message) { res.status(404).json({ error: "Media not found" }); return; }
  const user = req.currentUser!;
  const allowed = message.groupId != null
    ? await canAccessGroup(message.groupId, user.id, user.role)
    : message.recipientId != null && (message.recipientId === user.id || message.senderId === user.id);
  if (!allowed) { res.status(403).json({ error: "You cannot access this media" }); return; }
  try {
    const stats = await getMediaStats(storageKey);
    res.setHeader("Content-Type", typeof req.query.type === "string" && isAllowedMediaType(req.query.type) ? req.query.type : "audio/webm");
    res.setHeader("Content-Length", stats.size);
    createReadStream(getMediaPath(storageKey)).pipe(res);
  } catch {
    res.status(404).json({ error: "Media not found" });
  }
});

// GET /messages — List messages filtered by groupId or recipientId
router.get("/messages", requireAuth, async (req, res): Promise<void> => {
  // The generated client historically serialized nullable filters as the literal string "null".
  // Treat null/empty query values as absent so harmless nullable filters never become a 400.
  const normalizedQuery = Object.fromEntries(
    Object.entries(req.query).filter(([, value]) => value !== "null" && value !== "" && value !== undefined),
  );
  const queryParams = ListMessagesQueryParams.safeParse(normalizedQuery);
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
    if (!(await canMessageUser(currentUser, recipientId))) {
      res.status(403).json({ error: "You cannot access this conversation" });
      return;
    }
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
router.delete("/messages/:id", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!, id = Number(req.params.id);
  const [message] = await db.select().from(messagesTable).where(eq(messagesTable.id, id));
  if (!message) { res.status(404).json({ error: "Message not found" }); return; }
  let allowed = message.senderId === user.id || user.role === "owner" || user.isManager || user.isPrefect;
  if (message.groupId) {
    const [group] = await db.select().from(studyGroupsTable).where(eq(studyGroupsTable.id, message.groupId));
    allowed = allowed && Boolean(group) && (message.senderId === user.id || user.role === "owner" || user.isManager || user.isPrefect || group!.creatorId === user.id);
  }
  if (!allowed) { res.status(403).json({ error: "You cannot delete this message" }); return; }
  await db.delete(messagesTable).where(eq(messagesTable.id, id));
  res.sendStatus(204);
});

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
  if ((parsed.data.groupId != null && parsed.data.recipientId != null) || (parsed.data.groupId == null && parsed.data.recipientId == null)) {
    res.status(400).json({ error: "Choose exactly one group or recipient conversation" });
    return;
  }
  if (parsed.data.recipientId != null && !(await canMessageUser(currentUser, parsed.data.recipientId))) {
    res.status(403).json({ error: "You cannot message this user" });
    return;
  }
  if (["voice", "media"].includes(parsed.data.type) && !parsed.data.mediaUrl) {
    res.status(400).json({ error: "Voice messages require an uploaded audio file" });
    return;
  }
  if (!["voice", "media"].includes(parsed.data.type) && parsed.data.mediaUrl) {
    res.status(400).json({ error: "Only voice and learning-media messages may include media" });
    return;
  }

  if (parsed.data.parentMessageId != null) {
    if (parsed.data.groupId == null) {
      res.status(400).json({ error: "Replies must belong to a group" });
      return;
    }
    const [parent] = await db.select({
      id: messagesTable.id,
      groupId: messagesTable.groupId,
      recipientId: messagesTable.recipientId,
    }).from(messagesTable).where(eq(messagesTable.id, parsed.data.parentMessageId));
    if (!parent || parent.groupId !== parsed.data.groupId || parent.recipientId != null) {
      res.status(400).json({ error: "Parent message must belong to the selected group" });
      return;
    }
  }

  if (parsed.data.groupId != null) {
    const [control] = await db.select().from(groupMemberControlsTable).where(and(eq(groupMemberControlsTable.groupId, parsed.data.groupId), eq(groupMemberControlsTable.userId, currentUser.id)));
    const [settings] = await db.select().from(groupSettingsTable).where(eq(groupSettingsTable.groupId, parsed.data.groupId));
    if (control?.blocked || control?.suspended || control?.muted) { res.status(403).json({ error: "You are restricted from messaging in this group" }); return; }
    if ((parsed.data.type === "voice" || parsed.data.type === "media") && (control?.mediaBlocked || settings?.allowMedia === false)) { res.status(403).json({ error: "Media uploads are disabled for you in this group" }); return; }
    if (settings?.announcementsOnly && !(isOwnerRole(currentUser.role) || currentUser.isManager || currentUser.isPrefect)) {
      res.status(403).json({ error: "Only group moderators can post announcements in this group" });
      return;
    }
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

router.post("/messages/:id/report", requireAuth, async (req, res): Promise<void> => {
  const messageId = Number(req.params.id);
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!Number.isInteger(messageId) || messageId <= 0 || reason.length < 3 || reason.length > 500) {
    res.status(400).json({ error: "A valid message id and a reason between 3 and 500 characters are required" });
    return;
  }

  const [message] = await db.select().from(messagesTable).where(eq(messagesTable.id, messageId));
  if (!message || message.groupId == null || !(await canAccessGroup(message.groupId, req.currentUser!.id, req.currentUser!.role))) {
    res.status(404).json({ error: "Message not found" });
    return;
  }

  let severity = "medium";
  let detectedBy = "user";
  let storedReason = reason;
  try {
    const ai = await getAIProvider();
    const moderation = await ai.moderateContent(message.content);
    if (moderation.flagged) {
      severity = moderation.severity;
      detectedBy = `${ai.name}:user`;
      storedReason = `${reason} AI assessment: ${moderation.reason ?? "Potential policy concern"}`.slice(0, 500);
    }
  } catch {
    // Preserve the user report without inventing an AI result when the provider is unavailable.
  }

  const [flag] = await db.insert(contentFlagsTable).values({
    contentType: "message",
    contentId: message.id,
    contentText: message.content.slice(0, 500),
    reason: storedReason,
    severity,
    detectedBy,
    status: "pending",
  }).returning();

  await db.insert(auditLogsTable).values({
    action: `Reported group message #${message.id}`,
    category: "moderation",
    performedBy: req.currentUser!.id,
    targetType: "message",
    targetId: message.id,
    details: JSON.stringify({ flagId: flag.id, reason }),
  });

  res.status(201).json(flag);
});

export default router;
