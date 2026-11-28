import { createReadStream } from "node:fs";
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
      try {
        await putObject(storageKey, mimeType, localPath);
        await unlink(localPath).catch(() => undefined);
        return "object-storage";
      } catch {
        // An unavailable object store should not break small uploads when PostgreSQL fallback is available.
      }
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

  // Read metadata first. Browsers commonly request byte ranges while seeking through
  // audio/video; loading every PostgreSQL chunk for each seek wastes DB I/O and RAM.
  const metadata = await pool.query(
    "SELECT mime_type, size_bytes FROM media_object_chunks WHERE storage_key = $1 ORDER BY chunk_index LIMIT 1",
    [storageKey],
  );
  if (!metadata.rows.length) return null;

  const size = Number(metadata.rows[0].size_bytes);
  const mimeType = String(metadata.rows[0].mime_type || "application/octet-stream");
  if (!Number.isSafeInteger(size) || size < 0) throw new Error("Stored media size is invalid");
  if (size === 0) {
    if (range) return new Response(null, { status: 416, headers: { "Content-Range": "bytes */0", "Accept-Ranges": "bytes" } });
    return new Response(new Uint8Array(), {
      status: 200,
      headers: { "Content-Type": mimeType, "Accept-Ranges": "bytes", "Cache-Control": "private, no-store", "Content-Length": "0" },
    });
  }

  let start = 0;
  let end = size - 1;
  if (range) {
    const match = /^bytes=(\\d*)-(\\d*)$/.exec(range.trim());
    if (!match || size === 0 || (!match[1] && !match[2])) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes" } });
    }
    if (!match[1]) {
      const suffixLength = Number(match[2]);
      if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes" } });
      }
      start = Math.max(size - suffixLength, 0);
    } else {
      start = Number(match[1]);
    }
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes" } });
    }
    end = Math.min(end, size - 1);
  }

  const firstChunk = Math.floor(start / DB_MEDIA_CHUNK_BYTES);
  const lastChunk = Math.floor(end / DB_MEDIA_CHUNK_BYTES);
  const chunks = await pool.query(
    range
      ? "SELECT chunk_index, data FROM media_object_chunks WHERE storage_key = $1 AND chunk_index BETWEEN $2 AND $3 ORDER BY chunk_index"
      : "SELECT chunk_index, data FROM media_object_chunks WHERE storage_key = $1 ORDER BY chunk_index",
    range ? [storageKey, firstChunk, lastChunk] : [storageKey],
  );

  const expectedChunkCount = lastChunk - firstChunk + 1;
  if (chunks.rows.length !== expectedChunkCount) throw new Error("Stored media is incomplete");
  const bytes = Buffer.concat(chunks.rows.map((row: { data: Buffer }) => Buffer.from(row.data)));
  const offset = range ? start - firstChunk * DB_MEDIA_CHUNK_BYTES : 0;
  const body = bytes.subarray(offset, offset + (end - start + 1));

  const headers = new Headers({
    "Content-Type": mimeType,
    "Accept-Ranges": "bytes",
    // Media remains private because this endpoint is authenticated. Do not make
    // personalized or permission-controlled objects publicly cacheable.
    "Cache-Control": "private, no-store",
    "Content-Length": String(body.length),
  });
  if (range) {
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    return new Response(body, { status: 206, headers });
  }
  if (body.length !== size) throw new Error("Stored media integrity check failed");
  return new Response(body, { status: 200, headers });
}

export async function removeStoredMedia(storageKey: string): Promise<void> {
  if (isObjectStorageConfigured()) await deleteObject(storageKey);
  await pool.query("DELETE FROM media_object_chunks WHERE storage_key = $1", [storageKey]);
  await deleteStoredMedia(storageKey);
}
