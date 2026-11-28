import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
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
