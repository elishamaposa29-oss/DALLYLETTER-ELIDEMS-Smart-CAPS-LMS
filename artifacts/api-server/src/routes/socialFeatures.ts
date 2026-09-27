import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, followsTable, notificationPreferencesTable, notificationsTable, usersTable, lessonsTable, contentCommentsTable, moderationActionsTable } from "@workspace/db";
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

router.post("/content-comments", requireAuth, async(req,res):Promise<void>=>{
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