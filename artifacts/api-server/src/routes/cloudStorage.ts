import { Router } from "express";
import multer from "multer";
import { createHash,randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { pool } from "@workspace/db";
import { requireAuth } from "../lib/auth-middleware";
import { deleteCloudObject,getCloudObject,isObjectStorageConfigured,putCloudObject } from "../lib/object-storage";
import { CLOUD_STORAGE_QUOTA_BYTES,isCloudStorageCategory,safeCloudFileName } from "../lib/cloud-storage-core";
const router=Router(),MAX_BYTES=250*1024*1024;
const mime=/^(video\/(mp4|webm|quicktime|ogg)|audio\/(mpeg|mp4|ogg|webm|wav)|image\/(jpeg|png|webp|gif)|application\/(pdf|msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|presentationml\.presentation|spreadsheetml\.sheet)))$/i;
const upload=multer({storage:multer.diskStorage({destination:tmpdir(),filename:(_r,_f,cb)=>cb(null,"dallyletter-cloud-"+randomUUID())}),limits:{fileSize:MAX_BYTES,files:1},fileFilter:(_r,f,cb)=>cb(null,mime.test(f.mimetype.split(";",1)[0]))});
function ready(res:import("express").Response){if(isObjectStorageConfigured())return true;res.status(503).json({code:"CLOUD_STORAGE_NOT_CONFIGURED",error:"Configure MEDIA_S3_ENDPOINT, MEDIA_S3_BUCKET, MEDIA_S3_ACCESS_KEY_ID, MEDIA_S3_SECRET_ACCESS_KEY and MEDIA_S3_REGION on the API service."});return false;}
async function account(id:number){await pool.query("INSERT INTO user_cloud_storage(user_id,quota_bytes,used_bytes) VALUES($1,$2,0) ON CONFLICT(user_id) DO NOTHING",[id,CLOUD_STORAGE_QUOTA_BYTES]);}
router.post("/reconcile",requireAuth,async(req,res)=>{
 const uid=Number(req.currentUser!.id),client=await pool.connect();
 try{
  await client.query("BEGIN");
  await client.query("INSERT INTO user_cloud_storage(user_id,quota_bytes,used_bytes) VALUES($1,$2,0) ON CONFLICT(user_id) DO NOTHING",[uid,CLOUD_STORAGE_QUOTA_BYTES]);
  const quotaResult=await client.query("SELECT quota_bytes FROM user_cloud_storage WHERE user_id=$1 FOR UPDATE",[uid]);
  const totalResult=await client.query("SELECT COALESCE(SUM(size_bytes),0)::bigint AS registered_bytes FROM user_cloud_objects WHERE user_id=$1",[uid]);
  const quota=Number(quotaResult.rows[0]?.quota_bytes||CLOUD_STORAGE_QUOTA_BYTES),registered=Number(totalResult.rows[0]?.registered_bytes||0);
  const accounted=Math.min(registered,quota);
  await client.query("UPDATE user_cloud_storage SET used_bytes=$2,updated_at=now() WHERE user_id=$1",[uid,accounted]);
  await client.query("COMMIT");
  res.setHeader("Cache-Control","private,no-store");
  res.json({quotaBytes:quota,usedBytes:accounted,registeredBytes:registered,overQuotaBytes:Math.max(0,registered-quota),reconciled:true});
 }catch(error){await client.query("ROLLBACK").catch(()=>undefined);res.status(503).json({error:error instanceof Error?error.message:"Cloud storage reconciliation failed"});}
 finally{client.release();}
});
router.get("/status",requireAuth,async(req,res)=>{const id=Number(req.currentUser!.id);await account(id);const q=await pool.query("SELECT quota_bytes,used_bytes FROM user_cloud_storage WHERE user_id=$1",[id]);const quota=Number(q.rows[0].quota_bytes),used=Number(q.rows[0].used_bytes);res.setHeader("Cache-Control","private,no-store");res.json({provider:"s3-compatible",configured:isObjectStorageConfigured(),quotaBytes:quota,usedBytes:used,availableBytes:Math.max(0,quota-used),usagePercent:quota?Math.round(used/quota*10000)/100:0,maxObjectBytes:MAX_BYTES});});
router.get("/objects",requireAuth,async(req,res)=>{const id=Number(req.currentUser!.id),cat=req.query.category,limit=Math.min(100,Math.max(1,Number(req.query.limit)||50));const vals:unknown[]=[id];let where="user_id=$1";if(isCloudStorageCategory(cat)){vals.push(cat);where+=" AND category=$2";}vals.push(limit);const q=await pool.query(`SELECT id,file_name,mime_type,size_bytes,category,created_at FROM user_cloud_objects WHERE ${where} ORDER BY created_at DESC LIMIT $${vals.length}`,vals);res.setHeader("Cache-Control","private,no-store");res.json(q.rows.map((x:any)=>({id:x.id,fileName:x.file_name,mimeType:x.mime_type,sizeBytes:Number(x.size_bytes),category:x.category,createdAt:x.created_at})));});
router.post("/objects",requireAuth,(req,res,next)=>{if(!ready(res))return;upload.single("file")(req,res,e=>{if(e){res.status(e instanceof multer.MulterError?413:400).json({error:e.message||"Upload rejected"});return;}next();});},async(req,res)=>{const f=req.file;if(!f){res.status(400).json({error:"Attach one supported file in the file field"});return;}const uid=Number(req.currentUser!.id),id=randomUUID(),key="users/"+uid+"/"+id,category=isCloudStorageCategory(req.body?.category)?req.body.category:"other",name=safeCloudFileName(f.originalname);let reserved=false,uploaded=false;try{await account(uid);const reserve=await pool.query("UPDATE user_cloud_storage SET used_bytes=used_bytes+$2,updated_at=now() WHERE user_id=$1 AND used_bytes+$2<=quota_bytes RETURNING quota_bytes,used_bytes",[uid,f.size]);if(!reserve.rows[0]){res.status(413).json({code:"CLOUD_QUOTA_EXCEEDED",error:"Your 10 GB cloud allowance is full. Delete files you no longer need."});return;}reserved=true;const hash=createHash("sha256");for await(const b of createReadStream(f.path))hash.update(b);const checksum=hash.digest("hex");await putCloudObject(key,f.mimetype,f.path);uploaded=true;await pool.query("INSERT INTO user_cloud_objects(id,user_id,storage_key,file_name,mime_type,size_bytes,category,checksum_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[id,uid,key,name,f.mimetype,f.size,category,checksum]);reserved=false;res.status(201).json({id,fileName:name,mimeType:f.mimetype,sizeBytes:f.size,category,checksumSha256:checksum,quotaBytes:Number(reserve.rows[0].quota_bytes),usedBytes:Number(reserve.rows[0].used_bytes)});}catch(e){if(reserved)await pool.query("UPDATE user_cloud_storage SET used_bytes=GREATEST(0,used_bytes-$2),updated_at=now() WHERE user_id=$1",[uid,f.size]).catch(()=>undefined);if(uploaded)await deleteCloudObject(key).catch(()=>undefined);res.status(503).json({error:e instanceof Error?e.message:"Cloud upload failed"});}finally{await unlink(f.path).catch(()=>undefined);}});
router.get("/objects/:id/content",requireAuth,async(req,res)=>{const q=await pool.query("SELECT storage_key,file_name FROM user_cloud_objects WHERE id=$1 AND user_id=$2",[String(req.params.id),req.currentUser!.id]);const obj=q.rows[0];if(!obj){res.status(404).json({error:"Cloud file not found"});return;}try{const key=String(obj.storage_key);const remote=key.startsWith("media/")?await (await import("../lib/media-storage")).streamStoredMedia(key.slice(6),req.headers.range):await getCloudObject(key,req.headers.range);if(!remote){res.status(404).json({error:"Cloud file content is unavailable"});return;}res.status(remote.status);remote.headers.forEach((v,k)=>{if(["content-type","content-length","content-range","accept-ranges"].includes(k.toLowerCase()))res.setHeader(k,v);});res.setHeader("Content-Disposition","attachment; filename*=UTF-8''"+encodeURIComponent(String(obj.file_name)));res.setHeader("Cache-Control","private,no-store");if(remote.body)await pipeline(Readable.fromWeb(remote.body as import("node:stream/web").ReadableStream<Uint8Array>),res);else res.end();}catch{res.status(503).json({error:"Cloud file temporarily unavailable"});}});
router.delete("/objects/:id",requireAuth,async(req,res)=>{
 const uid=Number(req.currentUser!.id),id=String(req.params.id);
 const existing=await pool.query("SELECT storage_key FROM user_cloud_objects WHERE id=$1 AND user_id=$2",[id,uid]);
 if(!existing.rows[0]){res.status(404).json({error:"Cloud file not found"});return;}
 const key=String(existing.rows[0].storage_key);
 if(key.startsWith("media/")){
  try{await (await import("../lib/media-storage")).removeStoredMedia(key.slice(6));res.status(204).end();}
  catch(e){res.status(503).json({error:e instanceof Error?e.message:"Media deletion failed; quota was preserved."});}
  return;
 }
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const found=await client.query("SELECT storage_key,size_bytes FROM user_cloud_objects WHERE id=$1 AND user_id=$2 FOR UPDATE",[id,uid]);
  if(!found.rows[0]){await client.query("ROLLBACK");res.status(404).json({error:"Cloud file not found"});return;}
  try{await deleteCloudObject(String(found.rows[0].storage_key));}
  catch{await client.query("ROLLBACK");res.status(503).json({error:"Cloud provider deletion failed; file record and quota were preserved. Retry later."});return;}
  await client.query("DELETE FROM user_cloud_objects WHERE id=$1 AND user_id=$2",[id,uid]);
  await client.query("UPDATE user_cloud_storage SET used_bytes=GREATEST(0,used_bytes-$2),updated_at=now() WHERE user_id=$1",[uid,found.rows[0].size_bytes]);
  await client.query("COMMIT");res.status(204).end();
 }catch(e){await client.query("ROLLBACK").catch(()=>undefined);res.status(503).json({error:e instanceof Error?e.message:"Delete failed"});}
 finally{client.release();}
});
export default router;
