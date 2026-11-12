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
    "SELECT cp.*, owner.name AS owner_name, CASE WHEN cp.content_type='lesson' THEN lesson.title ELSE exercise.title END AS content_title, EXISTS(SELECT 1 FROM activity_log al WHERE al.type='content_permission_reported_to_manager' AND position('Manager review requested for declined permission: {\"requestId\":' || cp.id::text || ',' in al.description)>0) AS reported FROM content_permission_requests cp LEFT JOIN users owner ON owner.id=cp.owner_id LEFT JOIN lessons lesson ON cp.content_type='lesson' AND lesson.id=cp.content_id LEFT JOIN exercises exercise ON cp.content_type='exercise' AND exercise.id=cp.content_id WHERE cp.requester_id=$1 ORDER BY cp.created_at DESC LIMIT 100",
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
  const priorReport=await pool.query("SELECT id FROM activity_log WHERE type=$1 AND position($2 in description)>0 LIMIT 1",["content_permission_reported_to_manager",'Manager review requested for declined permission: {"requestId":'+id+',']);
  if(priorReport.rows.length){res.status(200).json({ok:true,reported:true,alreadyReported:true});return;}
  const details={requestId:id,requesterId:actor.id,ownerId:Number(item.owner_id),contentType:item.content_type,contentId:Number(item.content_id),requestedAction:item.requested_action,message};
  await pool.query("INSERT INTO activity_log(type,description,actor_name) VALUES($1,$2,$3)",["content_permission_reported_to_manager","Manager review requested for declined permission: "+JSON.stringify(details),actor.name]);
  const notificationTitle="Permission decision needs management review";
  const notificationMessage=actor.name+" reported declined permission request #"+id+". "+(message||"Please review the request.");
  await pool.query(
    "INSERT INTO notifications(recipient_id,title,message,type,is_read,link) SELECT u.id,$1,$2,$3,false,'/admin/notifications' FROM users u WHERE lower(u.role) IN ('owner','platform_owner')",
    [notificationTitle,notificationMessage,"content_permission_report"]
  );
  const [contentOwner]= (await pool.query("SELECT id,role,is_manager AS \"isManager\",manager_level AS \"managerLevel\" FROM users WHERE id=$1 LIMIT 1",[Number(item.owner_id)])).rows;
  if(contentOwner){
    const managers=(await pool.query("SELECT id,role,is_manager AS \"isManager\",manager_level AS \"managerLevel\" FROM users WHERE (lower(role) IN ('manager','senior_manager','junior_manager') OR is_manager=true) AND COALESCE(is_blocked,false)=false AND COALESCE(is_suspended,false)=false AND (lower(role)<>'teacher' OR COALESCE(teacher_application_status,'') NOT IN ('draft','pending_review','rejected_pending_conversion'))")).rows;
    for(const manager of managers){
      const managerActor={id:Number(manager.id),role:manager.role,isManager:manager.isManager===true,managerLevel:manager.managerLevel} as any;
      if(!canModerateUser(managerActor,contentOwner))continue;
      if(!(await managerHasPermission(managerActor,"moderation.view"))||!(await managerHasPermission(managerActor,"notifications.view")))continue;
      await pool.query("INSERT INTO notifications(recipient_id,title,message,type,is_read,link) VALUES($1,$2,$3,$4,false,'/manager/notifications')",[Number(manager.id),notificationTitle,notificationMessage,"content_permission_report"]);
    }
  }
  res.status(201).json({ok:true,reported:true});
});


router.get("/content-permissions/reports",requireAuth,async(req,res):Promise<void>=>{
 const actor=req.currentUser!,owner=isOwnerRole(actor.role);
 if(!owner&&(!canAccessManager(actor)||!(await managerHasPermission(actor,"moderation.view"))||!(await managerHasPermission(actor,"notifications.view")))){res.status(403).json({error:"Owner or manager with moderation.view and notifications.view is required."});return;}
 const reports=await pool.query("SELECT id,description,actor_name,created_at FROM activity_log WHERE type='content_permission_reported_to_manager' ORDER BY created_at DESC LIMIT 250");
 const rows=[];
 for(const report of reports.rows){
  const prefix="Manager review requested for declined permission: ",raw=String(report.description||"");
  if(!raw.startsWith(prefix))continue;
  let details:any;try{details=JSON.parse(raw.slice(prefix.length));}catch{continue;}
  const requesterId=Number(details.requesterId),requestId=Number(details.requestId);
  if(!Number.isSafeInteger(requesterId)||!Number.isSafeInteger(requestId))continue;
  const target=await pool.query("SELECT id,role,is_manager AS \"isManager\",manager_level AS \"managerLevel\",name FROM users WHERE id=$1 LIMIT 1",[requesterId]);
  if(!target.rows[0]||(!owner&&!canModerateUser(actor,target.rows[0])))continue;
  const reviewed=await pool.query("SELECT description,created_at FROM activity_log WHERE type='content_permission_report_reviewed' AND position($1 in description)>0 ORDER BY created_at DESC LIMIT 1",['"requestId":'+requestId+',']);
  let reviewNote:string|null=null;if(reviewed.rows[0]){try{reviewNote=String(JSON.parse(String(reviewed.rows[0].description).replace("Manager review completed: ","")).note||"Review recorded");}catch{reviewNote="Review recorded";}}
  rows.push({...details,reportId:Number(report.id),reportedBy:report.actor_name,reportedAt:report.created_at,requesterName:target.rows[0].name,reviewed:Boolean(reviewed.rows[0]),reviewedAt:reviewed.rows[0]?.created_at||null,reviewNote});
 }
 res.setHeader("Cache-Control","private,no-store");res.json(rows);
});
router.post("/content-permissions/:id/report/review",requireAuth,async(req,res):Promise<void>=>{
 const actor=req.currentUser!,owner=isOwnerRole(actor.role),id=Number(req.params.id),note=typeof req.body?.note==="string"?req.body.note.trim().slice(0,1000):"";
 if(!Number.isInteger(id)||id<=0||note.length<3){res.status(400).json({error:"A valid request ID and review note of at least 3 characters are required."});return;}
 if(!owner&&(!canAccessManager(actor)||!(await managerHasPermission(actor,"moderation.view"))||!(await managerHasPermission(actor,"notifications.view")))){res.status(403).json({error:"Owner or manager with moderation.view and notifications.view is required."});return;}
 const prefix="Manager review requested for declined permission: ";
 const report=await pool.query("SELECT description FROM activity_log WHERE type='content_permission_reported_to_manager' AND position($1 in description)>0 ORDER BY created_at DESC LIMIT 1",['"requestId":'+id+',']);
 if(!report.rows[0]){res.status(404).json({error:"Escalated permission report not found."});return;}
 let details:any;try{details=JSON.parse(String(report.rows[0].description).slice(prefix.length));}catch{res.status(409).json({error:"The escalation record is invalid."});return;}
 const target=await pool.query("SELECT id,role,is_manager AS \"isManager\",manager_level AS \"managerLevel\" FROM users WHERE id=$1 LIMIT 1",[Number(details.requesterId)]);
 if(!target.rows[0]||(!owner&&!canModerateUser(actor,target.rows[0]))){res.status(404).json({error:"Escalated report is outside your management scope."});return;}
 const prior=await pool.query("SELECT id FROM activity_log WHERE type='content_permission_report_reviewed' AND position($1 in description)>0 LIMIT 1",['"requestId":'+id+',']);
 if(prior.rows[0]){res.status(200).json({ok:true,reviewed:true,alreadyReviewed:true});return;}
 await pool.query("INSERT INTO activity_log(type,description,actor_name) VALUES($1,$2,$3)",["content_permission_report_reviewed","Manager review completed: "+JSON.stringify({requestId:id,reviewerId:actor.id,note}),actor.name]);
 await pool.query("INSERT INTO notifications(recipient_id,title,message,type,is_read,link) VALUES($1,$2,$3,$4,false,$5)",[Number(details.requesterId),"Permission report reviewed","Management reviewed your report for declined content permission request #"+id+". Note: "+note,"content_permission_report_reviewed","/operations"]);
 res.status(201).json({ok:true,reviewed:true});
});

export default router;
