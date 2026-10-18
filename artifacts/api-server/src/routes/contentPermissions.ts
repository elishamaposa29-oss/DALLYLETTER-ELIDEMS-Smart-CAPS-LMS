import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth, canAccessManager, isOwnerRole } from "../lib/auth-middleware";

const router=Router();
const actions=new Set(["edit","create_exercise","delete","notify"]);
const contentTypes=new Set(["lesson","exercise"]);

router.post("/content-permissions",requireAuth,async(req,res):Promise<void>=>{
  const actor=req.currentUser!;
  const contentType=String(req.body?.contentType||"");
  const contentId=Number(req.body?.contentId);
  const requestedAction=String(req.body?.requestedAction||"");
  if(!contentTypes.has(contentType)||!Number.isInteger(contentId)||contentId<=0||!actions.has(requestedAction)){res.status(400).json({error:"Invalid permission request"});return;}
  const table=contentType==="lesson"?"lessons":"exercises";
  const ownerColumn=contentType==="lesson"?"teacher_id":"created_by";
  const result=await pool.query(`SELECT ${ownerColumn} AS owner_id FROM ${table} WHERE id=$1 LIMIT 1`,[contentId]);
  const ownerId=result.rows[0]?.owner_id;
  if(!ownerId){res.status(404).json({error:"Content not found"});return;}
  if(Number(ownerId)===actor.id||isOwnerRole(actor.role)||(canAccessManager(actor)&&actor.managerLevel==="senior")){res.status(200).json({ok:true,alreadyAuthorized:true});return;}
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
    "SELECT cp.*, owner.name AS owner_name, CASE WHEN cp.content_type='lesson' THEN lesson.title ELSE exercise.title END AS content_title FROM content_permission_requests cp LEFT JOIN users owner ON owner.id=cp.owner_id LEFT JOIN lessons lesson ON cp.content_type='lesson' AND lesson.id=cp.content_id LEFT JOIN exercises exercise ON cp.content_type='exercise' AND exercise.id=cp.content_id WHERE cp.requester_id=$1 ORDER BY cp.created_at DESC LIMIT 100",
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
  const details={requestId:id,requesterId:actor.id,ownerId:Number(item.owner_id),contentType:item.content_type,contentId:Number(item.content_id),requestedAction:item.requested_action,message};
  await pool.query("INSERT INTO activity_log(type,description,actor_name) VALUES($1,$2,$3)",["content_permission_reported_to_manager","Manager review requested for declined permission: "+JSON.stringify(details),actor.name]);
  await pool.query(
    "INSERT INTO notifications(recipient_id,title,message,type,is_read,link) SELECT id,$1,$2,$3,false,$4 FROM users WHERE role='owner' OR is_manager=true",
    ["Permission decision needs manager review",actor.name+" reported declined permission request #"+id+". "+(message||"Please review the request."),"content_permission_report","/admin/notifications"]
  );
  res.status(201).json({ok:true,reported:true});
});

export default router;
