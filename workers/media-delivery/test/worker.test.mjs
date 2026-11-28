import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { spawn } from "node:child_process";
import path from "node:path";
import worker from "../src/index.mjs";

if (!globalThis.crypto) Object.defineProperty(globalThis, "crypto", { value: webcrypto });

const storageKey = "123e4567-e89b-12d3-a456-426614174000";
const bytes = new TextEncoder().encode("Dallyletter private media range delivery");
const origin = "https://dallyletter.example";
const secret = "test-only-edge-signing-secret";

async function signature(key, expires) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(key + "\n" + String(expires)));
  return [...new Uint8Array(signed)].map(value => value.toString(16).padStart(2, "0")).join("");
}

async function signedUrl({ key = storageKey, expires = Math.floor(Date.now() / 1000) + 120, sig } = {}) {
  const url = new URL("https://media.example/media/" + key);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("sig", sig || await signature(key, expires));
  return url;
}

function environment(overrides = {}) {
  return {
    MEDIA_EDGE_SIGNING_SECRET: secret,
    ALLOWED_ORIGINS: origin,
    MEDIA_BUCKET: {
      async head(key) {
        assert.equal(key, storageKey);
        return { size: bytes.length, httpMetadata: { contentType: "application/pdf" }, httpEtag: '"test-etag"', uploaded: new Date("2026-11-28T00:00:00Z") };
      },
      async get(key, options) {
        assert.equal(key, storageKey);
        const data = options?.range
          ? bytes.slice(options.range.offset, options.range.offset + options.range.length)
          : bytes;
        return { body: new Response(data).body };
      },
    },
    ...overrides,
  };
}

test("signed private media GET streams the exact object with no-store headers", async () => {
  const url = await signedUrl();
  const response = await worker.fetch(new Request(url, { headers: { Origin: origin } }), environment());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/pdf");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
  assert.equal(new TextDecoder().decode(await response.arrayBuffer()), new TextDecoder().decode(bytes));
});

test("signed private media honors byte ranges and returns exact 206 metadata", async () => {
  const url = await signedUrl();
  const response = await worker.fetch(new Request(url, { headers: { Origin: origin, Range: "bytes=2-5" } }), environment());
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("Content-Range"), "bytes 2-5/" + bytes.length);
  assert.equal(response.headers.get("Content-Length"), "4");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes.slice(2, 6));
});

test("expired and tampered signatures are rejected before object lookup", async () => {
  let lookups = 0;
  const env = environment({ MEDIA_BUCKET: { async head() { lookups++; return null; }, async get() { lookups++; return null; } } });
  const expired = await signedUrl({ expires: Math.floor(Date.now() / 1000) - 1 });
  assert.equal((await worker.fetch(new Request(expired), env)).status, 403);
  const tampered = await signedUrl({ sig: "0".repeat(64) });
  assert.equal((await worker.fetch(new Request(tampered), env)).status, 403);
  assert.equal(lookups, 0);
});

test("invalid and unsatisfiable ranges return 416 with total object size", async () => {
  const url = await signedUrl();
  const response = await worker.fetch(new Request(url, { headers: { Range: "bytes=99999-100000" } }), environment());
  assert.equal(response.status, 416);
  assert.equal(response.headers.get("Content-Range"), "bytes */" + bytes.length);
});

test("HEAD, CORS preflight, origin restrictions and unsupported methods are enforced", async () => {
  const url = await signedUrl();
  const head = await worker.fetch(new Request(url, { method: "HEAD", headers: { Origin: origin } }), environment());
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("Content-Length"), String(bytes.length));
  assert.equal(await head.text(), "");

  const preflight = await worker.fetch(new Request("https://media.example/media/" + storageKey, {
    method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "GET" },
  }), environment());
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get("Access-Control-Allow-Methods") || "", /GET/);

  const denied = await worker.fetch(new Request(url, { headers: { Origin: "https://attacker.example" } }), environment());
  assert.equal(denied.status, 403);
  const post = await worker.fetch(new Request(url, { method: "POST" }), environment());
  assert.equal(post.status, 405);
});


test("delivery benchmark measures compressed bytes, decoded bytes, cold/warm latency and partial-range egress", async () => {
  const payload = Buffer.alloc(128 * 1024, 0x41);
  const compressed = gzipSync(payload);
  const server = createServer((request, response) => {
    const range = request.headers.range;
    if (range) {
      const match = /^bytes=(\\d+)-(\\d+)$/.exec(range);
      if (!match) {
        response.writeHead(416, { "Content-Range": "bytes */" + payload.length });
        response.end();
        return;
      }
      const start = Number(match[1]);
      const end = Math.min(Number(match[2]), payload.length - 1);
      const part = payload.subarray(start, end + 1);
      response.writeHead(206, {
        "Content-Length": String(part.length),
        "Content-Range": "bytes " + start + "-" + end + "/" + payload.length,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=60",
        "X-Cache": request.headers["cache-control"] === "no-cache" ? "MISS" : "HIT",
      });
      response.end(part);
      return;
    }
    response.writeHead(200, {
      "Content-Length": String(compressed.length),
      "Content-Encoding": "gzip",
      "Cache-Control": "public, max-age=60",
      "X-Cache": request.headers["cache-control"] === "no-cache" ? "MISS" : "HIT",
    });
    response.end(compressed);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.resolve(process.cwd(), "scripts/media-delivery-benchmark.mjs")], {
        env: {
          ...process.env,
          MEDIA_BENCH_URL: "http://127.0.0.1:" + address.port + "/media/" + randomUUID(),
          MEDIA_BENCH_RUNS: "4",
          MEDIA_BENCH_RANGE: "bytes=0-65535",
          MEDIA_BENCH_INCLUDE_RANGE: "true",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
      child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
      child.once("error", reject);
      child.once("close", code => resolve({ code, stdout, stderr }));
    });
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    const full = report.modes.find(mode => mode.mode === "full");
    const ranged = report.modes.find(mode => mode.mode === "range");
    assert.equal(full.cold.samples, 1);
    assert.equal(full.warm.samples, 3);
    assert.deepEqual(full.cold.cacheStatuses, ["MISS"]);
    assert.deepEqual(full.warm.cacheStatuses, ["HIT"]);
    assert.ok(full.cold.compressionRatio < 1);
    assert.ok(full.cold.compressionSavingsPercent > 0);
    assert.equal(full.totalDecodedBodyBytes, payload.length * 4);
    assert.equal(ranged.rangeResponses, 4);
    assert.equal(ranged.rangeIgnoredResponses, 0);
    assert.equal(ranged.results[0].decodedBodyBytes, 65536);
    assert.equal(report.totalDecodedResponseBodyBytes, payload.length * 4 + 65536 * 4);
    assert.ok(report.totalEncodedResponseBodyBytes > 0);
    assert.ok(report.measuredClientVisibleEgressMiB > 0);
    assert.ok(full.cold.p95LatencyMs >= full.cold.medianLatencyMs);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
