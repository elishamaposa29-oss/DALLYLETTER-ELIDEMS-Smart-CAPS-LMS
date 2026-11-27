import { Router } from "express";
import { appendFile, unlink, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { requireAuth } from "../lib/auth-middleware";
import { createMediaStorageKey, ensureMediaDirectory, getMediaDirectory, isAllowedMediaType, persistUploadedMedia } from "../lib/media-storage";
import path from "node:path";
import { isObjectStorageConfigured } from "../lib/object-storage";
import { contiguousUploadOffset, uploadIsComplete, validateUploadChunk } from "../lib/resumable-upload-core";

const router = Router();
const CHUNK_BYTES = 256 * 1024;
const MAX_UPLOAD_BYTES = isObjectStorageConfigured() ? 250 * 1024 * 1024 : 20 * 1024 * 1024;
const SESSION_TTL_DAYS = 7;
const MAX_ACTIVE_SESSIONS_PER_USER = 5;
const MAX_ACTIVE_UPLOAD_BYTES_PER_USER = 100 * 1024 * 1024;

function validId(value: unknown): string | null {
  const id = String(value ?? "");
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

router.post("/sessions", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const fileName = typeof req.body?.fileName === "string" ? req.body.fileName.replace(/[\\/\\0-\\x1f]/g, "_").slice(0, 180) : "";
  const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType.split(";", 1)[0].trim().toLowerCase() : "";
  const totalBytes = Number(req.body?.totalBytes);
  if (!fileName || !isAllowedMediaType(mimeType) || !Number.isSafeInteger(totalBytes) || totalBytes < 1 || totalBytes > MAX_UPLOAD_BYTES) {
    res.status(400).json({ error: "Provide a supported file name, media type and size within the configured upload limit (" + Math.round(MAX_UPLOAD_BYTES / 1024 / 1024) + " MiB)." }); return;
  }
  const active = await pool.query("SELECT count(*)::int AS sessions,COALESCE(sum(total_bytes),0)::bigint AS bytes FROM resumable_upload_sessions WHERE user_id=$1 AND status='uploading' AND expires_at>now()", [user.id]);
  if (Number(active.rows[0]?.sessions || 0) >= MAX_ACTIVE_SESSIONS_PER_USER || Number(active.rows[0]?.bytes || 0) + totalBytes > MAX_ACTIVE_UPLOAD_BYTES_PER_USER) {
    res.status(429).json({ error: "Upload storage limit reached. Finish or cancel an existing upload before starting another." }); return;
  }
  const id = randomUUID();
  await pool.query(
    "INSERT INTO resumable_upload_sessions(id,user_id,file_name,mime_type,total_bytes,chunk_bytes,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+($7::text||' days')::interval)",
    [id, user.id, fileName, mimeType, totalBytes, CHUNK_BYTES, SESSION_TTL_DAYS],
  );
  res.status(201).json({ sessionId: id, chunkBytes: CHUNK_BYTES, totalBytes, expiresInDays: SESSION_TTL_DAYS, nextOffset: 0 });
});

router.get("/sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const id = validId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid upload session." }); return; }
  const result = await pool.query("SELECT id,file_name,mime_type,total_bytes,chunk_bytes,expires_at,status,storage_key,media_url FROM resumable_upload_sessions WHERE id=$1 AND user_id=$2 AND expires_at>now()", [id, req.currentUser!.id]);
  const session = result.rows[0];
  if (!session) { res.status(404).json({ error: "Upload session not found or expired." }); return; }
  if (session.status === "complete") { res.json({ sessionId:id,complete:true,storageKey:session.storage_key,mediaUrl:session.media_url,totalBytes:Number(session.total_bytes),fileName:session.file_name,mimeType:session.mime_type }); return; }
  const chunks = await pool.query("SELECT chunk_index,byte_offset,octet_length(data) AS size_bytes,sha256 FROM resumable_upload_chunks WHERE session_id=$1 ORDER BY chunk_index", [id]);
  const received = chunks.rows.map((row: any) => ({ index: Number(row.chunk_index), offset: Number(row.byte_offset), size: Number(row.size_bytes), sha256: row.sha256 }));
  const nextOffset = contiguousUploadOffset(received);
  res.json({ sessionId: id, fileName: session.file_name, mimeType: session.mime_type, totalBytes: Number(session.total_bytes), chunkBytes: Number(session.chunk_bytes), received, nextOffset, expiresAt: session.expires_at });
});

router.put("/sessions/:id/chunks/:index", requireAuth, async (req, res): Promise<void> => {
  const id = validId(req.params.id), index = Number(req.params.index);
  if (!id || !Number.isSafeInteger(index) || index < 0 || typeof req.body?.data !== "string") { res.status(400).json({ error: "Invalid upload chunk." }); return; }
  const result = await pool.query("SELECT total_bytes,chunk_bytes FROM resumable_upload_sessions WHERE id=$1 AND user_id=$2 AND status='uploading' AND expires_at>now()", [id, req.currentUser!.id]);
  const session = result.rows[0];
  if (!session) { res.status(404).json({ error: "Upload session not found or expired." }); return; }
  const data = Buffer.from(req.body.data, "base64");
  const offset = Number(req.body.offset);
  const expectedOffset = index * Number(session.chunk_bytes);
  const expectedSize = Math.min(Number(session.chunk_bytes), Number(session.total_bytes) - expectedOffset);
  if (!data.length || !validateUploadChunk(Number(session.total_bytes), Number(session.chunk_bytes), index, offset, data.length) || data.length !== expectedSize || data.toString("base64") !== req.body.data) {
    res.status(400).json({ error: "Chunk size or byte offset is invalid." }); return;
  }
  const sha256 = createHash("sha256").update(data).digest("hex");
  if (req.body.sha256 && req.body.sha256 !== sha256) { res.status(400).json({ error: "Chunk checksum mismatch." }); return; }
  await pool.query(
    "INSERT INTO resumable_upload_chunks(session_id,chunk_index,byte_offset,data,sha256) VALUES($1,$2,$3,$4,$5) ON CONFLICT(session_id,chunk_index) DO NOTHING",
    [id, index, offset, data, sha256],
  );
  const saved = await pool.query("SELECT byte_offset,sha256,octet_length(data) AS size_bytes FROM resumable_upload_chunks WHERE session_id=$1 AND chunk_index=$2", [id, index]);
  const row = saved.rows[0];
  if (!row || Number(row.byte_offset) !== offset || row.sha256 !== sha256 || Number(row.size_bytes) !== data.length) {
    res.status(409).json({ error: "A different chunk is already stored at this offset." }); return;
  }
  res.status(200).json({ accepted: true, index, offset, size: data.length, sha256, nextOffset: offset + data.length });
});

router.post("/sessions/:id/complete", requireAuth, async (req, res): Promise<void> => {
  const id = validId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid upload session." }); return; }
  const client = await pool.connect();
  let tempPath: string | null = null;
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT * FROM resumable_upload_sessions WHERE id=$1 AND user_id=$2 AND expires_at>now() FOR UPDATE", [id, req.currentUser!.id]);
    const session = result.rows[0];
    if (!session) { await client.query("ROLLBACK"); res.status(404).json({ error: "Upload session not found or expired." }); return; }
    if (session.status === "complete") {
      await client.query("COMMIT");
      res.json({ storageKey:session.storage_key,mediaUrl:session.media_url,fileName:session.file_name,mimeType:session.mime_type,size:Number(session.total_bytes) });
      return;
    }
    const chunks = await client.query("SELECT chunk_index,byte_offset,data FROM resumable_upload_chunks WHERE session_id=$1 ORDER BY chunk_index", [id]);
    const totalBytes = Number(session.total_bytes), chunkBytes = Number(session.chunk_bytes);
    const receivedChunks = chunks.rows.map((chunk: any) => ({ index:Number(chunk.chunk_index), offset:Number(chunk.byte_offset), size:Buffer.from(chunk.data).length }));
    const offset = contiguousUploadOffset(receivedChunks);
    if (!uploadIsComplete(totalBytes, chunkBytes, receivedChunks)) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Upload is incomplete or contains a missing/out-of-order chunk.", receivedBytes: offset, nextOffset: offset, totalBytes, expectedChunks: Math.ceil(totalBytes / chunkBytes), receivedChunks: chunks.rows.length });
      return;
    }
    await ensureMediaDirectory();
    const storageKey = createMediaStorageKey();
    tempPath = path.join(getMediaDirectory(), "resumable-" + storageKey + ".part");
    await writeFile(tempPath, Buffer.alloc(0));
    for (const chunk of chunks.rows) await appendFile(tempPath, Buffer.from(chunk.data));
    await persistUploadedMedia(storageKey, session.mime_type, tempPath);
    tempPath = null;
    const mediaUrl = "/api/lessons/media/" + storageKey + "?type=" + encodeURIComponent(session.mime_type);
    await client.query("UPDATE resumable_upload_sessions SET status='complete',storage_key=$3,media_url=$4,completed_at=now() WHERE id=$1 AND user_id=$2", [id, req.currentUser!.id, storageKey, mediaUrl]);
    await client.query("DELETE FROM resumable_upload_chunks WHERE session_id=$1", [id]);
    await client.query("COMMIT");
    res.status(201).json({ storageKey, fileName: session.file_name, mimeType: session.mime_type, size: totalBytes, mediaUrl });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (tempPath) await unlink(tempPath).catch(() => undefined);
    res.status(503).json({ error: error instanceof Error ? error.message : "Could not finalize upload. Resume with the same session." });
  } finally {
    client.release();
  }
});

router.delete("/sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const id = validId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid upload session." }); return; }
  await pool.query("DELETE FROM resumable_upload_sessions WHERE id=$1 AND user_id=$2", [id, req.currentUser!.id]);
  res.status(204).end();
});

export default router;
