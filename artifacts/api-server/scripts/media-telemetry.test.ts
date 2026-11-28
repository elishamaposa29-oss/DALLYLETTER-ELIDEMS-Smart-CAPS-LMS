import test from "node:test";
import assert from "node:assert/strict";
import { mediaDurationSince } from "../src/lib/media-telemetry.ts";

test("media duration is non-negative and monotonic-safe", () => {
  const started = performance.now();
  assert.ok(mediaDurationSince(started) >= 0);
  assert.equal(mediaDurationSince(started + 100), 0);
});

import { parseMediaByteRange } from "../src/lib/media-range.ts";
import { s3CompatibleMediaProvider } from "../src/lib/object-storage.ts";

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
