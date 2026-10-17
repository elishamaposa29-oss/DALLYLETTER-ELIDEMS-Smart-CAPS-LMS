import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { pool } from "@workspace/db";
import { mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { deleteObject, getObject, isObjectStorageConfigured, putObject } from "./object-storage";

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

export async function persistUploadedMedia(storageKey: string, mimeType: string, localPath: string): Promise<"object-storage" | "database"> {
  try {
    if (isObjectStorageConfigured()) {
      await putObject(storageKey, mimeType, localPath);
      await unlink(localPath).catch(() => undefined);
      return "object-storage";
    }

    const fileStats = await stat(localPath);
    if (fileStats.size > DB_MEDIA_MAX_BYTES) {
      throw new Error("MEDIA_STORAGE_NOT_CONFIGURED: files larger than 20 MiB require configured S3-compatible object storage; use a smaller file or an external video URL");
    }

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
          await client.query(
            "INSERT INTO media_object_chunks(storage_key, mime_type, size_bytes, chunk_index, data) VALUES($1,$2,$3,$4,$5)",
            [storageKey, mimeType, fileStats.size, index++, chunk],
          );
          pending = pending.subarray(DB_MEDIA_CHUNK_BYTES);
        }
      }
      if (pending.length || index === 0) {
        await client.query(
          "INSERT INTO media_object_chunks(storage_key, mime_type, size_bytes, chunk_index, data) VALUES($1,$2,$3,$4,$5)",
          [storageKey, mimeType, fileStats.size, index, pending],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    await unlink(localPath).catch(() => undefined);
    return "database";
  } catch (error) {
    await unlink(localPath).catch(() => undefined);
    throw error;
  }
}

export async function streamStoredMedia(storageKey: string, range?: string): Promise<Response | null> {
  if (isObjectStorageConfigured()) {
    const remote = await getObject(storageKey, range);
    if (remote) return remote;
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
  const match = /^bytes=(\\d*)-(\\d*)$/.exec(range);
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
  if (isObjectStorageConfigured()) await deleteObject(storageKey);
  await pool.query("DELETE FROM media_object_chunks WHERE storage_key = $1", [storageKey]);
  await deleteStoredMedia(storageKey);
}
