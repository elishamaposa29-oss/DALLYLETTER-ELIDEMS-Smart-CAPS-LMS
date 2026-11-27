import { createHash } from "node:crypto";

export function isValidIdempotencyKey(value: string): boolean {
  return value.length > 0 && value.length <= 200 && /^[A-Za-z0-9._:-]+$/.test(value);
}

export function hashIdempotentRequest(method: string, path: string, body: unknown): string {
  return createHash("sha256").update(JSON.stringify({ method: method.toUpperCase(), path, body: body ?? null })).digest("hex");
}
