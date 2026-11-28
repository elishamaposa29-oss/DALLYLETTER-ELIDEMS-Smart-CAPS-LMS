import type { Request, RequestHandler, Router } from "express";
import { createPresignedMediaUpload, isObjectStorageConfigured } from "./object-storage";
import { abortDirectMediaUpload, completeDirectMediaUpload, issueMediaUploadTicket } from "./media-upload-tickets";
import { isAllowedMediaType, MAX_MEDIA_SIZE_BYTES } from "./media-storage";

export type DirectMediaRouteBinding = {
  routeKey: string;
  targetType: string;
  targetId: string;
  maxBytes?: number;
};

type ResolveBinding = (request: Request) => Promise<DirectMediaRouteBinding | null>;
type CompletedUpload = { storageKey: string; size: number; sha256: string };
type DirectUploadOptions = { onCompleted?: (request: Request, upload: CompletedUpload) => Promise<unknown> };

function uploadMetadata(request: Request): { mimeType: string; size: number; sha256?: string } | null {
  const mimeType = typeof request.body?.mimeType === "string" ? request.body.mimeType.trim().toLowerCase() : "";
  const size = Number(request.body?.size);
  const sha256 = typeof request.body?.sha256 === "string" ? request.body.sha256.trim().toLowerCase() : undefined;
  if (!isAllowedMediaType(mimeType) || !Number.isSafeInteger(size) || size <= 0 || size > MAX_MEDIA_SIZE_BYTES ||
      (sha256 !== undefined && !/^[a-f0-9]{64}$/.test(sha256))) return null;
  return { mimeType, size, sha256 };
}

/**
 * Adds route-scoped direct upload ticket/complete/abort endpoints. The supplied
 * resolver must repeat the owning route's authorization and resource checks on
 * every operation; client-provided target identifiers are never trusted alone.
 */
export function registerDirectMediaUploadRoutes(
  router: Router,
  path: string,
  middleware: RequestHandler[],
  resolveBinding: ResolveBinding,
  options: DirectUploadOptions = {},
): void {
  router.post(path + "/direct-upload-ticket", ...middleware, async (request, response): Promise<void> => {
    if (!isObjectStorageConfigured()) { response.status(503).json({ error: "Direct media uploads require configured private object storage." }); return; }
    const metadata = uploadMetadata(request);
    if (!metadata) { response.status(400).json({ error: "A supported MIME type, exact file size and optional SHA-256 checksum are required." }); return; }
    try {
      const binding = await resolveBinding(request);
      if (!binding) { response.status(403).json({ error: "You are not authorized to upload media to this resource." }); return; }
      const issued = await issueMediaUploadTicket({
        userId: request.currentUser!.id, routeKey: binding.routeKey, targetType: binding.targetType,
        targetId: binding.targetId, mimeType: metadata.mimeType, maxBytes: Math.min(metadata.size, binding.maxBytes ?? MAX_MEDIA_SIZE_BYTES),
        expectedSha256: metadata.sha256,
      });
      const signed = createPresignedMediaUpload(issued.storageKey, metadata.mimeType, 300);
      response.status(201).json({ ticket: issued.ticket, storageKey: issued.storageKey, uploadUrl: signed.url,
        method: signed.method, headers: signed.headers, expiresAt: issued.expiresAt, expectedSize: metadata.size });
    } catch {
      response.status(503).json({ error: "A direct upload ticket could not be issued. Please retry." });
    }
  });

  router.post(path + "/direct-upload-complete", ...middleware, async (request, response): Promise<void> => {
    const ticket = typeof request.body?.ticket === "string" ? request.body.ticket : "";
    const mimeType = typeof request.body?.mimeType === "string" ? request.body.mimeType.trim().toLowerCase() : "";
    if (!ticket || ticket.length > 256 || !isAllowedMediaType(mimeType)) { response.status(400).json({ error: "A valid upload ticket and MIME type are required." }); return; }
    try {
      const binding = await resolveBinding(request);
      if (!binding) { response.status(403).json({ error: "You are not authorized to complete this upload." }); return; }
      const completed = await completeDirectMediaUpload({ ticket, userId: request.currentUser!.id,
        routeKey: binding.routeKey, targetType: binding.targetType, targetId: binding.targetId, mimeType });
      const payload = options.onCompleted
        ? await options.onCompleted(request, completed)
        : { mediaUrl: `/api/lessons/media/${completed.storageKey}?type=${encodeURIComponent(mimeType)}`,
            storageKey: completed.storageKey, mimeType, size: completed.size, sha256: completed.sha256 };
      response.status(201).json(payload);
    } catch {
      response.status(400).json({ error: "The uploaded object failed ticket, size, MIME or checksum verification. Restart the upload." });
    }
  });

  router.post(path + "/direct-upload-abort", ...middleware, async (request, response): Promise<void> => {
    const ticket = typeof request.body?.ticket === "string" ? request.body.ticket : "";
    const mimeType = typeof request.body?.mimeType === "string" ? request.body.mimeType.trim().toLowerCase() : "";
    if (!ticket || ticket.length > 256 || !isAllowedMediaType(mimeType)) { response.status(400).json({ error: "A valid upload ticket and MIME type are required." }); return; }
    try {
      const binding = await resolveBinding(request);
      if (!binding) { response.status(403).json({ error: "You are not authorized to abort this upload." }); return; }
      const aborted = await abortDirectMediaUpload({ ticket, userId: request.currentUser!.id,
        routeKey: binding.routeKey, targetType: binding.targetType, targetId: binding.targetId, mimeType });
      response.status(aborted ? 200 : 204).json(aborted ? { aborted: true } : {});
    } catch {
      response.status(202).json({ aborted: true, cleanupPending: true });
    }
  });
}
