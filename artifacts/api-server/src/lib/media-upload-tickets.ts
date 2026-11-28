import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { pool } from "@workspace/db";
import { getMediaDirectory, persistUploadedMedia, removeStoredMedia, streamStoredMedia } from "./media-storage";

const SHA256_RE = /^[a-f0-9]{64}$/i;
const MAX_TTL_SECONDS = 900;
const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;

export type MediaUploadBinding = {
  userId: number; routeKey: string; targetType: string; targetId: string;
  mimeType: string; maxBytes: number; expectedSha256?: string;
  storageKey?: string; ttlSeconds?: number;
};

export type IssuedMediaUploadTicket = { ticket: string; ticketId: string; storageKey: string; expiresAt: string };

const digestTicket = (ticket: string) => createHash("sha256").update(ticket, "utf8").digest("hex");

function validBinding(binding: MediaUploadBinding): void {
  if (!Number.isSafeInteger(binding.userId) || binding.userId <= 0) throw new Error("Invalid upload owner");
  for (const value of [binding.routeKey, binding.targetType, binding.targetId, binding.mimeType]) {
    if (!value.trim() || value.length > 160) throw new Error("Invalid upload binding");
  }
  if (!Number.isSafeInteger(binding.maxBytes) || binding.maxBytes <= 0 || binding.maxBytes > MAX_UPLOAD_BYTES) throw new Error("Invalid upload size limit");
  if (binding.expectedSha256 && !SHA256_RE.test(binding.expectedSha256)) throw new Error("Invalid expected SHA-256");
  if (binding.storageKey && !/^[a-f0-9-]{36}$/i.test(binding.storageKey)) throw new Error("Invalid storage key");
}

export async function ensureMediaUploadTicketSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.media_upload_tickets (
      id uuid PRIMARY KEY, token_hash char(64) NOT NULL UNIQUE,
      user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      route_key text NOT NULL, target_type text NOT NULL, target_id text NOT NULL,
      storage_key uuid NOT NULL UNIQUE, mime_type text NOT NULL,
      max_bytes bigint NOT NULL CHECK (max_bytes > 0 AND max_bytes <= 262144000),
      expected_sha256 char(64), status text NOT NULL DEFAULT 'issued'
        CHECK (status IN ('issued','uploaded','consumed','expired','rejected')),
      expires_at timestamptz NOT NULL, uploaded_size bigint, uploaded_sha256 char(64),
      uploaded_at timestamptz, consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (expected_sha256 IS NULL OR expected_sha256 ~ '^[a-f0-9]{64}$'),
      CHECK (uploaded_sha256 IS NULL OR uploaded_sha256 ~ '^[a-f0-9]{64}$'),
      CHECK (uploaded_size IS NULL OR uploaded_size >= 0)
    )`);
  await pool.query("CREATE INDEX IF NOT EXISTS media_upload_tickets_expiry_idx ON public.media_upload_tickets (expires_at) WHERE status IN ('issued','uploaded','expired')");
}

export async function issueMediaUploadTicket(binding: MediaUploadBinding): Promise<IssuedMediaUploadTicket> {
  validBinding(binding);
  const ttl = Math.min(Math.max(Math.floor(binding.ttlSeconds ?? 300), 30), MAX_TTL_SECONDS);
  const ticket = randomBytes(32).toString("base64url");
  const ticketId = randomUUID();
  const storageKey = binding.storageKey ?? randomUUID();
  const expiresAt = new Date(Date.now() + ttl * 1000);
  await pool.query(`INSERT INTO media_upload_tickets
    (id,token_hash,user_id,route_key,target_type,target_id,storage_key,mime_type,max_bytes,expected_sha256,expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [ticketId,digestTicket(ticket),binding.userId,binding.routeKey,binding.targetType,binding.targetId,
      storageKey,binding.mimeType,binding.maxBytes,binding.expectedSha256?.toLowerCase() ?? null,expiresAt]);
  return { ticket,ticketId,storageKey,expiresAt:expiresAt.toISOString() };
}

export async function markMediaUploadVerified(input: {
  ticket:string; userId:number; routeKey:string; targetType:string; targetId:string;
  mimeType:string; size:number; sha256:string;
}): Promise<{ticketId:string;storageKey:string}> {
  if (!SHA256_RE.test(input.sha256) || !Number.isSafeInteger(input.size) || input.size <= 0) throw new Error("Invalid upload integrity metadata");
  const r=await pool.query(`UPDATE media_upload_tickets SET status='uploaded',uploaded_size=$7,uploaded_sha256=$8,uploaded_at=now()
    WHERE token_hash=$1 AND user_id=$2 AND route_key=$3 AND target_type=$4 AND target_id=$5 AND mime_type=$6
      AND status='issued' AND expires_at>now() AND $7<=max_bytes
      AND (expected_sha256 IS NULL OR expected_sha256=$8) RETURNING id,storage_key`,
    [digestTicket(input.ticket),input.userId,input.routeKey,input.targetType,input.targetId,input.mimeType,input.size,input.sha256.toLowerCase()]);
  if(!r.rows[0]) throw new Error("Upload ticket binding, expiry, size or checksum verification failed");
  return {ticketId:String(r.rows[0].id),storageKey:String(r.rows[0].storage_key)};
}

export async function consumeMediaUploadTicket(input: {
  ticket:string; userId:number; routeKey:string; targetType:string; targetId:string; mimeType:string;
}): Promise<{ticketId:string;storageKey:string;size:number;sha256:string}> {
  const r=await pool.query(`UPDATE media_upload_tickets SET status='consumed',consumed_at=now()
    WHERE token_hash=$1 AND user_id=$2 AND route_key=$3 AND target_type=$4 AND target_id=$5 AND mime_type=$6
      AND status='uploaded' AND expires_at>now()
    RETURNING id,storage_key,uploaded_size,uploaded_sha256`,
    [digestTicket(input.ticket),input.userId,input.routeKey,input.targetType,input.targetId,input.mimeType]);
  const row=r.rows[0]; if(!row) throw new Error("Ticket invalid, expired, consumed or bound to another account/target");
  return {ticketId:String(row.id),storageKey:String(row.storage_key),size:Number(row.uploaded_size),sha256:String(row.uploaded_sha256)};
}

async function verifyMimeSignature(path:string,mimeType:string):Promise<void>{
  const h=await open(path,"r");
  try{
    const header=Buffer.alloc(16);const {bytesRead}=await h.read(header,0,16,0);const b=header.subarray(0,bytesRead);
    const starts=(...v:number[])=>v.every((x,i)=>b[i]===x);
    const ok=(mimeType==="image/jpeg"&&starts(255,216,255))||
      (mimeType==="image/png"&&starts(137,80,78,71,13,10,26,10))||
      (mimeType==="image/webp"&&b.subarray(0,4).toString()==="RIFF"&&b.subarray(8,12).toString()==="WEBP")||
      (mimeType==="application/pdf"&&b.subarray(0,5).toString()==="%PDF-")||
      (["video/mp4","video/quicktime","audio/mp4"].includes(mimeType)&&b.subarray(4,8).toString()==="ftyp")||
      (["video/webm","audio/webm"].includes(mimeType)&&starts(26,69,223,163))||
      (["audio/ogg","video/ogg"].includes(mimeType)&&b.subarray(0,4).toString()==="OggS")||
      (mimeType==="audio/wav"&&b.subarray(0,4).toString()==="RIFF"&&b.subarray(8,12).toString()==="WAVE")||
      (mimeType==="audio/mpeg"&&(b.subarray(0,3).toString()==="ID3"||(b[0]===255&&(b[1]&224)===224)) )||
      (mimeType==="application/msword"&&starts(208,207,17,224,161,177,26,225))||
      (mimeType==="application/vnd.openxmlformats-officedocument.wordprocessingml.document"&&starts(80,75,3,4));
    if(!ok) throw new Error("File signature does not match declared MIME type");
  }finally{await h.close();}
}

async function hashFile(path:string):Promise<string>{
  const h=createHash("sha256");for await(const chunk of createReadStream(path))h.update(chunk);return h.digest("hex");
}
async function hashResponse(response:Response):Promise<{size:number;sha256:string}>{
  if(!response.body)throw new Error("Stored object has no body");
  const h=createHash("sha256");const reader=response.body.getReader();let size=0;
  try{while(true){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;h.update(p.value);}}
  finally{reader.releaseLock();}
  return {size,sha256:h.digest("hex")};
}

export async function persistTicketedMediaUpload(input:{
  localPath:string;storageKey:string;mimeType:string;
  binding:Omit<MediaUploadBinding,"storageKey"|"expectedSha256"|"mimeType">;
}):Promise<{storageKey:string;size:number;sha256:string;backend:"object-storage"|"database"}>{
  const file=await stat(input.localPath);
  if(!file.isFile()||file.size<=0||file.size>input.binding.maxBytes)throw new Error("Upload size outside authorized limit");
  await verifyMimeSignature(input.localPath,input.mimeType);
  const sha256=await hashFile(input.localPath);
  const ticket=await issueMediaUploadTicket({...input.binding,mimeType:input.mimeType,storageKey:input.storageKey,expectedSha256:sha256});
  try{
    const verified=await markMediaUploadVerified({ticket:ticket.ticket,userId:input.binding.userId,routeKey:input.binding.routeKey,
      targetType:input.binding.targetType,targetId:input.binding.targetId,mimeType:input.mimeType,size:file.size,sha256});
    const backend=await persistUploadedMedia(verified.storageKey,input.mimeType,input.localPath);
    const stored=await streamStoredMedia(verified.storageKey);
    if(!stored||stored.status!==200)throw new Error("Stored object read-back failed");
    const actual=await hashResponse(stored);
    if(actual.size!==file.size||actual.sha256!==sha256)throw new Error("Stored object size/checksum mismatch");
    await consumeMediaUploadTicket({ticket:ticket.ticket,userId:input.binding.userId,routeKey:input.binding.routeKey,
      targetType:input.binding.targetType,targetId:input.binding.targetId,mimeType:input.mimeType});
    return {storageKey:verified.storageKey,size:actual.size,sha256:actual.sha256,backend};
  }catch(error){
    let removed=false;try{await removeStoredMedia(input.storageKey);removed=true;}catch{/* retry cleanup */}
    if(removed)await pool.query("DELETE FROM media_upload_tickets WHERE id=$1 AND status<>'consumed'",[ticket.ticketId]).catch(()=>undefined);
    else await pool.query("UPDATE media_upload_tickets SET status='expired',expires_at=now() WHERE id=$1 AND status<>'consumed'",[ticket.ticketId]).catch(()=>undefined);
    throw error;
  }
}

/**
 * Removes abandoned API-local staging files left behind if a process exits
 * before a ticket can be issued or after a durable copy has completed.
 * Only UUID-named regular files older than the grace window are considered;
 * active, unexpired tickets are never touched.
 */
export async function cleanupOrphanedMediaStagingFiles(
  graceMs = 24 * 60 * 60 * 1000,
  limit = 200,
): Promise<{ scanned: number; deleted: number; failed: number }> {
  const safeGrace = Math.max(0, Math.min(graceMs, 30 * 24 * 60 * 60 * 1000));
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 1000);
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(getMediaDirectory(), { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { scanned: 0, deleted: 0, failed: 0 };
    throw error;
  }
  const cutoff = Date.now() - safeGrace;
  let scanned = 0;
  let deleted = 0;
  let failed = 0;
  for (const entry of entries) {
    if (scanned >= safeLimit) break;
    if (!entry.isFile() || !/^[a-f0-9-]{36}$/i.test(entry.name)) continue;
    const filePath = path.join(getMediaDirectory(), entry.name);
    let fileStats;
    try { fileStats = await stat(filePath); } catch { continue; }
    if (!fileStats.isFile() || fileStats.mtimeMs > cutoff) continue;
    scanned += 1;
    const active = await pool.query(
      "SELECT 1 FROM media_upload_tickets WHERE storage_key=$1 AND status IN ('issued','uploaded') AND expires_at>now() LIMIT 1",
      [entry.name],
    );
    if (active.rows.length) continue;
    try {
      await unlink(filePath);
      deleted += 1;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") failed += 1;
    }
  }
  return { scanned, deleted, failed };
}

export async function cleanupExpiredMediaUploads(limit=200):Promise<{scanned:number;deleted:number;failed:number}>{
  const n=Math.min(Math.max(Math.floor(limit),1),1000);
  await pool.query("UPDATE media_upload_tickets SET status='expired' WHERE status IN ('issued','uploaded') AND expires_at<=now()");
  const r=await pool.query("SELECT id,storage_key FROM media_upload_tickets WHERE status='expired' ORDER BY expires_at LIMIT $1",[n]);
  let deleted=0,failed=0;
  for(const row of r.rows as Array<{id:string;storage_key:string}>){
    try{await removeStoredMedia(String(row.storage_key));await pool.query("DELETE FROM media_upload_tickets WHERE id=$1 AND status='expired'",[row.id]);deleted++;}
    catch{failed++;}
  }
  return {scanned:r.rows.length,deleted,failed};
}
