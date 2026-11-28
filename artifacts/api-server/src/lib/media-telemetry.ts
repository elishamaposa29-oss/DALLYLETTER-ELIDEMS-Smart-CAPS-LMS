import { logger } from "./logger";

export type MediaOperation = "upload" | "download" | "delete";
export type MediaBackend = "s3-compatible" | "postgres-chunks" | "local";
export type MediaOutcome = "success" | "not-found" | "failure";

export interface MediaMetric {
  operation: MediaOperation;
  backend: MediaBackend;
  outcome: MediaOutcome;
  durationMs: number;
  bytes?: number;
  range?: boolean;
  statusCode?: number;
}

export function emitMediaMetric(metric: MediaMetric): void {
  // Deliberately exclude storage keys, URLs, user IDs, tokens and object metadata.
  const safe = {
    event: "media_transfer",
    operation: metric.operation,
    backend: metric.backend,
    outcome: metric.outcome,
    durationMs: Math.max(0, Math.round(metric.durationMs)),
    ...(Number.isSafeInteger(metric.bytes) && (metric.bytes ?? -1) >= 0 ? { bytes: metric.bytes } : {}),
    ...(metric.range === undefined ? {} : { range: metric.range }),
    ...(Number.isInteger(metric.statusCode) ? { statusCode: metric.statusCode } : {}),
  };
  if (metric.outcome === "failure") logger.warn(safe, "Media transfer failed");
  else logger.info(safe, "Media transfer");
}

export function mediaDurationSince(startedAt: number): number {
  return Math.max(0, performance.now() - startedAt);
}
