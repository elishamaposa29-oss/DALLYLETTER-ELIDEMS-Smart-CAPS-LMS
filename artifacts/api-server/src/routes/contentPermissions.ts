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
  if(ownerId===actor.id||isOwnerRole(actor.role)||(canAccessManager(actor)&&actor.managerLevel==="senior")){res.status(200).json({ok:true,alreadyAuthorized:true});return;}
  const existing=await pool.query("SELECT id,status FROM content_permission_requests WHERE requester_id=$1 AND content_type=$2 AND content_id=$3 AND requested_action=$4 AND status='pending' LIMIT 1",[actor.id,contentType,contentId,requestedAction]);
  if(existing.rows[0]){res.json({ok:true,pending:true,id:existing.rows[0].id});return;}
  const inserted=await pool.query("INSERT INTO content_permission_requests(requester_id,owner_id,content_type,content_id,requested_action) VALUES($1,$2,$3,$4,$5) RETURNING id",[actor.id,ownerId,contentType,contentId,requestedAction]);
  res.status(201).json({ok:true,pending:true,id:inserted.rows[0].id});
});

router.get("/content-permissions",requireAuth,async(req,res):Promise<void>=>{
  const actor=req.currentUser!;
  if(!canAccessManager(actor)){res.status(403).json({error:"Manager or owner access required"});return;}
  const rows=await pool.query("SELECT * FROM content_permission_requests WHERE owner_id=$1 AND status='pending' ORDER BY created_at DESC",[actor.id]);
  res.json(rows.rows);
});

router.patch("/content-permissions/:id",requireAuth,async(req,res):Promise<void>=>{
  const actor=req.currentUser!;
  const id=Number(req.params.id); const status=String(req.body?.status||"");
  if(!Number.isInteger(id)||!["approved","declined"].includes(status)){res.status(400).json({error:"Invalid permission response"});return;}
  const result=await pool.query("UPDATE content_permission_requests SET status=$1,responded_at=now() WHERE id=$2 AND owner_id=$3 AND status='pending' RETURNING *",[status,id,actor.id]);
  if(!result.rows[0]){res.status(404).json({error:"Permission request not found"});return;}
  res.json(result.rows[0]);
});

export default router;
