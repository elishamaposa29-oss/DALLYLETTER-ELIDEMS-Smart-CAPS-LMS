import test from "node:test";
import assert from "node:assert/strict";
import { generateSignedToken, parseSignedToken } from "./signed-token.js";

const secret = "unit-test-secret-that-is-not-used-in-production";

test("signed token round-trips a positive user id", () => {
  const token = generateSignedToken(42, secret, 1700000000000);
  assert.deepEqual(parseSignedToken(token, secret), { userId: 42 });
});

test("rejects altered payload and altered signature", () => {
  const token = generateSignedToken(42, secret);
  const [payload, signature] = token.split(".");
  assert.equal(parseSignedToken(`${payload}.${"0".repeat(64)}`, secret), null);
  const tamperedPayload = Buffer.from(JSON.stringify({ userId: 43, ts: Date.now() })).toString("base64url");
  assert.equal(parseSignedToken(`${tamperedPayload}.${signature}`, secret), null);
});

test("rejects malformed, extra-part, oversized and invalid-id tokens", () => {
  assert.equal(parseSignedToken("", secret), null);
  assert.equal(parseSignedToken("a.b.c", secret), null);
  assert.equal(parseSignedToken("a.not-hex", secret), null);
  assert.equal(parseSignedToken("x".repeat(4097), secret), null);
  for (const userId of [0, -1, 1.5, "42", Number.MAX_SAFE_INTEGER + 1, null]) {
    const payload = Buffer.from(JSON.stringify({ userId, ts: Date.now() })).toString("base64url");
    const signature = (await import("node:crypto")).default.createHmac("sha256", secret).update(payload).digest("hex");
    assert.equal(parseSignedToken(`${payload}.${signature}`, secret), null, String(userId));
  }
});

test("rejects missing or invalid timestamp even when correctly signed", async () => {
  const crypto = await import("node:crypto");
  for (const ts of [undefined, 0, -1, "now", Number.MAX_SAFE_INTEGER + 1]) {
    const payload = Buffer.from(JSON.stringify({ userId: 7, ts })).toString("base64url");
    const signature = crypto.default.createHmac("sha256", secret).update(payload).digest("hex");
    assert.equal(parseSignedToken(`${payload}.${signature}`, secret), null);
  }
});
