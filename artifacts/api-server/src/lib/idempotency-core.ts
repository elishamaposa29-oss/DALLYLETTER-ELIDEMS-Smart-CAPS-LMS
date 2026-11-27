import { createHash } from "node:crypto";

export function isValidIdempotencyKey(value: string): boolean {
  return value.length > 0 && value.length <= 200 && /^[A-Za-z0-9._:-]+$/.test(value);
}

export function hashIdempotentRequest(method: string, path: string, body: unknown): string {
  return createHash("sha256").update(JSON.stringify({ method: method.toUpperCase(), path, body: body ?? null })).digest("hex");
}

export type StoredIdempotencyRecord<T = unknown> = { requestHash: string; state: "pending" | "complete"; responseStatus: number | null; responseBody: T };
export type IdempotencyReplayDecision<T = unknown> =
  | { kind: "conflict" }
  | { kind: "pending" }
  | { kind: "replay"; status: number; body: T };

export function classifyIdempotencyRecord<T>(record: StoredIdempotencyRecord<T>, requestHash: string): IdempotencyReplayDecision<T> {
  if (record.requestHash !== requestHash) return { kind: "conflict" };
  if (record.state !== "complete" || record.responseStatus == null) return { kind: "pending" };
  return { kind: "replay", status: record.responseStatus, body: record.responseBody };
}
