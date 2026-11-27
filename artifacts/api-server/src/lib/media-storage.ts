import { createReadStream } from "node:fs";
import { pool } from "@workspace/db";
import { mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { deleteCloudObject, deleteObject, getCloudObject, getObject, isObjectStorageConfigured, putCloudObject, putObject } from "./object-storage";
import { CLOUD_STORAGE_QUOTA_BYTES, isCloudStorageCategory, safeCloudFileName, type CloudStorageCategory } from "./cloud-storage-core";
import { createHash } from "node:crypto";

// Free-plan durable fallback: store small uploads in PostgreSQL in bounded chunks.
// Larger video uploads require configured S3-compatible object storage.
const DB_MEDIA_MAX_BYTES = 20 * 1024 * 1024;
const DB_MEDIA_CHUNK_BYTES = 1024 * 1024;

const mediaDirectory = path.resolve(process.env.MEDIA_STORAGE_DIR ?? "./var/media");

const allowedMimeTypes = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/webm",
  "audio/wav",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export const MAX_MEDIA_SIZE_BYTES = 250 * 1024 * 1024;

export function isAllowedMediaType(mimeType: string): boolean {
  return allowedMimeTypes.has(mimeType.split(";", 1)[0].trim().toLowerCase());
}

export function getMediaDirectory(): string {
  return mediaDirectory;
}

export async function ensureMediaDirectory(): Promise<void> {
  await mkdir(mediaDirectory, { recursive: true });
}

export function createMediaStorageKey(): string {
  return randomUUID();
}

export function getMediaPath(storageKey: string): string {
  if (!/^[a-f0-9-]{36}$/i.test(storageKey)) {
    throw new Error("Invalid media storage key");
  }

  return path.join(mediaDirectory, storageKey);
}

export async function getMediaStats(storageKey: string) {
  return stat(getMediaPath(storageKey));
}

export function openMediaStream(storageKey: string, start?: number, end?: number) {
  return createReadStream(getMediaPath(storageKey), { start, end });
}

export async function deleteStoredMedia(storageKey: string): Promise<void> {
  await unlink(getMediaPath(storageKey)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}

export type CloudMediaOwner = { userId: number; category: CloudStorageCategory; fileName: string };

export async function persistUploadedMedia(storageKey: string, mimeType: string, localPath: string, owner?: CloudMediaOwner): Promise<"object-storage" | "database"> {
  const fileStats = await stat(localPath);
  let reserved = false;
  let stored: "object-storage" | "database" | null = null;
  const cloudStorageKey = "media/" + storageKey;
  try {
    if (owner) {
      if (!Number.isSafeInteger(owner.userId) || owner.userId <= 0 || !isCloudStorageCategory(owner.category)) throw new Error("Invalid cloud media owner or category");
      await pool.query("INSERT INTO user_cloud_storage(user_id,quota_bytes,used_bytes) VALUES($1,$2,0) ON CONFLICT(user_id) DO NOTHING", [owner.userId, CLOUD_STORAGE_QUOTA_BYTES]);
      const reservation = await pool.query("UPDATE user_cloud_storage SET used_bytes=used_bytes+$2,updated_at=now() WHERE user_id=$1 AND used_bytes+$2<=quota_bytes RETURNING user_id", [owner.userId, fileStats.size]);
      if (!reservation.rows[0]) throw new Error("CLOUD_QUOTA_EXCEEDED: Your 10 GiB cloud storage allowance is full.");
      reserved = true;
    }

    if (isObjectStorageConfigured()) {
      try {
        if (owner) await putCloudObject(cloudStorageKey, mimeType, localPath);
        else await putObject(storageKey, mimeType, localPath);
        stored = "object-storage";
      } catch (error) {
        if (owner) throw error;
        // Preserve the existing small-file PostgreSQL fallback for legacy media.
      }
    }

    if (!stored) {
      if (fileStats.size > DB_MEDIA_MAX_BYTES) throw new Error("MEDIA_STORAGE_NOT_CONFIGURED: files larger than 20 MiB require configured S3-compatible object storage; use a smaller file or an external video URL");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM media_object_chunks WHERE storage_key = $1", [storageKey]);
        let index = 0;
        let pending = Buffer.alloc(0);
        for await (const part of createReadStream(localPath)) {
          pending = pending.length ? Buffer.concat([pending, Buffer.from(part)]) : Buffer.from(part);
          while (pending.length >= DB_MEDIA_CHUNK_BYTES) {
            const chunk = pending.subarray(0, DB_MEDIA_CHUNK_BYTES);
            await client.query("INSERT INTO media_object_chunks(storage_key,mime_type,size_bytes,chunk_index,data) VALUES($1,$2,$3,$4,$5)", [storageKey, mimeType, fileStats.size, index++, chunk]);
            pending = pending.subarray(DB_MEDIA_CHUNK_BYTES);
          }
        }
        if (pending.length || index === 0) await client.query("INSERT INTO media_object_chunks(storage_key,mime_type,size_bytes,chunk_index,data) VALUES($1,$2,$3,$4,$5)", [storageKey, mimeType, fileStats.size, index, pending]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
      stored = "database";
    }

    if (owner) {
      const hash = createHash("sha256");
      for await (const part of createReadStream(localPath)) hash.update(part);
      await pool.query("INSERT INTO user_cloud_objects(id,user_id,storage_key,file_name,mime_type,size_bytes,category,checksum_sha256) VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7)", [owner.userId, cloudStorageKey, safeCloudFileName(owner.fileName), mimeType, fileStats.size, owner.category, hash.digest("hex")]);
      reserved = false;
    }
    await unlink(localPath).catch(() => undefined);
    return stored;
  } catch (error) {
    if (owner && stored === "object-storage") await deleteCloudObject(cloudStorageKey).catch(() => undefined);
    if (stored === "database") await pool.query("DELETE FROM media_object_chunks WHERE storage_key=$1", [storageKey]).catch(() => undefined);
    if (owner && reserved) await pool.query("UPDATE user_cloud_storage SET used_bytes=GREATEST(0,used_bytes-$2),updated_at=now() WHERE user_id=$1", [owner.userId, fileStats.size]).catch(() => undefined);
    await unlink(localPath).catch(() => undefined);
    throw error;
  }
}

export async function streamStoredMedia(storageKey: string, range?: string): Promise<Response | null> {
  if (isObjectStorageConfigured()) {
    const remote = await getObject(storageKey, range);
    if (remote) return remote;
    const cloudRemote = await getCloudObject("media/" + storageKey, range);
    if (cloudRemote) return cloudRemote;
  }

  const { rows } = await pool.query(
    "SELECT mime_type, size_bytes, chunk_index, data FROM media_object_chunks WHERE storage_key = $1 ORDER BY chunk_index",
    [storageKey],
  );
  if (!rows.length) return null;
  const size = Number(rows[0].size_bytes);
  const mimeType = String(rows[0].mime_type || "application/octet-stream");
  const bytes = Buffer.concat(rows.map((row: { data: Buffer }) => Buffer.from(row.data)));
  if (bytes.length !== size) throw new Error("Stored media integrity check failed");

  const headers = new Headers({
    "Content-Type": mimeType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
  });
  if (!range) {
    headers.set("Content-Length", String(size));
    return new Response(bytes, { status: 200, headers });
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) return new Response(null, { status: 416, headers });
  const start = match[1] ? Number(match[1]) : Math.max(size - Number(match[2]), 0);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || start >= size) {
    headers.set("Content-Range", `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  const boundedEnd = Math.min(end, size - 1);
  const slice = bytes.subarray(start, boundedEnd + 1);
  headers.set("Content-Length", String(slice.length));
  headers.set("Content-Range", `bytes ${start}-${boundedEnd}/${size}`);
  return new Response(slice, { status: 206, headers });
}

export async function removeStoredMedia(storageKey: string): Promise<void> {
  const cloudKey = "media/" + storageKey;
  const registered = await pool.query("SELECT id,user_id,size_bytes,storage_key FROM user_cloud_objects WHERE storage_key=$1 LIMIT 1", [cloudKey]);
  if (registered.rows[0]) {
    if (isObjectStorageConfigured()) await deleteCloudObject(String(registered.rows[0].storage_key));
    await pool.query("DELETE FROM media_object_chunks WHERE storage_key=$1", [storageKey]);
    await deleteStoredMedia(storageKey);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const removed = await client.query("DELETE FROM user_cloud_objects WHERE id=$1 AND user_id=$2 RETURNING size_bytes", [registered.rows[0].id, registered.rows[0].user_id]);
      if (removed.rows[0]) await client.query("UPDATE user_cloud_storage SET used_bytes=GREATEST(0,used_bytes-$2),updated_at=now() WHERE user_id=$1", [registered.rows[0].user_id, removed.rows[0].size_bytes]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
    return;
  }
  if (isObjectStorageConfigured()) await deleteObject(storageKey);
  await pool.query("DELETE FROM media_object_chunks WHERE storage_key = $1", [storageKey]);
  await deleteStoredMedia(storageKey);
}
