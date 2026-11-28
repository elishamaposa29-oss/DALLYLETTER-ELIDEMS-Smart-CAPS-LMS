import test from "node:test";
import assert from "node:assert/strict";
import { mediaDurationSince } from "../src/lib/media-telemetry.ts";

test("media duration is non-negative and monotonic-safe", () => {
  const started = performance.now();
  assert.ok(mediaDurationSince(started) >= 0);
  assert.equal(mediaDurationSince(started + 100), 0);
});

import { parseMediaByteRange } from "../src/lib/media-range.ts";
import { s3CompatibleMediaProvider, headObject } from "../src/lib/object-storage.ts";

test("parses explicit, open-ended and suffix byte ranges", () => {
  assert.deepEqual(parseMediaByteRange("bytes=10-19", 100), { start: 10, end: 19 });
  assert.deepEqual(parseMediaByteRange("bytes=90-", 100), { start: 90, end: 99 });
  assert.deepEqual(parseMediaByteRange("bytes=-10", 100), { start: 90, end: 99 });
  assert.deepEqual(parseMediaByteRange("bytes=-200", 100), { start: 0, end: 99 });
});

test("rejects malformed, unsafe and unsatisfiable byte ranges", () => {
  for (const range of ["", "bytes=-", "bytes=abc-def", "bytes=10-9", "bytes=100-", "bytes=-0", "bytes=1-2,4-5"]) {
    assert.equal(parseMediaByteRange(range, 100), null, range);
  }
  assert.equal(parseMediaByteRange("bytes=0-1", 0), null);
  assert.equal(parseMediaByteRange("bytes=0-1", Number.MAX_SAFE_INTEGER + 1), null);
});


test("S3-compatible adapter exposes the provider-neutral storage contract", () => {
  assert.equal(s3CompatibleMediaProvider.name, "s3-compatible");
  assert.equal(s3CompatibleMediaProvider.supportsByteRanges, true);
  assert.equal(s3CompatibleMediaProvider.supportsStreamingUpload, true);
  assert.equal(typeof s3CompatibleMediaProvider.put, "function");
  assert.equal(typeof s3CompatibleMediaProvider.get, "function");
  assert.equal(typeof s3CompatibleMediaProvider.delete, "function");
});

import { createPresignedMediaUpload, createPresignedPrivateMediaRead } from "../src/lib/object-storage.ts";

test("presigned media URLs bind methods, content type and short expiries", () => {
  const env = ["MEDIA_S3_ENDPOINT","MEDIA_S3_BUCKET","MEDIA_S3_ACCESS_KEY_ID","MEDIA_S3_SECRET_ACCESS_KEY","MEDIA_S3_REGION"] as const;
  const prior = env.map(key => process.env[key]);
  process.env.MEDIA_S3_ENDPOINT = "https://objects.example.test";
  process.env.MEDIA_S3_BUCKET = "private-media";
  process.env.MEDIA_S3_ACCESS_KEY_ID = "test-access";
  process.env.MEDIA_S3_SECRET_ACCESS_KEY = "test-secret";
  process.env.MEDIA_S3_REGION = "auto";
  try {
    const key = "00000000-0000-4000-8000-000000000000";
    const upload = createPresignedMediaUpload(key, "image/png", 180);
    assert.equal(upload.method, "PUT");
    assert.equal(upload.headers["Content-Type"], "image/png");
    assert.ok(upload.url.includes("X-Amz-Signature="));
    assert.ok(upload.url.includes("X-Amz-Expires=180"));
    const read = createPresignedPrivateMediaRead(key, 90);
    assert.equal(read.method, "GET");
    assert.ok(read.url.includes("X-Amz-Expires=90"));
    assert.ok(upload.expiresAt <= Math.floor(Date.now() / 1000) + 181);
  } finally {
    env.forEach((key, index) => {
      if (prior[index] === undefined) delete process.env[key];
      else process.env[key] = prior[index];
    });
  }
});


test("object metadata HEAD is signed and treats missing objects as absent", async () => {
  const env = ["MEDIA_S3_ENDPOINT","MEDIA_S3_BUCKET","MEDIA_S3_ACCESS_KEY_ID","MEDIA_S3_SECRET_ACCESS_KEY","MEDIA_S3_REGION"] as const;
  const prior = env.map(key => process.env[key]);
  const originalFetch = globalThis.fetch;
  process.env.MEDIA_S3_ENDPOINT = "https://objects.example.test";
  process.env.MEDIA_S3_BUCKET = "private-media";
  process.env.MEDIA_S3_ACCESS_KEY_ID = "test-access";
  process.env.MEDIA_S3_SECRET_ACCESS_KEY = "test-secret";
  process.env.MEDIA_S3_REGION = "auto";
  const methods: string[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    methods.push(String(init?.method));
    return (methods.length === 1
      ? { status: 200, ok: true, headers: new Headers({ "content-length": "1234", "content-type": "video/mp4" }) }
      : { status: 404, ok: false, headers: new Headers() }) as Response;
  }) as typeof fetch;
  try {
    const found = await headObject("00000000-0000-4000-8000-000000000000");
    assert.deepEqual(found, { size: 1234, mimeType: "video/mp4" });
    assert.equal(await headObject("00000000-0000-4000-8000-000000000001"), null);
    assert.deepEqual(methods, ["HEAD", "HEAD"]);
  } finally {
    globalThis.fetch = originalFetch;
    env.forEach((key, index) => {
      if (prior[index] === undefined) delete process.env[key];
      else process.env[key] = prior[index];
    });
  }
});
