import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat, open } from "node:fs/promises";
import { pool } from "@workspace/db";
import { persistUploadedMedia, removeStoredMedia, streamStoredMedia } from "./media-storage";


export async function ensureMediaUploadTicketSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.media_upload_tickets (
      id uuid PRIMARY KEY,
      token_hash char(64) NOT NULL UNIQUE,
      user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      route_key text NOT NULL CHECK (length(route_key) BETWEEN 1 AND 100),
      target_type text NOT NULL CHECK (length(target_type) BETWEEN 1 AND 60),
      target_id text NOT NULL CHECK (length(target_id) BETWEEN 1 AND 160),
      storage_key uuid NOT NULL UNIQUE,
      mime_type text NOT NULL CHECK (length(mime_type) BETWEEN 1 AND 160),
      max_bytes bigint NOT NULL CHECK (max_bytes > 0 AND max_bytes <= 262144000),
      expected_sha256 char(64),
      status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'uploaded', 'consumed', 'expired', 'rejected')),
      expires_at timestamptz NOT NULL,
      uploaded_size bigint,
      uploaded_sha256 char(64),
      uploaded_at timestamptz,
      consumed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (expected_sha256 IS NULL OR expected_sha256 ~ '^[a-f0-9]{64}
  userId: number;
  routeKey: string;
  targetType: string;
  targetId: string;
  mimeType: string;
  maxBytes: number;
  expectedSha256?: string;
  ttlSeconds?: number;
};

export type IssuedMediaUploadTicket = {
  ticket: string;
  ticketId: string;
  storageKey: string;
  expiresAt: string;
};

const SHA256_RE = /^[a-f0-9]{64}$/i;
const MAX_TTL_SECONDS = 15 * 60;
const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;

function digestTicket(ticket: string): string {
  return createHash("sha256").update(ticket, "utf8").digest("hex");
}

function validBinding(binding: MediaUploadBinding): void {
  if (!Number.isSafeInteger(binding.userId) || binding.userId <= 0) throw new Error("Invalid upload owner");
  for (const value of [binding.routeKey, binding.targetType, binding.targetId, binding.mimeType]) {
    if (!value.trim() || value.length > 160) throw new Error("Invalid upload binding");
  }
  if (!Number.isSafeInteger(binding.maxBytes) || binding.maxBytes <= 0 || binding.maxBytes > MAX_UPLOAD_BYTES) {
    throw new Error("Invalid upload size limit");
  }
  if (binding.expectedSha256 && !SHA256_RE.test(binding.expectedSha256)) throw new Error("Invalid expected SHA-256");
}

export async function issueMediaUploadTicket(binding: MediaUploadBinding): Promise<IssuedMediaUploadTicket> {
  validBinding(binding);
  const ttl = Math.min(Math.max(Math.floor(binding.ttlSeconds ?? 300), 30), MAX_TTL_SECONDS);
  const ticket = randomBytes(32).toString("base64url");
  const ticketId = randomUUID();
  const storageKey = binding.storageKey ?? randomUUID();
  const expiresAt = new Date(Date.now() + ttl * 1000);
  await pool.query(
    `INSERT INTO media_upload_tickets
      (id, token_hash, user_id, route_key, target_type, target_id, storage_key, mime_type, max_bytes, expected_sha256, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [ticketId, digestTicket(ticket), binding.userId, binding.routeKey, binding.targetType,
      binding.targetId, storageKey, binding.mimeType, binding.maxBytes,
      binding.expectedSha256?.toLowerCase() ?? null, expiresAt],
  );
  return { ticket, ticketId, storageKey, expiresAt: expiresAt.toISOString() };
}

export async function markMediaUploadVerified(input: {
  ticket: string;
  userId: number;
  routeKey: string;
  targetType: string;
  targetId: string;
  mimeType: string;
  size: number;
  sha256: string;
}): Promise<{ ticketId: string; storageKey: string }> {
  if (!SHA256_RE.test(input.sha256) || !Number.isSafeInteger(input.size) || input.size < 0) {
    throw new Error("Invalid uploaded media integrity metadata");
  }
  const result = await pool.query(
    `UPDATE media_upload_tickets
        SET status = 'uploaded', uploaded_size = $7, uploaded_sha256 = $8, uploaded_at = now()
      WHERE token_hash = $1 AND user_id = $2 AND route_key = $3
        AND target_type = $4 AND target_id = $5 AND mime_type = $6
        AND status = 'issued' AND expires_at > now()
        AND $7 <= max_bytes
        AND (expected_sha256 IS NULL OR expected_sha256 = $8)
      RETURNING id, storage_key`,
    [digestTicket(input.ticket), input.userId, input.routeKey, input.targetType,
      input.targetId, input.mimeType, input.size, input.sha256.toLowerCase()],
  );
  if (!result.rows[0]) throw new Error("Upload ticket binding, expiry, size or checksum verification failed");
  return { ticketId: String(result.rows[0].id), storageKey: String(result.rows[0].storage_key) };
}

export async function consumeMediaUploadTicket(input: {
  ticket: string;
  userId: number;
  routeKey: string;
  targetType: string;
  targetId: string;
  mimeType: string;
}): Promise<{ ticketId: string; storageKey: string; size: number; sha256: string }> {
  const result = await pool.query(
    `UPDATE media_upload_tickets
        SET status = 'consumed', consumed_at = now()
      WHERE token_hash = $1 AND user_id = $2 AND route_key = $3
        AND target_type = $4 AND target_id = $5 AND mime_type = $6
        AND status = 'uploaded' AND expires_at > now()
      RETURNING id, storage_key, uploaded_size, uploaded_sha256`,
    [digestTicket(input.ticket), input.userId, input.routeKey, input.targetType, input.targetId, input.mimeType],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Upload ticket is invalid, expired, already consumed or belongs to another target");
  return {
    ticketId: String(row.id),
    storageKey: String(row.storage_key),
    size: Number(row.uploaded_size),
    sha256: String(row.uploaded_sha256),
  };
}

export async function listExpiredUnconsumedMediaTickets(limit = 200): Promise<Array<{ ticketId: string; storageKey: string }>> {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 1000);
  const result = await pool.query(
    `WITH expired AS (
       SELECT id FROM media_upload_tickets
        WHERE status IN ('issued', 'uploaded') AND expires_at <= now()
        ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED
     )
     UPDATE media_upload_tickets t SET status = 'expired'
      FROM expired e WHERE t.id = e.id
      RETURNING t.id, t.storage_key`,
    [safeLimit],
  );
  return result.rows.map((row: { id: string; storage_key: string }) => ({
    ticketId: String(row.id), storageKey: String(row.storage_key),
  }));
}


/**
 * Reap expired ticket objects. Failed deletions remain in the expired state
 * and are retried by the next scheduled invocation.
 */
export async function cleanupExpiredMediaUploads(limit = 200): Promise<{ scanned: number; deleted: number; failed: number }> {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 1000);
  await pool.query(
    `UPDATE media_upload_tickets
        SET status = 'expired'
      WHERE status IN ('issued', 'uploaded') AND expires_at <= now()`,
  );
  const candidates = await pool.query(
    `SELECT id, storage_key FROM media_upload_tickets
      WHERE status = 'expired'
      ORDER BY expires_at ASC LIMIT $1`,
    [safeLimit],
  );
  let deleted = 0;
  let failed = 0;
  for (const row of candidates.rows as Array<{ id: string; storage_key: string }>) {
    try {
      await removeStoredMedia(String(row.storage_key));
      await pool.query("DELETE FROM media_upload_tickets WHERE id = $1 AND status = 'expired'", [row.id]);
      deleted += 1;
    } catch {
      failed += 1;
    }
  }
  return { scanned: candidates.rows.length, deleted, failed };
}


async function verifyMimeSignature(path: string, mimeType: string): Promise<void> {
  const handle = await open(path, "r");
  try {
    const header = Buffer.alloc(16);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const b = header.subarray(0, bytesRead);
    const starts = (...values: number[]) => values.every((value, index) => b[index] === value);
    const valid =
      (mimeType === "image/jpeg" && starts(0xff, 0xd8, 0xff)) ||
      (mimeType === "image/png" && starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) ||
      (mimeType === "image/webp" && b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") ||
      (mimeType === "application/pdf" && b.subarray(0, 5).toString() === "%PDF-") ||
      ((mimeType === "video/mp4" || mimeType === "video/quicktime" || mimeType === "audio/mp4") && b.subarray(4, 8).toString() === "ftyp") ||
      ((mimeType === "video/webm" || mimeType === "audio/webm") && starts(0x1a, 0x45, 0xdf, 0xa3)) ||
      ((mimeType === "audio/ogg" || mimeType === "video/ogg") && b.subarray(0, 4).toString() === "OggS") ||
      (mimeType === "audio/wav" && b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WAVE") ||
      (mimeType === "audio/mpeg" && (b.subarray(0, 3).toString() === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0))) ||
      (mimeType === "application/msword" && starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) ||
      (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" && starts(0x50, 0x4b, 0x03, 0x04));
    if (!valid) throw new Error("Uploaded file signature does not match its declared MIME type");
  } finally {
    await handle.close();
  }
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function sha256Response(response: Response): Promise<{ size: number; sha256: string }> {
  if (!response.body) throw new Error("Stored media returned no body");
  const hash = createHash("sha256");
  const reader = response.body.getReader();
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      hash.update(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return { size, sha256: hash.digest("hex") };
}

/**
 * Route handlers call this only after their own role/record authorization has
 * succeeded. The persisted ticket binds that exact actor, route and target.
 * Bytes are hashed before storage and read back before the ticket is consumed.
 */
export async function persistTicketedMediaUpload(input: {
  localPath: string;
  storageKey: string;
  mimeType: string;
  binding: Omit<MediaUploadBinding, "storageKey" | "expectedSha256">;
}): Promise<{ storageKey: string; size: number; sha256: string; backend: "object-storage" | "database" }> {
  const file = await stat(input.localPath);
  if (!file.isFile() || file.size <= 0 || file.size > input.binding.maxBytes) {
    throw new Error("Uploaded media size is outside the authorized limit");
  }
  await verifyMimeSignature(input.localPath, input.mimeType);\n  const sha256 = await sha256File(input.localPath);
  const issued = await issueMediaUploadTicket({
    ...input.binding,
    storageKey: input.storageKey,
    expectedSha256: sha256,
  });
  try {
    const verified = await markMediaUploadVerified({
      ticket: issued.ticket,
      userId: input.binding.userId,
      routeKey: input.binding.routeKey,
      targetType: input.binding.targetType,
      targetId: input.binding.targetId,
      mimeType: input.mimeType,
      size: file.size,
      sha256,
    });
    const backend = await persistUploadedMedia(verified.storageKey, input.mimeType, input.localPath);
    const readback = await streamStoredMedia(verified.storageKey);
    if (!readback || readback.status !== 200) throw new Error("Stored media read-back verification failed");
    const actual = await sha256Response(readback);
    if (actual.size !== file.size || actual.sha256 !== sha256) {
      throw new Error("Stored media size or SHA-256 does not match the uploaded file");
    }
    await consumeMediaUploadTicket({
      ticket: issued.ticket,
      userId: input.binding.userId,
      routeKey: input.binding.routeKey,
      targetType: input.binding.targetType,
      targetId: input.binding.targetId,
      mimeType: input.mimeType,
    });
    return { storageKey: verified.storageKey, size: actual.size, sha256: actual.sha256, backend };
  } catch (error) {
    let removed = false;
    try {
      await removeStoredMedia(input.storageKey);
      removed = true;
    } catch {
      // Keep a retryable expired ticket if the backing store is unavailable.
    }
    if (removed) {
      await pool.query("DELETE FROM media_upload_tickets WHERE id = $1 AND status <> 'consumed'", [issued.ticketId]).catch(() => undefined);
    } else {
      await pool.query("UPDATE media_upload_tickets SET status = 'expired', expires_at = now() WHERE id = $1 AND status <> 'consumed'", [issued.ticketId]).catch(() => undefined);
    }
    throw error;
  }
}
),
      CHECK (uploaded_sha256 IS NULL OR uploaded_sha256 ~ '^[a-f0-9]{64}
  userId: number;
  routeKey: string;
  targetType: string;
  targetId: string;
  mimeType: string;
  maxBytes: number;
  expectedSha256?: string;
  ttlSeconds?: number;
};

export type IssuedMediaUploadTicket = {
  ticket: string;
  ticketId: string;
  storageKey: string;
  expiresAt: string;
};

const SHA256_RE = /^[a-f0-9]{64}$/i;
const MAX_TTL_SECONDS = 15 * 60;
const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;

function digestTicket(ticket: string): string {
  return createHash("sha256").update(ticket, "utf8").digest("hex");
}

function validBinding(binding: MediaUploadBinding): void {
  if (!Number.isSafeInteger(binding.userId) || binding.userId <= 0) throw new Error("Invalid upload owner");
  for (const value of [binding.routeKey, binding.targetType, binding.targetId, binding.mimeType]) {
    if (!value.trim() || value.length > 160) throw new Error("Invalid upload binding");
  }
  if (!Number.isSafeInteger(binding.maxBytes) || binding.maxBytes <= 0 || binding.maxBytes > MAX_UPLOAD_BYTES) {
    throw new Error("Invalid upload size limit");
  }
  if (binding.expectedSha256 && !SHA256_RE.test(binding.expectedSha256)) throw new Error("Invalid expected SHA-256");
}

export async function issueMediaUploadTicket(binding: MediaUploadBinding): Promise<IssuedMediaUploadTicket> {
  validBinding(binding);
  const ttl = Math.min(Math.max(Math.floor(binding.ttlSeconds ?? 300), 30), MAX_TTL_SECONDS);
  const ticket = randomBytes(32).toString("base64url");
  const ticketId = randomUUID();
  const storageKey = binding.storageKey ?? randomUUID();
  const expiresAt = new Date(Date.now() + ttl * 1000);
  await pool.query(
    `INSERT INTO media_upload_tickets
      (id, token_hash, user_id, route_key, target_type, target_id, storage_key, mime_type, max_bytes, expected_sha256, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [ticketId, digestTicket(ticket), binding.userId, binding.routeKey, binding.targetType,
      binding.targetId, storageKey, binding.mimeType, binding.maxBytes,
      binding.expectedSha256?.toLowerCase() ?? null, expiresAt],
  );
  return { ticket, ticketId, storageKey, expiresAt: expiresAt.toISOString() };
}

export async function markMediaUploadVerified(input: {
  ticket: string;
  userId: number;
  routeKey: string;
  targetType: string;
  targetId: string;
  mimeType: string;
  size: number;
  sha256: string;
}): Promise<{ ticketId: string; storageKey: string }> {
  if (!SHA256_RE.test(input.sha256) || !Number.isSafeInteger(input.size) || input.size < 0) {
    throw new Error("Invalid uploaded media integrity metadata");
  }
  const result = await pool.query(
    `UPDATE media_upload_tickets
        SET status = 'uploaded', uploaded_size = $7, uploaded_sha256 = $8, uploaded_at = now()
      WHERE token_hash = $1 AND user_id = $2 AND route_key = $3
        AND target_type = $4 AND target_id = $5 AND mime_type = $6
        AND status = 'issued' AND expires_at > now()
        AND $7 <= max_bytes
        AND (expected_sha256 IS NULL OR expected_sha256 = $8)
      RETURNING id, storage_key`,
    [digestTicket(input.ticket), input.userId, input.routeKey, input.targetType,
      input.targetId, input.mimeType, input.size, input.sha256.toLowerCase()],
  );
  if (!result.rows[0]) throw new Error("Upload ticket binding, expiry, size or checksum verification failed");
  return { ticketId: String(result.rows[0].id), storageKey: String(result.rows[0].storage_key) };
}

export async function consumeMediaUploadTicket(input: {
  ticket: string;
  userId: number;
  routeKey: string;
  targetType: string;
  targetId: string;
  mimeType: string;
}): Promise<{ ticketId: string; storageKey: string; size: number; sha256: string }> {
  const result = await pool.query(
    `UPDATE media_upload_tickets
        SET status = 'consumed', consumed_at = now()
      WHERE token_hash = $1 AND user_id = $2 AND route_key = $3
        AND target_type = $4 AND target_id = $5 AND mime_type = $6
        AND status = 'uploaded' AND expires_at > now()
      RETURNING id, storage_key, uploaded_size, uploaded_sha256`,
    [digestTicket(input.ticket), input.userId, input.routeKey, input.targetType, input.targetId, input.mimeType],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Upload ticket is invalid, expired, already consumed or belongs to another target");
  return {
    ticketId: String(row.id),
    storageKey: String(row.storage_key),
    size: Number(row.uploaded_size),
    sha256: String(row.uploaded_sha256),
  };
}

export async function listExpiredUnconsumedMediaTickets(limit = 200): Promise<Array<{ ticketId: string; storageKey: string }>> {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 1000);
  const result = await pool.query(
    `WITH expired AS (
       SELECT id FROM media_upload_tickets
        WHERE status IN ('issued', 'uploaded') AND expires_at <= now()
        ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED
     )
     UPDATE media_upload_tickets t SET status = 'expired'
      FROM expired e WHERE t.id = e.id
      RETURNING t.id, t.storage_key`,
    [safeLimit],
  );
  return result.rows.map((row: { id: string; storage_key: string }) => ({
    ticketId: String(row.id), storageKey: String(row.storage_key),
  }));
}


/**
 * Reap expired ticket objects. Failed deletions remain in the expired state
 * and are retried by the next scheduled invocation.
 */
export async function cleanupExpiredMediaUploads(limit = 200): Promise<{ scanned: number; deleted: number; failed: number }> {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 1000);
  await pool.query(
    `UPDATE media_upload_tickets
        SET status = 'expired'
      WHERE status IN ('issued', 'uploaded') AND expires_at <= now()`,
  );
  const candidates = await pool.query(
    `SELECT id, storage_key FROM media_upload_tickets
      WHERE status = 'expired'
      ORDER BY expires_at ASC LIMIT $1`,
    [safeLimit],
  );
  let deleted = 0;
  let failed = 0;
  for (const row of candidates.rows as Array<{ id: string; storage_key: string }>) {
    try {
      await removeStoredMedia(String(row.storage_key));
      await pool.query("DELETE FROM media_upload_tickets WHERE id = $1 AND status = 'expired'", [row.id]);
      deleted += 1;
    } catch {
      failed += 1;
    }
  }
  return { scanned: candidates.rows.length, deleted, failed };
}


async function verifyMimeSignature(path: string, mimeType: string): Promise<void> {
  const handle = await open(path, "r");
  try {
    const header = Buffer.alloc(16);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const b = header.subarray(0, bytesRead);
    const starts = (...values: number[]) => values.every((value, index) => b[index] === value);
    const valid =
      (mimeType === "image/jpeg" && starts(0xff, 0xd8, 0xff)) ||
      (mimeType === "image/png" && starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) ||
      (mimeType === "image/webp" && b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") ||
      (mimeType === "application/pdf" && b.subarray(0, 5).toString() === "%PDF-") ||
      ((mimeType === "video/mp4" || mimeType === "video/quicktime" || mimeType === "audio/mp4") && b.subarray(4, 8).toString() === "ftyp") ||
      ((mimeType === "video/webm" || mimeType === "audio/webm") && starts(0x1a, 0x45, 0xdf, 0xa3)) ||
      ((mimeType === "audio/ogg" || mimeType === "video/ogg") && b.subarray(0, 4).toString() === "OggS") ||
      (mimeType === "audio/wav" && b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WAVE") ||
      (mimeType === "audio/mpeg" && (b.subarray(0, 3).toString() === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0))) ||
      (mimeType === "application/msword" && starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) ||
      (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" && starts(0x50, 0x4b, 0x03, 0x04));
    if (!valid) throw new Error("Uploaded file signature does not match its declared MIME type");
  } finally {
    await handle.close();
  }
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function sha256Response(response: Response): Promise<{ size: number; sha256: string }> {
  if (!response.body) throw new Error("Stored media returned no body");
  const hash = createHash("sha256");
  const reader = response.body.getReader();
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      hash.update(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return { size, sha256: hash.digest("hex") };
}

/**
 * Route handlers call this only after their own role/record authorization has
 * succeeded. The persisted ticket binds that exact actor, route and target.
 * Bytes are hashed before storage and read back before the ticket is consumed.
 */
export async function persistTicketedMediaUpload(input: {
  localPath: string;
  storageKey: string;
  mimeType: string;
  binding: Omit<MediaUploadBinding, "storageKey" | "expectedSha256">;
}): Promise<{ storageKey: string; size: number; sha256: string; backend: "object-storage" | "database" }> {
  const file = await stat(input.localPath);
  if (!file.isFile() || file.size <= 0 || file.size > input.binding.maxBytes) {
    throw new Error("Uploaded media size is outside the authorized limit");
  }
  await verifyMimeSignature(input.localPath, input.mimeType);\n  const sha256 = await sha256File(input.localPath);
  const issued = await issueMediaUploadTicket({
    ...input.binding,
    storageKey: input.storageKey,
    expectedSha256: sha256,
  });
  try {
    const verified = await markMediaUploadVerified({
      ticket: issued.ticket,
      userId: input.binding.userId,
      routeKey: input.binding.routeKey,
      targetType: input.binding.targetType,
      targetId: input.binding.targetId,
      mimeType: input.mimeType,
      size: file.size,
      sha256,
    });
    const backend = await persistUploadedMedia(verified.storageKey, input.mimeType, input.localPath);
    const readback = await streamStoredMedia(verified.storageKey);
    if (!readback || readback.status !== 200) throw new Error("Stored media read-back verification failed");
    const actual = await sha256Response(readback);
    if (actual.size !== file.size || actual.sha256 !== sha256) {
      throw new Error("Stored media size or SHA-256 does not match the uploaded file");
    }
    await consumeMediaUploadTicket({
      ticket: issued.ticket,
      userId: input.binding.userId,
      routeKey: input.binding.routeKey,
      targetType: input.binding.targetType,
      targetId: input.binding.targetId,
      mimeType: input.mimeType,
    });
    return { storageKey: verified.storageKey, size: actual.size, sha256: actual.sha256, backend };
  } catch (error) {
    await removeStoredMedia(input.storageKey).catch(() => undefined);
    await pool.query(
      "UPDATE media_upload_tickets SET status = 'rejected' WHERE id = $1 AND status <> 'consumed'",
      [issued.ticketId],
    ).catch(() => undefined);
    throw error;
  }
}
),
      CHECK (uploaded_size IS NULL OR uploaded_size >= 0)
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS media_upload_tickets_expiry_idx ON public.media_upload_tickets (expires_at) WHERE status IN ('issued', 'uploaded', 'expired')");
}

export type MediaUploadBinding = {
  userId: number;
  routeKey: string;
  targetType: string;
  targetId: string;
  mimeType: string;
  maxBytes: number;
  expectedSha256?: string;
  ttlSeconds?: number;
};

export type IssuedMediaUploadTicket = {
  ticket: string;
  ticketId: string;
  storageKey: string;
  expiresAt: string;
};

const SHA256_RE = /^[a-f0-9]{64}$/i;
const MAX_TTL_SECONDS = 15 * 60;
const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;

function digestTicket(ticket: string): string {
  return createHash("sha256").update(ticket, "utf8").digest("hex");
}

function validBinding(binding: MediaUploadBinding): void {
  if (!Number.isSafeInteger(binding.userId) || binding.userId <= 0) throw new Error("Invalid upload owner");
  for (const value of [binding.routeKey, binding.targetType, binding.targetId, binding.mimeType]) {
    if (!value.trim() || value.length > 160) throw new Error("Invalid upload binding");
  }
  if (!Number.isSafeInteger(binding.maxBytes) || binding.maxBytes <= 0 || binding.maxBytes > MAX_UPLOAD_BYTES) {
    throw new Error("Invalid upload size limit");
  }
  if (binding.expectedSha256 && !SHA256_RE.test(binding.expectedSha256)) throw new Error("Invalid expected SHA-256");
}

export async function issueMediaUploadTicket(binding: MediaUploadBinding): Promise<IssuedMediaUploadTicket> {
  validBinding(binding);
  const ttl = Math.min(Math.max(Math.floor(binding.ttlSeconds ?? 300), 30), MAX_TTL_SECONDS);
  const ticket = randomBytes(32).toString("base64url");
  const ticketId = randomUUID();
  const storageKey = binding.storageKey ?? randomUUID();
  const expiresAt = new Date(Date.now() + ttl * 1000);
  await pool.query(
    `INSERT INTO media_upload_tickets
      (id, token_hash, user_id, route_key, target_type, target_id, storage_key, mime_type, max_bytes, expected_sha256, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [ticketId, digestTicket(ticket), binding.userId, binding.routeKey, binding.targetType,
      binding.targetId, storageKey, binding.mimeType, binding.maxBytes,
      binding.expectedSha256?.toLowerCase() ?? null, expiresAt],
  );
  return { ticket, ticketId, storageKey, expiresAt: expiresAt.toISOString() };
}

export async function markMediaUploadVerified(input: {
  ticket: string;
  userId: number;
  routeKey: string;
  targetType: string;
  targetId: string;
  mimeType: string;
  size: number;
  sha256: string;
}): Promise<{ ticketId: string; storageKey: string }> {
  if (!SHA256_RE.test(input.sha256) || !Number.isSafeInteger(input.size) || input.size < 0) {
    throw new Error("Invalid uploaded media integrity metadata");
  }
  const result = await pool.query(
    `UPDATE media_upload_tickets
        SET status = 'uploaded', uploaded_size = $7, uploaded_sha256 = $8, uploaded_at = now()
      WHERE token_hash = $1 AND user_id = $2 AND route_key = $3
        AND target_type = $4 AND target_id = $5 AND mime_type = $6
        AND status = 'issued' AND expires_at > now()
        AND $7 <= max_bytes
        AND (expected_sha256 IS NULL OR expected_sha256 = $8)
      RETURNING id, storage_key`,
    [digestTicket(input.ticket), input.userId, input.routeKey, input.targetType,
      input.targetId, input.mimeType, input.size, input.sha256.toLowerCase()],
  );
  if (!result.rows[0]) throw new Error("Upload ticket binding, expiry, size or checksum verification failed");
  return { ticketId: String(result.rows[0].id), storageKey: String(result.rows[0].storage_key) };
}

export async function consumeMediaUploadTicket(input: {
  ticket: string;
  userId: number;
  routeKey: string;
  targetType: string;
  targetId: string;
  mimeType: string;
}): Promise<{ ticketId: string; storageKey: string; size: number; sha256: string }> {
  const result = await pool.query(
    `UPDATE media_upload_tickets
        SET status = 'consumed', consumed_at = now()
      WHERE token_hash = $1 AND user_id = $2 AND route_key = $3
        AND target_type = $4 AND target_id = $5 AND mime_type = $6
        AND status = 'uploaded' AND expires_at > now()
      RETURNING id, storage_key, uploaded_size, uploaded_sha256`,
    [digestTicket(input.ticket), input.userId, input.routeKey, input.targetType, input.targetId, input.mimeType],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Upload ticket is invalid, expired, already consumed or belongs to another target");
  return {
    ticketId: String(row.id),
    storageKey: String(row.storage_key),
    size: Number(row.uploaded_size),
    sha256: String(row.uploaded_sha256),
  };
}

export async function listExpiredUnconsumedMediaTickets(limit = 200): Promise<Array<{ ticketId: string; storageKey: string }>> {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 1000);
  const result = await pool.query(
    `WITH expired AS (
       SELECT id FROM media_upload_tickets
        WHERE status IN ('issued', 'uploaded') AND expires_at <= now()
        ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED
     )
     UPDATE media_upload_tickets t SET status = 'expired'
      FROM expired e WHERE t.id = e.id
      RETURNING t.id, t.storage_key`,
    [safeLimit],
  );
  return result.rows.map((row: { id: string; storage_key: string }) => ({
    ticketId: String(row.id), storageKey: String(row.storage_key),
  }));
}


/**
 * Reap expired ticket objects. Failed deletions remain in the expired state
 * and are retried by the next scheduled invocation.
 */
export async function cleanupExpiredMediaUploads(limit = 200): Promise<{ scanned: number; deleted: number; failed: number }> {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 1000);
  await pool.query(
    `UPDATE media_upload_tickets
        SET status = 'expired'
      WHERE status IN ('issued', 'uploaded') AND expires_at <= now()`,
  );
  const candidates = await pool.query(
    `SELECT id, storage_key FROM media_upload_tickets
      WHERE status = 'expired'
      ORDER BY expires_at ASC LIMIT $1`,
    [safeLimit],
  );
  let deleted = 0;
  let failed = 0;
  for (const row of candidates.rows as Array<{ id: string; storage_key: string }>) {
    try {
      await removeStoredMedia(String(row.storage_key));
      await pool.query("DELETE FROM media_upload_tickets WHERE id = $1 AND status = 'expired'", [row.id]);
      deleted += 1;
    } catch {
      failed += 1;
    }
  }
  return { scanned: candidates.rows.length, deleted, failed };
}


async function verifyMimeSignature(path: string, mimeType: string): Promise<void> {
  const handle = await open(path, "r");
  try {
    const header = Buffer.alloc(16);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const b = header.subarray(0, bytesRead);
    const starts = (...values: number[]) => values.every((value, index) => b[index] === value);
    const valid =
      (mimeType === "image/jpeg" && starts(0xff, 0xd8, 0xff)) ||
      (mimeType === "image/png" && starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) ||
      (mimeType === "image/webp" && b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") ||
      (mimeType === "application/pdf" && b.subarray(0, 5).toString() === "%PDF-") ||
      ((mimeType === "video/mp4" || mimeType === "video/quicktime" || mimeType === "audio/mp4") && b.subarray(4, 8).toString() === "ftyp") ||
      ((mimeType === "video/webm" || mimeType === "audio/webm") && starts(0x1a, 0x45, 0xdf, 0xa3)) ||
      ((mimeType === "audio/ogg" || mimeType === "video/ogg") && b.subarray(0, 4).toString() === "OggS") ||
      (mimeType === "audio/wav" && b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WAVE") ||
      (mimeType === "audio/mpeg" && (b.subarray(0, 3).toString() === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0))) ||
      (mimeType === "application/msword" && starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) ||
      (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" && starts(0x50, 0x4b, 0x03, 0x04));
    if (!valid) throw new Error("Uploaded file signature does not match its declared MIME type");
  } finally {
    await handle.close();
  }
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function sha256Response(response: Response): Promise<{ size: number; sha256: string }> {
  if (!response.body) throw new Error("Stored media returned no body");
  const hash = createHash("sha256");
  const reader = response.body.getReader();
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      hash.update(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return { size, sha256: hash.digest("hex") };
}

/**
 * Route handlers call this only after their own role/record authorization has
 * succeeded. The persisted ticket binds that exact actor, route and target.
 * Bytes are hashed before storage and read back before the ticket is consumed.
 */
export async function persistTicketedMediaUpload(input: {
  localPath: string;
  storageKey: string;
  mimeType: string;
  binding: Omit<MediaUploadBinding, "storageKey" | "expectedSha256">;
}): Promise<{ storageKey: string; size: number; sha256: string; backend: "object-storage" | "database" }> {
  const file = await stat(input.localPath);
  if (!file.isFile() || file.size <= 0 || file.size > input.binding.maxBytes) {
    throw new Error("Uploaded media size is outside the authorized limit");
  }
  await verifyMimeSignature(input.localPath, input.mimeType);\n  const sha256 = await sha256File(input.localPath);
  const issued = await issueMediaUploadTicket({
    ...input.binding,
    storageKey: input.storageKey,
    expectedSha256: sha256,
  });
  try {
    const verified = await markMediaUploadVerified({
      ticket: issued.ticket,
      userId: input.binding.userId,
      routeKey: input.binding.routeKey,
      targetType: input.binding.targetType,
      targetId: input.binding.targetId,
      mimeType: input.mimeType,
      size: file.size,
      sha256,
    });
    const backend = await persistUploadedMedia(verified.storageKey, input.mimeType, input.localPath);
    const readback = await streamStoredMedia(verified.storageKey);
    if (!readback || readback.status !== 200) throw new Error("Stored media read-back verification failed");
    const actual = await sha256Response(readback);
    if (actual.size !== file.size || actual.sha256 !== sha256) {
      throw new Error("Stored media size or SHA-256 does not match the uploaded file");
    }
    await consumeMediaUploadTicket({
      ticket: issued.ticket,
      userId: input.binding.userId,
      routeKey: input.binding.routeKey,
      targetType: input.binding.targetType,
      targetId: input.binding.targetId,
      mimeType: input.mimeType,
    });
    return { storageKey: verified.storageKey, size: actual.size, sha256: actual.sha256, backend };
  } catch (error) {
    await removeStoredMedia(input.storageKey).catch(() => undefined);
    await pool.query(
      "UPDATE media_upload_tickets SET status = 'rejected' WHERE id = $1 AND status <> 'consumed'",
      [issued.ticketId],
    ).catch(() => undefined);
    throw error;
  }
}
