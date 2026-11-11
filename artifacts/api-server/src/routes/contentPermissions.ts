import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth, canAccessManager, isOwnerRole } from "../lib/auth-middleware";
import { managerHasPermission } from "../lib/manager-permission-policy";
import { canModerateUser, isTeacherRestricted } from "../lib/role-access";

const router=Router();
const actions=new Set(["edit","create_exercise","delete","notify"]);
const contentTypes=new Set(["lesson","exercise"]);

router.post("/content-permissions",requireAuth,async(req,res):Promise<void>=>{
  const actor=req.currentUser!;
  if(actor.role==="teacher"&&isTeacherRestricted(actor)){res.status(403).json({error:"Pending teachers cannot request teaching-content permissions until their application is approved."});return;}
  if(actor.role!=="teacher"&&!isOwnerRole(actor.role)&&!canAccessManager(actor)){res.status(403).json({error:"Teacher or authorized academic staff access required"});return;}
  const contentType=String(req.body?.contentType||"");
  const contentId=Number(req.body?.contentId);
  const requestedAction=String(req.body?.requestedAction||"");
  const allowedActions=contentType==="lesson"?actions:new Set(["edit","delete"]);
  if(!contentTypes.has(contentType)||!Number.isInteger(contentId)||contentId<=0||!allowedActions.has(requestedAction)){res.status(400).json({error:"Invalid permission request"});return;}
  const table=contentType==="lesson"?"lessons":"exercises";
  const ownerColumn=contentType==="lesson"?"teacher_id":"created_by";
  const result=await pool.query(`SELECT ${ownerColumn} AS owner_id FROM ${table} WHERE id=$1 LIMIT 1`,[contentId]);
  const ownerId=result.rows[0]?.owner_id;
  if(!ownerId){res.status(404).json({error:"Content not found"});return;}
  const managerPermissionByAction:Record<string,string>=contentType==="lesson"
    ? {edit:"lessons.edit",create_exercise:"users.override.teacher",delete:"lessons.delete",notify:"lessons.notify"}
    : {edit:"users.override.teacher",delete:"users.override.teacher"};
  const managerPermission=managerPermissionByAction[requestedAction];
  const ownerResult=canAccessManager(actor)&&Number(ownerId)!==actor.id?await pool.query("SELECT role,is_manager AS \"isManager\",manager_level AS \"managerLevel\" FROM users WHERE id=$1 LIMIT 1",[Number(ownerId)]):{rows:[]};
  const contentOwner=ownerResult.rows[0];
  const managerInScope=Boolean(contentOwner&&canModerateUser(actor,{role:contentOwner.role,isManager:contentOwner.isManager,managerLevel:contentOwner.managerLevel}));
  const managerAuthorized=canAccessManager(actor)&&Boolean(managerPermission)&&managerInScope&&await managerHasPermission(actor,managerPermission);
  if(Number(ownerId)===actor.id||isOwnerRole(actor.role)||managerAuthorized){res.status(200).json({ok:true,alreadyAuthorized:true});return;}
  if(canAccessManager(actor)&&!managerInScope){res.status(403).json({error:"This content owner is outside your management authority. You cannot request or receive delegated access to this content."});return;}
  if(canAccessManager(actor)){res.status(403).json({error:"Content-owner approval cannot replace an Owner-granted manager permission. Ask the Owner to grant the required manager capability directly.",permission:managerPermission});return;}
  const existing=await pool.query("SELECT id,status FROM content_permission_requests WHERE requester_id=$1 AND content_type=$2 AND content_id=$3 AND requested_action=$4 AND status='pending' LIMIT 1",[actor.id,contentType,contentId,requestedAction]);
  if(existing.rows[0]){res.json({ok:true,pending:true,id:existing.rows[0].id});return;}
  const inserted=await pool.query("INSERT INTO content_permission_requests(requester_id,owner_id,content_type,content_id,requested_action) VALUES($1,$2,$3,$4,$5) RETURNING id",[actor.id,ownerId,contentType,contentId,requestedAction]);
  await pool.query("INSERT INTO activity_log(type,description,actor_name) VALUES($1,$2,$3)",["content_permission_requested","Permission request #"+inserted.rows[0].id+": "+contentType+" #"+contentId+", action "+requestedAction,actor.name]);
  res.status(201).json({ok:true,pending:true,id:inserted.rows[0].id});
});

router.get("/content-permissions",requireAuth,async(req,res):Promise<void>=>{
  const actor=req.currentUser!;
  const rows=await pool.query(`
    SELECT cp.*,
      requester.name AS requester_name,
      CASE WHEN cp.content_type='lesson' THEN lesson.title ELSE exercise.title END AS content_title,
      CASE WHEN cp.content_type='lesson' THEN lesson.subject ELSE NULL END AS content_subject,
      CASE WHEN cp.content_type='lesson' THEN lesson.grade ELSE NULL END AS content_grade
    FROM content_permission_requests cp
    LEFT JOIN users requester ON requester.id=cp.requester_id
    LEFT JOIN lessons lesson ON cp.content_type='lesson' AND lesson.id=cp.content_id
    LEFT JOIN exercises exercise ON cp.content_type='exercise' AND exercise.id=cp.content_id
    WHERE cp.owner_id=$1 AND cp.status='pending'
    ORDER BY cp.created_at DESC
  `,[actor.id]);
  res.json(rows.rows);
});

// GET /content-permissions/mine — requester can track pending, approved and declined decisions.
router.get("/content-permissions/mine",requireAuth,async(req,res):Promise<void>=>{
  const actor=req.currentUser!;
  const rows=await pool.query(
    "SELECT cp.*, owner.name AS owner_name, CASE WHEN cp.content_type='lesson' THEN lesson.title ELSE exercise.title END AS content_title, EXISTS(SELECT 1 FROM activity_log al WHERE al.type='content_permission_reported_to_manager' AND position('"requestId":' || cp.id::text in al.description)>0) AS reported FROM content_permission_requests cp LEFT JOIN users owner ON owner.id=cp.owner_id LEFT JOIN lessons lesson ON cp.content_type='lesson' AND lesson.id=cp.content_id LEFT JOIN exercises exercise ON cp.content_type='exercise' AND exercise.id=cp.content_id WHERE cp.requester_id=$1 ORDER BY cp.created_at DESC LIMIT 100",
    [actor.id]
  );
  res.json(rows.rows);
});
router.patch("/content-permissions/:id",requireAuth,async(req,res):Promise<void>=>{
  const actor=req.currentUser!;
  const id=Number(req.params.id); const status=String(req.body?.status||"");
  if(!Number.isInteger(id)||!["approved","declined"].includes(status)){res.status(400).json({error:"Invalid permission response"});return;}
  const result=await pool.query("UPDATE content_permission_requests SET status=$1,responded_at=now() WHERE id=$2 AND owner_id=$3 AND status='pending' RETURNING *",[status,id,actor.id]);
  if(!result.rows[0]){res.status(404).json({error:"Permission request not found"});return;}
  const decision=result.rows[0];
  await pool.query("INSERT INTO activity_log(type,description,actor_name) VALUES($1,$2,$3)",[status==="approved"?"content_permission_approved":"content_permission_declined","Permission request #"+id+": "+decision.content_type+" #"+decision.content_id+", action "+decision.requested_action+", "+status,actor.name]);
  await pool.query("INSERT INTO notifications(recipient_id,title,message,type,is_read,link) VALUES($1,$2,$3,$4,false,$5)",[Number(decision.requester_id),"approved"===status?"Content permission approved":"Content permission declined","Your request to "+decision.requested_action.replace(/_/g," ")+" "+decision.content_type+" #"+decision.content_id+" was "+status+".","content_permission","/operations"]);
  res.json(decision);
});


router.post("/content-permissions/:id/report",requireAuth,async(req,res):Promise<void>=>{
  const actor=req.currentUser!;
  const id=Number(req.params.id);
  const message=typeof req.body?.message==="string"?req.body.message.trim().slice(0,1000):"";
  if(!Number.isInteger(id)||id<=0){res.status(400).json({error:"Invalid permission request"});return;}
  const found=await pool.query("SELECT id,requester_id,owner_id,content_type,content_id,requested_action,status FROM content_permission_requests WHERE id=$1 LIMIT 1",[id]);
  const item=found.rows[0];
  if(!item||Number(item.requester_id)!==actor.id){res.status(404).json({error:"Permission request not found"});return;}
  if(item.status!=="declined"){res.status(409).json({error:"Only declined requests can be reported"});return;}
  const priorReport=await pool.query("SELECT id FROM activity_log WHERE type=$1 AND position($2 in description)>0 LIMIT 1",["content_permission_reported_to_manager",'"requestId":'+id]);
  if(priorReport.rows.length){res.status(200).json({ok:true,reported:true,alreadyReported:true});return;}
  const details={requestId:id,requesterId:actor.id,ownerId:Number(item.owner_id),contentType:item.content_type,contentId:Number(item.content_id),requestedAction:item.requested_action,message};
  await pool.query("INSERT INTO activity_log(type,description,actor_name) VALUES($1,$2,$3)",["content_permission_reported_to_manager","Manager review requested for declined permission: "+JSON.stringify(details),actor.name]);
  await pool.query(
    "INSERT INTO notifications(recipient_id,title,message,type,is_read,link) SELECT u.id,$1,$2,$3,false,CASE WHEN lower(u.role) IN ('owner','platform_owner') THEN '/admin/notifications' ELSE '/manager/notifications' END FROM users u WHERE lower(u.role) IN ('owner','platform_owner') OR ((lower(u.role) IN ('manager','senior_manager','junior_manager') OR u.is_manager=true) AND COALESCE(u.is_blocked,false)=false AND COALESCE(u.is_suspended,false)=false AND (lower(u.role)<>'teacher' OR COALESCE(u.teacher_application_status,'') NOT IN ('draft','pending_review','rejected_pending_conversion')) AND EXISTS (SELECT 1 FROM manager_permission_grants g WHERE g.manager_user_id=u.id AND g.permission_key='moderation.view' AND g.granted=true) AND EXISTS (SELECT 1 FROM manager_permission_grants notification_grant WHERE notification_grant.manager_user_id=u.id AND notification_grant.permission_key='notifications.view' AND notification_grant.granted=true))",
    ["Permission decision needs management review",actor.name+" reported declined permission request #"+id+". "+(message||"Please review the request."),"content_permission_report"]
  );
  res.status(201).json({ok:true,reported:true});
});

export default router;
