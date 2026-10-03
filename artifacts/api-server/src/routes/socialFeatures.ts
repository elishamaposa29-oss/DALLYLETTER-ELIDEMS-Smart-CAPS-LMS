import { Router } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, followsTable, notificationPreferencesTable, notificationsTable, usersTable, lessonsTable, contentCommentsTable, moderationActionsTable, auditLogsTable, chatPollsTable, chatPollOptionsTable, chatPollVotesTable, broadcastsTable, broadcastRecipientsTable, communitiesTable, communityGroupsTable, messagesTable, studyGroupMembersTable, studyGroupsTable, groupSettingsTable } from "@workspace/db";
import { requireAuth, canAccessManager, isOwnerRole } from "../lib/auth-middleware";

const router = Router();
const manager = (u:any) => canAccessManager(u);
const targetTypes = new Set(["teacher","prefect","manager","event","subject"]);

router.get("/follows", requireAuth, async (req,res) => {
  const rows=await db.select().from(followsTable).where(eq(followsTable.followerId,req.currentUser!.id)).orderBy(desc(followsTable.createdAt));
  res.json(rows);
});
router.post("/follows", requireAuth, async (req,res):Promise<void> => {
  const {targetType,targetUserId,targetKey,targetName}=req.body??{};
  if(!targetTypes.has(targetType)||typeof targetName!=="string"||!targetName.trim()){res.status(400).json({error:"targetType and targetName are required"});return;}
  if(["teacher","prefect","manager"].includes(targetType)&&(!Number.isInteger(Number(targetUserId))||Number(targetUserId)<=0)){res.status(400).json({error:"targetUserId is required"});return;}
  const existing=await db.select().from(followsTable).where(and(eq(followsTable.followerId,req.currentUser!.id),eq(followsTable.targetType,targetType), targetUserId?eq(followsTable.targetUserId,Number(targetUserId)):eq(followsTable.targetKey,String(targetKey??"")))).limit(1);
  if(existing[0]){res.json(existing[0]);return;}
  const [row]=await db.insert(followsTable).values({followerId:req.currentUser!.id,targetType,targetUserId:targetUserId?Number(targetUserId):null,targetKey:targetKey?String(targetKey):null,targetName:targetName.trim()}).returning();
  res.status(201).json(row);
});
router.delete("/follows/:id", requireAuth, async(req,res)=>{await db.delete(followsTable).where(and(eq(followsTable.id,Number(req.params.id)),eq(followsTable.followerId,req.currentUser!.id)));res.sendStatus(204);});
router.patch("/follows/:id", requireAuth, async(req,res):Promise<void>=>{const [row]=await db.update(followsTable).set({notificationsEnabled:Boolean(req.body?.notificationsEnabled)}).where(and(eq(followsTable.id,Number(req.params.id)),eq(followsTable.followerId,req.currentUser!.id))).returning();if(!row){res.status(404).json({error:"Follow not found"});return;}res.json(row);});

router.get("/notification-preferences", requireAuth, async(req,res)=>{
 const [row]=await db.select().from(notificationPreferencesTable).where(eq(notificationPreferencesTable.userId,req.currentUser!.id));
 res.json(row??{pushEnabled:true,soundEnabled:true,followNotificationsEnabled:true});
});
router.patch("/notification-preferences", requireAuth, async(req,res)=>{
 const values={pushEnabled:req.body?.pushEnabled!==false,soundEnabled:req.body?.soundEnabled!==false,followNotificationsEnabled:req.body?.followNotificationsEnabled!==false};
 const [row]=await db.insert(notificationPreferencesTable).values({userId:req.currentUser!.id,...values}).onConflictDoUpdate({target:notificationPreferencesTable.userId,set:values}).returning();res.json(row);
});

router.get("/content-comments/:contentType/:contentId", requireAuth, async(req,res)=>{const rows=await db.select().from(contentCommentsTable).where(and(eq(contentCommentsTable.contentType,String(req.params.contentType)),eq(contentCommentsTable.contentId,Number(req.params.contentId)))).orderBy(desc(contentCommentsTable.createdAt));res.json(rows);});
router.post("/content-comments", requireAuth, async(req,res):Promise<void>=>{
 const {contentType,contentId,body}=req.body??{}; if(!["lesson","exercise","assignment","activity"].includes(contentType)||!Number.isInteger(Number(contentId))||typeof body!=="string"||!body.trim()){res.status(400).json({error:"contentType, contentId and body are required"});return;}
 if(!manager(req.currentUser)){res.status(403).json({error:"Staff access required"});return;}
 const [row]=await db.insert(contentCommentsTable).values({authorId:req.currentUser!.id,contentType,contentId:Number(contentId),body:body.trim().slice(0,4000)}).returning();
 if(contentType==="lesson"){const [lesson]=await db.select({teacherId:lessonsTable.teacherId}).from(lessonsTable).where(eq(lessonsTable.id,Number(contentId)));if(lesson) await db.insert(notificationsTable).values({recipientId:lesson.teacherId,title:"New content comment",message:`${req.currentUser!.name} commented on a lesson.`,type:"content_comment"});}
 res.status(201).json(row);
});

router.post("/manager/users/:id/action", requireAuth, async(req,res):Promise<void>=>{
 if(!canAccessManager(req.currentUser!)){res.status(403).json({error:"Manager access required"});return;}
 const targetId=Number(req.params.id), action=String(req.body?.action??""); if(!Number.isInteger(targetId)||!["block","suspend","promote_prefect","remove_prefect","warn","comment"].includes(action)){res.status(400).json({error:"Invalid moderation action"});return;}
 if(targetId===req.currentUser!.id){res.status(400).json({error:"You cannot moderate yourself"});return;}
 const [target]=await db.select().from(usersTable).where(eq(usersTable.id,targetId));if(!target){res.status(404).json({error:"User not found"});return;}
 if(isOwnerRole(target.role)&&!isOwnerRole(req.currentUser!.role)){res.status(403).json({error:"Owner account protected"});return;}
 const note=typeof req.body?.note==="string"?req.body.note.trim().slice(0,1000):null;
 if(action==="block") await db.update(usersTable).set({isBlocked:true}).where(eq(usersTable.id,targetId));
 if(action==="suspend") await db.update(usersTable).set({isSuspended:true}).where(eq(usersTable.id,targetId));
 if(action==="promote_prefect") await db.update(usersTable).set({isPrefect:true}).where(eq(usersTable.id,targetId));
 if(action==="remove_prefect") await db.update(usersTable).set({isPrefect:false}).where(eq(usersTable.id,targetId));
 await db.insert(moderationActionsTable).values({actorId:req.currentUser!.id,targetUserId:targetId,action,note});
 await db.insert(auditLogsTable).values({
   action: `Manager action: ${action}`,
   category: "moderation",
   performedBy: req.currentUser!.id,
   targetType: "user",
   targetId,
   details: JSON.stringify({ actorId: req.currentUser!.id, actorName: req.currentUser!.name, actorRole: req.currentUser!.role, targetUserId: targetId, action, note: note ?? null }),
 });
 if(["warn","comment","block","suspend","promote_prefect","remove_prefect"].includes(action)) await db.insert(notificationsTable).values({recipientId:targetId,title:action==="warn"?"Account warning":"Account update",message:note??`A manager performed: ${action.replace("_"," ")}.`,type:"moderation"});
 res.json({ok:true});
});
router.post("/manager/users/:id/unblock", requireAuth, async(req,res):Promise<void>=>{const actor=req.currentUser!;if(!canAccessManager(actor)){res.status(403).json({error:"Manager access required"});return;}const targetId=Number(req.params.id);if(!Number.isInteger(targetId)){res.status(400).json({error:"Invalid user id"});return;}const [target]=await db.select({id:usersTable.id,name:usersTable.name,role:usersTable.role}).from(usersTable).where(eq(usersTable.id,targetId));if(!target){res.status(404).json({error:"User not found"});return;}if(isOwnerRole(target.role)&&!isOwnerRole(actor.role)){res.status(403).json({error:"Owner account protected"});return;}await db.update(usersTable).set({isBlocked:false,isSuspended:false}).where(eq(usersTable.id,targetId));await db.insert(auditLogsTable).values({action:"Manager action: restore_access",category:"moderation",performedBy:actor.id,targetType:"user",targetId,details:JSON.stringify({actorId:actor.id,actorName:actor.name,actorRole:actor.role,targetUserId:targetId,targetName:target.name,action:"restore_access"})});await db.insert(notificationsTable).values({recipientId:targetId,title:"Account access restored",message:"Your DALLYLETTER ELIDEMS access has been restored by authorized management staff.",type:"moderation"});res.json({ok:true});});

export default router;

async function canAccessChatGroup(groupId: number, userId: number, user: NonNullable<Express.Request["currentUser"]>): Promise<boolean> {
  const [group] = await db.select().from(studyGroupsTable).where(eq(studyGroupsTable.id, groupId));
  if (!group) return false;
  if (isOwnerRole(user.role) || user.isManager || user.isPrefect || group.creatorId === userId) return true;
  const [member] = await db.select({ id: studyGroupMembersTable.id }).from(studyGroupMembersTable)
    .where(and(eq(studyGroupMembersTable.groupId, groupId), eq(studyGroupMembersTable.userId, userId)));
  return Boolean(member);
}

router.get("/chat/groups/:groupId/polls", requireAuth, async(req,res)=>{
  const groupId = Number(req.params.groupId);
  if (!Number.isInteger(groupId) || groupId <= 0 || !(await canAccessChatGroup(groupId, req.currentUser!.id, req.currentUser!))) {
    res.status(403).json({ error: "You must be a group member to view polls" });
    return;
  }
  const rows=await db.select().from(chatPollsTable).where(eq(chatPollsTable.groupId,groupId)).orderBy(desc(chatPollsTable.createdAt));
  const out=await Promise.all(rows.map(async poll=>{
    const options=await db.select().from(chatPollOptionsTable).where(eq(chatPollOptionsTable.pollId,poll.id));
    const votes=await db.select().from(chatPollVotesTable).where(eq(chatPollVotesTable.pollId,poll.id));
    return { poll, options: options.map(option => ({ ...option, voteCount: votes.filter(vote => vote.optionId === option.id).length, selected: votes.some(vote => vote.optionId === option.id && vote.userId === req.currentUser!.id) })), totalVotes: new Set(votes.map(vote => vote.userId)).size };
  }));
 res.json(out);
});
router.post("/chat/groups/:groupId/polls", requireAuth, async(req,res):Promise<void>=>{
 const groupId=Number(req.params.groupId), user=req.currentUser!, question=typeof req.body?.question==="string"?req.body.question.trim():"", options=Array.isArray(req.body?.options)?req.body.options.filter((x:any)=>typeof x==="string"&&x.trim()).slice(0,20):[];
  if(!(await canAccessChatGroup(groupId, user.id, user))||!question||options.length<2){res.status(400).json({error:"Group member access and at least two options are required"});return;}
  const [settings] = await db.select().from(groupSettingsTable).where(eq(groupSettingsTable.groupId, groupId));
  if (settings?.allowPolls === false) { res.status(403).json({ error: "Polls are disabled in this group" }); return; }
  const uniqueOptions = [...new Set(options.map((option: string) => option.trim()))];
  if (uniqueOptions.length < 2) { res.status(400).json({ error: "Poll options must be unique" }); return; }
 const [poll]=await db.insert(chatPollsTable).values({groupId,creatorId:user.id,question,allowMultiple:Boolean(req.body?.allowMultiple),anonymous:Boolean(req.body?.anonymous)}).returning();
  await db.insert(chatPollOptionsTable).values(uniqueOptions.map((label:string)=>({pollId:poll.id,label})));
 res.status(201).json({poll,options:await db.select().from(chatPollOptionsTable).where(eq(chatPollOptionsTable.pollId,poll.id))});
});
router.post("/chat/polls/:pollId/vote", requireAuth, async(req,res):Promise<void>=>{
 const pollId=Number(req.params.pollId), user=req.currentUser!, optionIds=Array.isArray(req.body?.optionIds)?req.body.optionIds.map(Number).filter(Number.isInteger):[];
 const [poll]=await db.select().from(chatPollsTable).where(eq(chatPollsTable.id,pollId)); if(!poll||poll.closed){res.status(404).json({error:"Poll unavailable"});return;}
  if (!poll.groupId || !(await canAccessChatGroup(poll.groupId, user.id, user))) { res.status(403).json({ error: "You must be a group member to vote" }); return; }
  if (new Set(optionIds).size !== optionIds.length) { res.status(400).json({ error: "Choose each option only once" }); return; }
 if(optionIds.length===0||(!poll.allowMultiple&&optionIds.length>1)){res.status(400).json({error:"Choose a valid option"});return;}
 const valid=await db.select().from(chatPollOptionsTable).where(eq(chatPollOptionsTable.pollId,pollId)); const validIds=new Set(valid.map((o: { id: number })=>o.id)); if(optionIds.some((id: number)=>!validIds.has(id))){res.status(400).json({error:"Invalid poll option"});return;}
 await db.delete(chatPollVotesTable).where(and(eq(chatPollVotesTable.pollId,pollId),eq(chatPollVotesTable.userId,user.id)));
 await db.insert(chatPollVotesTable).values(optionIds.map((optionId: number)=>({pollId,optionId,userId:user.id})));
 res.json({ok:true});
});

router.get("/communities", requireAuth, async(_req,res)=>{
 const rows=await db.select().from(communitiesTable).orderBy(desc(communitiesTable.createdAt));
 res.json(rows);
});
router.post("/communities", requireAuth, async(req,res):Promise<void>=>{
 const user=req.currentUser!; if(!canAccessManager(user)){res.status(403).json({error:"Manager access required"});return;}
 const name=typeof req.body?.name==="string"?req.body.name.trim():""; if(!name){res.status(400).json({error:"Community name required"});return;}
 const [row]=await db.insert(communitiesTable).values({name,description:typeof req.body?.description==="string"?req.body.description:null,ownerId:user.id}).returning();res.status(201).json(row);
});
router.post("/communities/:id/groups", requireAuth, async(req,res):Promise<void>=>{
 const user=req.currentUser!; if(!canAccessManager(user)){res.status(403).json({error:"Manager access required"});return;}
 const communityId=Number(req.params.id),groupId=Number(req.body?.groupId); if(!groupId){res.status(400).json({error:"groupId required"});return;}
 const [row]=await db.insert(communityGroupsTable).values({communityId,groupId}).returning();res.status(201).json(row);
});

router.post("/broadcasts", requireAuth, async(req,res):Promise<void>=>{
  const user=req.currentUser!;
  const recipientIds: number[] = Array.isArray(req.body?.recipientIds)
    ? req.body.recipientIds.map(Number).filter((id: number) => Number.isInteger(id))
    : [];
  const content=typeof req.body?.content==="string"?req.body.content.trim():"";
  if (!manager(user) && !isOwnerRole(user.role)) { res.status(403).json({ error: "Staff access required" }); return; }
 if(!content||recipientIds.length===0){res.status(400).json({error:"content and recipients are required"});return;}
  const uniqueRecipientIds = [...new Set(recipientIds)].filter(id => id !== user.id).slice(0, 1024);
  const recipients = await db.select({ id: usersTable.id }).from(usersTable).where(inArray(usersTable.id, uniqueRecipientIds));
  if (recipients.length !== uniqueRecipientIds.length) { res.status(400).json({ error: "One or more recipients do not exist" }); return; }
 const [broadcast]=await db.insert(broadcastsTable).values({senderId:user.id,name:typeof req.body?.name==="string"&&req.body.name.trim()?req.body.name.trim():"Broadcast"}).returning();
  await db.insert(broadcastRecipientsTable).values(uniqueRecipientIds.map((recipientId: number)=>({broadcastId:broadcast.id,userId:recipientId})));
  await db.insert(messagesTable).values(uniqueRecipientIds.map((recipientId: number)=>({senderId:user.id,senderName:user.name,senderRole:user.role,content,type:"text",groupId:null,recipientId})));
  res.status(201).json({broadcast,recipientCount:uniqueRecipientIds.length});
});
