import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, followsTable, notificationPreferencesTable, notificationsTable, usersTable, lessonsTable, contentCommentsTable, moderationActionsTable, chatPollsTable, chatPollOptionsTable, chatPollVotesTable, broadcastsTable, broadcastRecipientsTable, communitiesTable, communityGroupsTable, messagesTable, studyGroupMembersTable } from "@workspace/db";
import { requireAuth, canAccessManager, isOwnerRole } from "../lib/auth-middleware";

const router = Router();
const manager = (u:any) => canAccessManager(u) || u?.isPrefect === true;
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

router.get("/content-comments/:contentType/:contentId", requireAuth, async(req,res)=>{const rows=await db.select().from(contentCommentsTable).where(and(eq(contentCommentsTable.contentType,String(req.params.contentType)),eq(contentCommentsTable.contentId,Number(req.params.contentId)))).orderBy(desc(contentCommentsTable.createdAt));res.json(rows);});\nrouter.post("/content-comments", requireAuth, async(req,res):Promise<void>=>{
 const {contentType,contentId,body}=req.body??{}; if(!["lesson","exercise","assignment","activity"].includes(contentType)||!Number.isInteger(Number(contentId))||typeof body!=="string"||!body.trim()){res.status(400).json({error:"contentType, contentId and body are required"});return;}
 if(!manager(req.currentUser)){res.status(403).json({error:"Staff access required"});return;}
 const [row]=await db.insert(contentCommentsTable).values({authorId:req.currentUser!.id,contentType,contentId:Number(contentId),body:body.trim().slice(0,4000)}).returning();
 if(contentType==="lesson"){const [lesson]=await db.select({teacherId:lessonsTable.teacherId}).from(lessonsTable).where(eq(lessonsTable.id,Number(contentId)));if(lesson) await db.insert(notificationsTable).values({recipientId:lesson.teacherId,title:"New content comment",message:`${req.currentUser!.name} commented on a lesson.`,type:"content_comment"});}
 res.status(201).json(row);
});

router.post("/manager/users/:id/action", requireAuth, async(req,res):Promise<void>=>{
 if(!canAccessManager(req.currentUser!)){res.status(403).json({error:"Manager access required"});return;}
 const targetId=Number(req.params.id), action=String(req.body?.action??""); if(!Number.isInteger(targetId)||!["block","suspend","promote_prefect","warn","comment"].includes(action)){res.status(400).json({error:"Invalid moderation action"});return;}
 if(targetId===req.currentUser!.id){res.status(400).json({error:"You cannot moderate yourself"});return;}
 const [target]=await db.select().from(usersTable).where(eq(usersTable.id,targetId));if(!target){res.status(404).json({error:"User not found"});return;}
 if(isOwnerRole(target.role)&&!isOwnerRole(req.currentUser!.role)){res.status(403).json({error:"Owner account protected"});return;}
 const note=typeof req.body?.note==="string"?req.body.note.trim().slice(0,1000):null;
 if(action==="block") await db.update(usersTable).set({isBlocked:true}).where(eq(usersTable.id,targetId));
 if(action==="suspend") await db.update(usersTable).set({isSuspended:true}).where(eq(usersTable.id,targetId));
 if(action==="promote_prefect") await db.update(usersTable).set({isPrefect:true}).where(eq(usersTable.id,targetId));
 await db.insert(moderationActionsTable).values({actorId:req.currentUser!.id,targetUserId:targetId,action,note});
 if(["warn","comment","block","suspend","promote_prefect"].includes(action)) await db.insert(notificationsTable).values({recipientId:targetId,title:action==="warn"?"Account warning":"Account update",message:note??`A manager performed: ${action.replace("_"," ")}.`,type:"moderation"});
 res.json({ok:true});
});
router.post("/manager/users/:id/unblock", requireAuth, async(req,res):Promise<void>=>{if(!canAccessManager(req.currentUser!)){res.status(403).json({error:"Manager access required"});return;}await db.update(usersTable).set({isBlocked:false,isSuspended:false}).where(eq(usersTable.id,Number(req.params.id)));res.json({ok:true});});

export default router;

router.get("/chat/groups/:groupId/polls", requireAuth, async(req,res)=>{
 const rows=await db.select().from(chatPollsTable).where(eq(chatPollsTable.groupId,Number(req.params.groupId))).orderBy(desc(chatPollsTable.createdAt));
 const out=await Promise.all(rows.map(async poll=>({poll,options:await db.select().from(chatPollOptionsTable).where(eq(chatPollOptionsTable.pollId,poll.id))})));
 res.json(out);
});
router.post("/chat/groups/:groupId/polls", requireAuth, async(req,res):Promise<void>=>{
 const groupId=Number(req.params.groupId), user=req.currentUser!, question=typeof req.body?.question==="string"?req.body.question.trim():"", options=Array.isArray(req.body?.options)?req.body.options.filter((x:any)=>typeof x==="string"&&x.trim()).slice(0,20):[];
 const member=await db.select().from(studyGroupMembersTable).where(and(eq(studyGroupMembersTable.groupId,groupId),eq(studyGroupMembersTable.userId,user.id)));
 if(!member[0]||!question||options.length<2){res.status(400).json({error:"Group member access and at least two options are required"});return;}
 const [poll]=await db.insert(chatPollsTable).values({groupId,creatorId:user.id,question,allowMultiple:Boolean(req.body?.allowMultiple),anonymous:Boolean(req.body?.anonymous)}).returning();
 await db.insert(chatPollOptionsTable).values(options.map((label:string,i:number)=>({pollId:poll.id,label,position:i})));
 res.status(201).json({poll,options:await db.select().from(chatPollOptionsTable).where(eq(chatPollOptionsTable.pollId,poll.id))});
});
router.post("/chat/polls/:pollId/vote", requireAuth, async(req,res):Promise<void>=>{
 const pollId=Number(req.params.pollId), user=req.currentUser!, optionIds=Array.isArray(req.body?.optionIds)?req.body.optionIds.map(Number).filter(Number.isInteger):[];
 const [poll]=await db.select().from(chatPollsTable).where(eq(chatPollsTable.id,pollId)); if(!poll||poll.closed){res.status(404).json({error:"Poll unavailable"});return;}
 if(optionIds.length===0||(!poll.allowMultiple&&optionIds.length>1)){res.status(400).json({error:"Choose a valid option"});return;}
 const valid=await db.select().from(chatPollOptionsTable).where(eq(chatPollOptionsTable.pollId,pollId)); const validIds=new Set(valid.map(o=>o.id)); if(optionIds.some(id=>!validIds.has(id))){res.status(400).json({error:"Invalid poll option"});return;}
 await db.delete(chatPollVotesTable).where(and(eq(chatPollVotesTable.pollId,pollId),eq(chatPollVotesTable.userId,user.id)));
 await db.insert(chatPollVotesTable).values(optionIds.map(optionId=>({pollId,optionId,userId:user.id})));
 res.json({ok:true});
});

router.get("/communities", requireAuth, async(_req,res)=>{
 const rows=await db.select().from(communitiesTable).orderBy(desc(communitiesTable.createdAt));
 res.json(rows);
});
router.post("/communities", requireAuth, async(req,res):Promise<void>=>{
 const user=req.currentUser!; if(!canAccessManager(user)){res.status(403).json({error:"Manager access required"});return;}
 const name=typeof req.body?.name==="string"?req.body.name.trim():""; if(!name){res.status(400).json({error:"Community name required"});return;}
 const [row]=await db.insert(communitiesTable).values({name,description:typeof req.body?.description==="string"?req.body.description:null,createdBy:user.id}).returning();res.status(201).json(row);
});
router.post("/communities/:id/groups", requireAuth, async(req,res):Promise<void>=>{
 const user=req.currentUser!; if(!canAccessManager(user)){res.status(403).json({error:"Manager access required"});return;}
 const communityId=Number(req.params.id),groupId=Number(req.body?.groupId); if(!groupId){res.status(400).json({error:"groupId required"});return;}
 const [row]=await db.insert(communityGroupsTable).values({communityId,groupId,isAnnouncementGroup:Boolean(req.body?.isAnnouncementGroup)}).returning();res.status(201).json(row);
});

router.post("/broadcasts", requireAuth, async(req,res):Promise<void>=>{
 const user=req.currentUser!, recipientIds=Array.isArray(req.body?.recipientIds)?req.body.recipientIds.map(Number).filter(Number.isInteger):[], content=typeof req.body?.content==="string"?req.body.content.trim():"";
 if(!content||recipientIds.length===0){res.status(400).json({error:"content and recipients are required"});return;}
 const [broadcast]=await db.insert(broadcastsTable).values({senderId:user.id,content}).returning();
 await db.insert(broadcastRecipientsTable).values(recipientIds.slice(0,1024).map(recipientId=>({broadcastId:broadcast.id,recipientId})));
 await db.insert(messagesTable).values(recipientIds.slice(0,1024).map(recipientId=>({senderId:user.id,senderName:user.name,senderRole:user.role,content,type:"text",groupId:null,recipientId})));
 res.status(201).json({broadcast,recipientCount:Math.min(recipientIds.length,1024)});
});
