import crypto from "node:crypto";

export type AuthTokenPayload = { userId: number; ts: number };

const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export function generateSignedToken(userId: number, secret: string, now = Date.now()): string {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new TypeError("userId must be a positive safe integer");
  const encodedPayload = Buffer.from(JSON.stringify({ userId, ts: now } satisfies AuthTokenPayload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encodedPayload).digest("hex");
  return `${encodedPayload}.${signature}`;
}

export function parseSignedToken(token: string, secret: string, now = Date.now()): { userId: number } | null {
  try {
    if (typeof token !== "string" || token.length > 4096) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [encodedPayload, signature] = parts;
    if (!encodedPayload || !/^[a-f0-9]{64}$/i.test(signature)) return null;

    const expected = crypto.createHmac("sha256", secret).update(encodedPayload).digest();
    const supplied = Buffer.from(signature, "hex");
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(expected, supplied)) return null;

    const payload: unknown = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (!payload || typeof payload !== "object") return null;
    const record = payload as Record<string, unknown>;
    if (!Number.isSafeInteger(record.userId) || (record.userId as number) <= 0) return null;
    if (!Number.isSafeInteger(record.ts) || (record.ts as number) <= 0) return null;
    const issuedAt = record.ts as number;
    if (issuedAt > now + CLOCK_SKEW_MS || now - issuedAt > TOKEN_TTL_MS) return null;
    return { userId: record.userId as number };
  } catch {
    return null;
  }
}
