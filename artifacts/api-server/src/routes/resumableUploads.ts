import { Router } from "express";
import { appendFile, unlink, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { requireAuth } from "../lib/auth-middleware";
import { createMediaStorageKey, ensureMediaDirectory, getMediaDirectory, isAllowedMediaType, persistUploadedMedia } from "../lib/media-storage";
import path from "node:path";

const router = Router();
const CHUNK_BYTES = 256 * 1024;
const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;
const SESSION_TTL_DAYS = 60;

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
    res.status(400).json({ error: "Provide a supported file name, media type and size up to 250 MiB." }); return;
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
  const result = await pool.query("SELECT id,file_name,mime_type,total_bytes,chunk_bytes,expires_at FROM resumable_upload_sessions WHERE id=$1 AND user_id=$2 AND status='uploading' AND expires_at>now()", [id, req.currentUser!.id]);
  const session = result.rows[0];
  if (!session) { res.status(404).json({ error: "Upload session not found or expired." }); return; }
  const chunks = await pool.query("SELECT chunk_index,byte_offset,octet_length(data) AS size_bytes,sha256 FROM resumable_upload_chunks WHERE session_id=$1 ORDER BY chunk_index", [id]);
  const received = chunks.rows.map((row: any) => ({ index: Number(row.chunk_index), offset: Number(row.byte_offset), size: Number(row.size_bytes), sha256: row.sha256 }));
  let nextOffset = 0;
  for (const row of received) {
    if (row.offset !== nextOffset) break;
    nextOffset += row.size;
  }
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
  if (!data.length || data.length !== expectedSize || offset !== expectedOffset || expectedSize <= 0 || data.toString("base64") !== req.body.data) {
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
  const result = await pool.query("SELECT * FROM resumable_upload_sessions WHERE id=$1 AND user_id=$2 AND status='uploading' AND expires_at>now()", [id, req.currentUser!.id]);
  const session = result.rows[0];
  if (!session) { res.status(404).json({ error: "Upload session not found or expired." }); return; }
  const chunks = await pool.query("SELECT chunk_index,byte_offset,data FROM resumable_upload_chunks WHERE session_id=$1 ORDER BY chunk_index", [id]);
  const totalBytes = Number(session.total_bytes), chunkBytes = Number(session.chunk_bytes);
  const expectedCount = Math.ceil(totalBytes / chunkBytes);
  if (chunks.rows.length !== expectedCount) { res.status(409).json({ error: "Upload is incomplete.", receivedChunks: chunks.rows.length, expectedChunks: expectedCount }); return; }
  let offset = 0;
  for (let i=0;i<chunks.rows.length;i++) {
    const chunk = chunks.rows[i];
    if (Number(chunk.chunk_index)!==i || Number(chunk.byte_offset)!==offset) { res.status(409).json({ error: "Upload has a missing or out-of-order chunk.", nextOffset: offset }); return; }
    offset += Buffer.from(chunk.data).length;
  }
  if (offset !== totalBytes) { res.status(409).json({ error: "Upload size does not match the original file.", receivedBytes: offset, totalBytes }); return; }
  await ensureMediaDirectory();
  const storageKey = createMediaStorageKey();
  const tempPath = path.join(getMediaDirectory(), "resumable-" + storageKey + ".part");
  try {
    await writeFile(tempPath, Buffer.alloc(0));
    for (const chunk of chunks.rows) await appendFile(tempPath, Buffer.from(chunk.data));
    await persistUploadedMedia(storageKey, session.mime_type, tempPath);
    await pool.query("DELETE FROM resumable_upload_sessions WHERE id=$1 AND user_id=$2", [id, req.currentUser!.id]);
    res.status(201).json({ storageKey, fileName: session.file_name, mimeType: session.mime_type, size: totalBytes, mediaUrl: "/api/lessons/media/" + storageKey + "?type=" + encodeURIComponent(session.mime_type) });
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    res.status(503).json({ error: error instanceof Error ? error.message : "Could not finalize upload. Resume with the same session." });
  }
});

router.delete("/sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const id = validId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid upload session." }); return; }
  await pool.query("DELETE FROM resumable_upload_sessions WHERE id=$1 AND user_id=$2", [id, req.currentUser!.id]);
  res.status(204).end();
});

export default router;
