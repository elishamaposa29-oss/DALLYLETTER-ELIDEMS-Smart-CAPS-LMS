// Messages routes — group and private chat, including voice notes
import { Router, type IRouter } from "express";
import { eq, and, isNull, or, inArray, desc } from "drizzle-orm";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import multer from "multer";
import { db, pool, messagesTable, activityLogTable, studyGroupMembersTable, studyGroupsTable, contentFlagsTable, auditLogsTable, groupMemberControlsTable, groupSettingsTable, usersTable } from "@workspace/db";
import {
  ListMessagesQueryParams,
  SendMessageBody,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth-middleware";
import { getAIProvider } from "../lib/ai-provider";
import { createMediaStorageKey, ensureMediaDirectory, getMediaDirectory, getMediaPath, getMediaStats, isAllowedMediaType, removeStoredMedia, persistUploadedMedia, streamStoredMedia, MAX_MEDIA_SIZE_BYTES } from "../lib/media-storage";

const MAX_CHAT_MEDIA_SIZE_BYTES = MAX_MEDIA_SIZE_BYTES;
import { isOwnerRole, normalizeRole, canAccessManager } from "../lib/auth-middleware";
import { hasAcceptedProfileConnection, isProfileChatApprovalRequired } from "./profileConnections";
import { managerHasPermission, requireManagerPermission } from "../lib/manager-permission-policy";
import { canModerateUser } from "../lib/role-access";

const router: IRouter = Router();

function isProfileOnlyTeacher(user: NonNullable<Express.Request["currentUser"]>): boolean {
  return normalizeRole(user.role) === "teacher" &&
    ["draft","pending_review","rejected_pending_conversion"].includes(String(user.teacherApplicationStatus ?? "").trim().toLowerCase());
}

router.get("/manager/owner-contact", requireAuth, requireManagerPermission("owner.chat"), async (req,res):Promise<void> => {
  const [owner]=await db.select({id:usersTable.id,name:usersTable.name}).from(usersTable).where(inArray(usersTable.role,["owner","platform_owner"])).orderBy(usersTable.id).limit(1);
  if(!owner){res.status(404).json({error:"Owner contact is not available."});return;}
  res.setHeader("Cache-Control","private,no-store");
  res.json({id:Number(owner.id),name:String(owner.name||"Owner")});
});

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

async function canAccessGroup(groupId: number, user: NonNullable<Express.Request["currentUser"]>): Promise<boolean> {
  const [group] = await db.select({ id: studyGroupsTable.id, creatorId: studyGroupsTable.creatorId }).from(studyGroupsTable).where(eq(studyGroupsTable.id, groupId));
  if (!group) return false;
  if (normalizeRole(user.role) === "teacher" || isOwnerRole(user.role)) return true;
  if (normalizeRole(user.role) === "admin") {
    const [creator] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, group.creatorId));
    return Boolean(creator && !isOwnerRole(creator.role));
  }
  const [membership] = await db.select({ id: studyGroupMembersTable.id })
    .from(studyGroupMembersTable)
    .where(and(eq(studyGroupMembersTable.groupId, groupId), eq(studyGroupMembersTable.userId, user.id)));
  if (membership || Number(group.creatorId) === Number(user.id)) return true;
  if (!canAccessManager(user) || !(await managerHasPermission(user, "groups.manage"))) return false;
  const [creator] = await db.select({ role: usersTable.role, isManager: usersTable.isManager, managerLevel: usersTable.managerLevel })
    .from(usersTable).where(eq(usersTable.id, group.creatorId));
  return Boolean(creator && canModerateUser(user, creator));
}

async function canOverrideGroupSettings(groupId: number, user: NonNullable<Express.Request["currentUser"]>): Promise<boolean> {
  if (isOwnerRole(user.role) || normalizeRole(user.role) === "admin") return true;
  const [group] = await db.select({ creatorId: studyGroupsTable.creatorId }).from(studyGroupsTable).where(eq(studyGroupsTable.id, groupId));
  if (!group) return false;
  if (Number(group.creatorId) === Number(user.id)) return true;
  const [control] = await db.select({ canManageSettings: groupMemberControlsTable.canManageSettings })
    .from(groupMemberControlsTable)
    .where(and(eq(groupMemberControlsTable.groupId, groupId), eq(groupMemberControlsTable.userId, user.id)));
  if (control?.canManageSettings === true) return true;
  if (!canAccessManager(user) || !(await managerHasPermission(user, "groups.manage"))) return false;
  const [creator] = await db.select({ role: usersTable.role, isManager: usersTable.isManager, managerLevel: usersTable.managerLevel })
    .from(usersTable).where(eq(usersTable.id, group.creatorId));
  return Boolean(creator && canModerateUser(user, creator));
}

async function canMessageUser(sender: NonNullable<Express.Request["currentUser"]>, recipientId: number): Promise<boolean> {
  if (!Number.isInteger(recipientId) || recipientId <= 0 || recipientId === sender.id) return false;
  const [recipient] = await db.select({ id: usersTable.id, role: usersTable.role, isManager: usersTable.isManager, managerLevel: usersTable.managerLevel, isPrefect: usersTable.isPrefect, isBlocked: usersTable.isBlocked, isSuspended: usersTable.isSuspended })
    .from(usersTable)
    .where(eq(usersTable.id, recipientId));
  if (!recipient || recipient.isBlocked || recipient.isSuspended) return false;
  // The recipient's current privacy setting controls inbound private chat.
  // Accepted connections satisfy approval_required; stale pending/rejected
  // history must never override an Everyone allowed setting.
  if (await hasAcceptedProfileConnection(sender.id, recipientId)) return true;
  if (await isProfileChatApprovalRequired(recipientId)) return false;
  const senderRole = normalizeRole(sender.role);
  const recipientRole = normalizeRole(recipient.role);
  const senderIsManager = ["junior_manager","senior_manager","manager"].includes(senderRole) || (senderRole === "teacher" && sender.isManager === true);
  if (isOwnerRole(recipientRole) && senderRole === "admin") return false;
  if (senderIsManager && isOwnerRole(recipientRole) && !(await managerHasPermission(sender, "owner.chat"))) return false;
  if (senderIsManager && !isOwnerRole(recipientRole) && (!canModerateUser(sender, recipient) || !(await managerHasPermission(sender, "messages.send")))) return false;
  // Do not apply classroom role hierarchy to Profile Hub private conversations.
  // Manager scope and Owner-contact authorization above remain enforced.
  return true;
}

async function canViewPrivateConversation(user: NonNullable<Express.Request["currentUser"]>, recipientId: number): Promise<boolean> {
  if (!Number.isInteger(recipientId) || recipientId <= 0 || recipientId === user.id) return false;
  if (isOwnerRole(user.role)) return true;
  const viewerRole = normalizeRole(user.role);
  const viewerIsManager = ["junior_manager","senior_manager","manager"].includes(viewerRole) || (viewerRole === "teacher" && user.isManager === true);
  if (viewerIsManager) {
    const target = await db.select({ role: usersTable.role, isManager: usersTable.isManager, managerLevel: usersTable.managerLevel }).from(usersTable).where(eq(usersTable.id, recipientId));
    const recipient = target[0];
    if (!recipient) return false;
    if (isOwnerRole(recipient.role)) {
      if (viewerRole === "admin") return false;
      if (viewerIsManager && !(await managerHasPermission(user, "owner.chat"))) return false;
    } else if (!canModerateUser(user, recipient) || !(await managerHasPermission(user, "messages.send"))) return false;
  }
  const [targetRequiresApproval,accepted] = await Promise.all([
    isProfileChatApprovalRequired(recipientId),
    hasAcceptedProfileConnection(user.id, recipientId),
  ]);
  if (targetRequiresApproval && !accepted) return false;
  if (accepted) return true;
  // With both profiles open to everyone, a participant may open a new thread
  // before the first message exists; membership is still limited to these two users.
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
      if (isProfileOnlyTeacher(currentUser) && groupId != null) {
        await removeStoredMedia(req.file.filename);
        res.status(403).json({ error: "Applicants may use private Profile Hub conversations only; group chat unlocks after teacher authorization." });
        return;
      }
      const validTarget = (groupId != null && recipientId == null) || (groupId == null && recipientId != null);
      const allowed = validTarget
        && (groupId != null
          ? await canAccessGroup(groupId, currentUser)
          : await canMessageUser(currentUser, recipientId!));
      if (!allowed) {
        await removeStoredMedia(req.file.filename);
        res.status(403).json({ error: "You cannot upload media to this conversation" });
        return;
      }
      if (groupId != null) {
        const [settings] = await db.select().from(groupSettingsTable).where(eq(groupSettingsTable.groupId, groupId));
        const [control] = await db.select().from(groupMemberControlsTable).where(and(eq(groupMemberControlsTable.groupId, groupId), eq(groupMemberControlsTable.userId, currentUser.id)));
        const settingsOverride = await canOverrideGroupSettings(groupId, currentUser);
        if (control?.mediaBlocked || control?.blocked || control?.suspended || control?.muted || (settings?.allowMedia === false && !settingsOverride)) {
          await removeStoredMedia(req.file.filename);
          res.status(403).json({ error: "Media uploads are disabled for you in this group" });
          return;
        }
      }

      await persistUploadedMedia(req.file.filename, req.file.mimetype, req.file.path);
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
  const requestedType = typeof req.query.type === "string" ? req.query.type : "";
  const mediaUrl = requestedType ? messageMediaPath(storageKey) + "?type=" + encodeURIComponent(requestedType) : messageMediaPath(storageKey);
  const [message] = await db.select({ senderId: messagesTable.senderId, groupId: messagesTable.groupId, recipientId: messagesTable.recipientId })
    .from(messagesTable)
    .where(or(eq(messagesTable.mediaUrl, mediaUrl), eq(messagesTable.mediaUrl, messageMediaPath(storageKey))));
  if (!message) { res.status(404).json({ error: "Media not found" }); return; }
  const user = req.currentUser!;
  if (isProfileOnlyTeacher(user) && message.groupId != null) { res.status(403).json({ error: "Group media is unavailable until teacher authorization." }); return; }
  const allowed = message.groupId != null
    ? await canAccessGroup(message.groupId, user)
    : message.recipientId != null && (isOwnerRole(user.role) || ((message.recipientId === user.id || message.senderId === user.id) && await canViewPrivateConversation(user, message.senderId === user.id ? message.recipientId : message.senderId)));
  if (!allowed) { res.status(403).json({ error: "You cannot access this media" }); return; }
  try {
    const remote = await streamStoredMedia(storageKey, req.headers.range);
    if (remote) {
      res.status(remote.status);
      remote.headers.forEach((value, key) => res.setHeader(key, value));
      if (remote.body) {
        await pipeline(Readable.fromWeb(remote.body as import("node:stream/web").ReadableStream<Uint8Array>), res);
      } else {
        res.end();
      }
      return;
    }
    const stats = await getMediaStats(storageKey);
    res.setHeader("Content-Type", typeof req.query.type === "string" && isAllowedMediaType(req.query.type) ? req.query.type : "audio/webm");
    res.setHeader("Content-Length", stats.size);
    createReadStream(getMediaPath(storageKey)).pipe(res);
  } catch {
    res.status(404).json({ error: "Media not found" });
  }
});

// GET /messages — List messages filtered by groupId or recipientId
router.get("/messages/unread-summary", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
  const allGroups = await db.select({ id: studyGroupsTable.id }).from(studyGroupsTable);
  const accessibleGroupIds: number[] = [];
  for (const group of allGroups) if (await canAccessGroup(group.id, user)) accessibleGroupIds.push(group.id);
  const groups = accessibleGroupIds.length ? await pool.query("SELECT m.group_id AS conversation_id,count(*)::int AS unread_count FROM messages m LEFT JOIN message_conversation_reads r ON r.user_id=$1 AND r.conversation_type='group' AND r.conversation_id=m.group_id WHERE m.group_id=ANY($2::int[]) AND m.sender_id<>$1 AND m.created_at>COALESCE(r.last_read_at,'epoch'::timestamptz) GROUP BY m.group_id",[user.id,accessibleGroupIds]) : {rows:[] as any[]};
  const privateChats = await pool.query("SELECT m.sender_id AS conversation_id,count(*)::int AS unread_count FROM messages m LEFT JOIN message_conversation_reads r ON r.user_id=$1 AND r.conversation_type='private' AND r.conversation_id=m.sender_id WHERE m.group_id IS NULL AND m.recipient_id=$1 AND m.created_at>COALESCE(r.last_read_at,'epoch'::timestamptz) GROUP BY m.sender_id",[user.id]);
  const recentGroups = accessibleGroupIds.length ? await pool.query("SELECT m.group_id AS conversation_id,COUNT(*)::int AS message_count,MAX(m.created_at) AS last_message_at FROM messages m WHERE m.group_id=ANY($1::int[]) GROUP BY m.group_id ORDER BY COUNT(*) DESC,MAX(m.created_at) DESC",[accessibleGroupIds]) : {rows:[] as any[]};
  const recentPeople = await pool.query("SELECT CASE WHEN m.sender_id=$1 THEN m.recipient_id ELSE m.sender_id END AS conversation_id,COUNT(*)::int AS message_count,MAX(m.created_at) AS last_message_at FROM messages m WHERE m.group_id IS NULL AND m.recipient_id IS NOT NULL AND (m.sender_id=$1 OR m.recipient_id=$1) GROUP BY CASE WHEN m.sender_id=$1 THEN m.recipient_id ELSE m.sender_id END ORDER BY COUNT(*) DESC,MAX(m.created_at) DESC",[user.id]);
  const groupUnread=groups.rows.reduce((sum,row)=>sum+Number(row.unread_count||0),0);
  const privateUnread=privateChats.rows.reduce((sum,row)=>sum+Number(row.unread_count||0),0);
  res.json({groupUnread,privateUnread,messageUnread:groupUnread+privateUnread,groups:groups.rows.map(row=>({id:Number(row.conversation_id),unread:Number(row.unread_count)})),privateChats:privateChats.rows.map(row=>({id:Number(row.conversation_id),unread:Number(row.unread_count)})),recentGroups:recentGroups.rows.map(row=>({id:Number(row.conversation_id),messageCount:Number(row.message_count),lastMessageAt:row.last_message_at})),recentPeople:recentPeople.rows.map(row=>({id:Number(row.conversation_id),messageCount:Number(row.message_count),lastMessageAt:row.last_message_at}))});
});

router.get("/messages", requireAuth, async (req, res): Promise<void> => {
  // The generated client historically serialized nullable filters as the literal string "null".
  // Treat null/empty query values as absent so harmless nullable filters never become a 400.
  const handRaiseId = typeof req.query.handRaiseId === "string" ? Number(req.query.handRaiseId) : null;
  const normalizedQuery = Object.fromEntries(
    Object.entries(req.query).filter(([key, value]) => key !== "handRaiseId" && value !== "null" && value !== "" && value !== undefined),
  );
  const queryParams = ListMessagesQueryParams.safeParse(normalizedQuery);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const { groupId, recipientId } = queryParams.data;
  const currentUser = req.currentUser!;
  if (isProfileOnlyTeacher(currentUser) && (groupId != null || recipientId == null)) {
    res.status(403).json({ error: "Applicants may use direct Profile Hub conversations only; group chat unlocks after teacher authorization." });
    return;
  }

  let messages;
  if (groupId != null) {
    if (!(await canAccessGroup(groupId, currentUser))) {
      res.status(403).json({ error: "You must be a group member to view its messages" });
      return;
    }
    // Group messages
    messages = await db.select().from(messagesTable)
      .where(eq(messagesTable.groupId, groupId))
      .orderBy(desc(messagesTable.createdAt), desc(messagesTable.id));
  } else if (recipientId != null) {
    if (!(await canViewPrivateConversation(currentUser, recipientId))) {
      res.status(403).json({ error: "Private conversations are restricted to the participants and owner" });
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
      .orderBy(desc(messagesTable.createdAt), desc(messagesTable.id));
  } else {
    const memberships = await db.select({ groupId: studyGroupMembersTable.groupId })
      .from(studyGroupMembersTable)
      .where(eq(studyGroupMembersTable.userId, currentUser.id));
    const groupIds = memberships.map(({ groupId }) => groupId);
    messages = groupIds.length === 0
      ? []
      : await db.select().from(messagesTable)
        .where(and(isNull(messagesTable.recipientId), inArray(messagesTable.groupId, groupIds)))
        .orderBy(desc(messagesTable.createdAt), desc(messagesTable.id));
  }

  const handRaiseMarker = /^\[\[hand-raise:(\d+)\]\]\s*/;
  const scopedMessages = messages.filter(message => {
    const match = message.content.match(handRaiseMarker);
    if (handRaiseId != null) return Number.isInteger(handRaiseId) && handRaiseId > 0 && match?.[1] === String(handRaiseId);
    return !match;
  });
  // Filtered hand-raise polling displays only one subset of a private thread.
  // It must not mark unrelated direct messages as read. Only full conversation
  // reads advance the durable per-user cursor.
  if (handRaiseId == null && groupId != null) {
    await pool.query("INSERT INTO message_conversation_reads (user_id,conversation_type,conversation_id,last_read_at) VALUES ($1,'group',$2,now()) ON CONFLICT (user_id,conversation_type,conversation_id) DO UPDATE SET last_read_at=GREATEST(message_conversation_reads.last_read_at,EXCLUDED.last_read_at)", [currentUser.id, groupId]);
  } else if (handRaiseId == null && recipientId != null) {
    await pool.query("INSERT INTO message_conversation_reads (user_id,conversation_type,conversation_id,last_read_at) VALUES ($1,'private',$2,now()) ON CONFLICT (user_id,conversation_type,conversation_id) DO UPDATE SET last_read_at=GREATEST(message_conversation_reads.last_read_at,EXCLUDED.last_read_at)", [currentUser.id, recipientId]);
  }

  // The read cursor is a durable per-user receipt: every message at or before
  // that timestamp has been displayed in this conversation. Return the readers
  // alongside each message so the sender sees a receipt on the exact message.
  const readCursors = groupId != null
    ? await pool.query(
        "SELECT user_id,last_read_at FROM message_conversation_reads WHERE conversation_type='group' AND conversation_id=$1",
        [groupId],
      )
    : await pool.query(
        // A private conversation has one read cursor per participant. Fetch both
        // directions so each message reports the other participant's receipt,
        // regardless of who originally opened the conversation.
        "SELECT user_id,last_read_at FROM message_conversation_reads WHERE conversation_type='private' AND ((conversation_id=$1 AND user_id=$2) OR (conversation_id=$2 AND user_id=$1))",
        [currentUser.id, recipientId],
      );
  const readers = readCursors.rows.map(row => ({
    userId: Number(row.user_id),
    lastReadAt: new Date(row.last_read_at).getTime(),
  }));
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
  res.json(scopedMessages.map(message => ({
    ...message,
    content: message.content.replace(handRaiseMarker, ""),
    createdAt: message.createdAt.toISOString(),
    readByUserIds: readers
      .filter(reader => reader.userId !== Number(message.senderId) && reader.lastReadAt >= new Date(message.createdAt).getTime())
      .map(reader => reader.userId),
  })));
});

// POST /messages — Send a message
router.delete("/messages/:id", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!, id = Number(req.params.id);
  const [message] = await db.select().from(messagesTable).where(eq(messagesTable.id, id));
  if (!message) { res.status(404).json({ error: "Message not found" }); return; }
  if (isProfileOnlyTeacher(user) && message.groupId != null) { res.status(403).json({ error: "Group messages are unavailable until teacher authorization." }); return; }
  let allowed = message.senderId === user.id || isOwnerRole(user.role);
  if (message.groupId) {
    const [group] = await db.select().from(studyGroupsTable).where(eq(studyGroupsTable.id, message.groupId));
    let managerAuthorized = false;
    if (group && canAccessManager(user) && await managerHasPermission(user, "groups.manage")) {
      if (group.creatorId === user.id) managerAuthorized = true;
      else {
        const [creator] = await db.select({ role: usersTable.role, isManager: usersTable.isManager, managerLevel: usersTable.managerLevel }).from(usersTable).where(eq(usersTable.id, group.creatorId));
        managerAuthorized = Boolean(creator && canModerateUser(user, creator));
      }
    }
    allowed = Boolean(group) && (message.senderId === user.id || isOwnerRole(user.role) || group!.creatorId === user.id || managerAuthorized);
  }
  if (!allowed) { res.status(403).json({ error: "You can delete your own messages. Another member's group message requires group ownership or an authorized manager with groups.manage in scope." }); return; }
  const deleted = await db.delete(messagesTable).where(eq(messagesTable.id, id)).returning({ id: messagesTable.id });
  if (!deleted.length) { res.status(409).json({ error: "Message was not deleted. Refresh and try again." }); return; }
  const storageKey = message.mediaUrl?.match(/\/api\/messages\/media\/([a-f0-9-]{36})/i)?.[1];
  if (storageKey) {
    try { await removeStoredMedia(storageKey); }
    catch (error) {
      res.status(200).json({ ok: true, deleted: true, mediaCleanupPending: true, warning: error instanceof Error ? error.message : "Attachment cleanup failed." });
      return;
    }
  }
  res.status(200).json({ ok: true, deleted: true });
});

router.post("/messages", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;

  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (isProfileOnlyTeacher(currentUser) && parsed.data.groupId != null) {
    res.status(403).json({ error: "Applicants may use direct Profile Hub conversations only; group chat unlocks after teacher authorization." });
    return;
  }

  if (parsed.data.groupId != null && !(await canAccessGroup(parsed.data.groupId, currentUser))) {
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
    const settingsOverride = await canOverrideGroupSettings(parsed.data.groupId, currentUser);
    if ((parsed.data.type === "voice" || parsed.data.type === "media") && (control?.mediaBlocked || control?.blocked || control?.suspended || control?.muted || (settings?.allowMedia === false && !settingsOverride))) { res.status(403).json({ error: "Media uploads are disabled for you in this group" }); return; }
    if (settings?.announcementsOnly && !(settingsOverride || currentUser.isPrefect === true)) {
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

  // AI-assisted safety screening is additive: preserve normal chat delivery and
  // never punish or block a user based only on a model prediction. A positive
  // finding becomes a reviewable flag in the existing Content Safety dashboard.
  if (typeof message.content === "string" && message.content.trim().length >= 3) {
    void (async () => {
      try {
        const ai = await getAIProvider();
        const result = await ai.moderateContent(message.content.slice(0, 4000));
        const allowedSeverities = new Set(["low", "medium", "high", "critical"]);
        if (result?.flagged === true) {
          await db.insert(contentFlagsTable).values({
            contentType: "message",
            contentId: message.id,
            contentText: message.content.slice(0, 500),
            reason: String(result.reason || "ELIDEMS AI detected content for human review").slice(0, 500),
            severity: allowedSeverities.has(result.severity) ? result.severity : "medium",
            detectedBy: "ai:auto",
            status: "pending",
          });
        }
      } catch {
        // Moderation-provider outages must not break messaging. User reports
        // and existing rule-based safety controls remain available.
      }
    })();
  }

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
  const reporter = req.currentUser!;
  const isGroupMessageVisible = Boolean(message && message.groupId != null && await canAccessGroup(message.groupId, reporter));
  const otherParticipantId = message
    ? Number(message.senderId) === reporter.id ? message.recipientId : message.senderId
    : null;
  const isPrivateMessageVisible = Boolean(message && message.groupId == null && message.recipientId != null &&
    (Number(message.senderId) === reporter.id || Number(message.recipientId) === reporter.id) &&
    otherParticipantId != null && await canViewPrivateConversation(reporter, Number(otherParticipantId)));
  if (!message || (!isGroupMessageVisible && !isPrivateMessageVisible)) {
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
