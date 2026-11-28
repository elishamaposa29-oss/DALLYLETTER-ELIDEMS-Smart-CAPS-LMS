import test from "node:test";
import assert from "node:assert/strict";
import { mediaDurationSince } from "../src/lib/media-telemetry.ts";

test("media duration is non-negative and monotonic-safe", () => {
  const started = performance.now();
  assert.ok(mediaDurationSince(started) >= 0);
  assert.equal(mediaDurationSince(started + 100), 0);
});
