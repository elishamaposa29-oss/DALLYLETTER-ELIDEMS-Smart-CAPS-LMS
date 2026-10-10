import { createReadStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { deleteObject, getObject, isObjectStorageConfigured, putObject } from "./object-storage";

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

export async function persistUploadedMedia(storageKey: string, mimeType: string, localPath: string): Promise<"object-storage" | "local"> {
  if (!isObjectStorageConfigured()) {
    if (process.env.NODE_ENV === "production") {
      await unlink(localPath).catch(() => undefined);
      throw new Error("Persistent object storage is not configured; refusing an ephemeral production media upload.");
    }
    return "local";
  }
  await putObject(storageKey, mimeType, localPath);
  await unlink(localPath).catch(() => undefined);
  return "object-storage";
}

export async function streamStoredMedia(storageKey: string, range?: string): Promise<Response | null> {
  if (!isObjectStorageConfigured()) return null;
  return getObject(storageKey, range);
}

export async function removeStoredMedia(storageKey: string): Promise<void> {
  if (isObjectStorageConfigured()) await deleteObject(storageKey);
  await deleteStoredMedia(storageKey);
}
