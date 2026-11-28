const UUID = /^[a-f0-9-]{36}$/i;
const HEX = /^[a-f0-9]{64}$/i;

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

async function sign(secret, storageKey, expiresAt) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const payload = new TextEncoder().encode(storageKey + "\n" + String(expiresAt));
  const signature = await crypto.subtle.sign("HMAC", key, payload);
  return [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function corsHeaders(request, env) {
  const headers = new Headers({
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, If-Range, If-None-Match",
    "Access-Control-Expose-Headers": "Accept-Ranges, Content-Range, Content-Length, Content-Type, ETag, Last-Modified",
    "Access-Control-Max-Age": "600",
  });
  const origin = request.headers.get("Origin");
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return { headers, origin, allowed };
}

function response(status, body, headers) {
  const output = new Headers(headers);
  output.set("Cache-Control", "private, no-store, max-age=0");
  output.set("Pragma", "no-cache");
  output.set("X-Content-Type-Options", "nosniff");
  output.set("Referrer-Policy", "no-referrer");
  return new Response(body, { status, headers: output });
}

function parseRange(value, size) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return false;
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return false;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return false;
  return { offset: start, length: Math.min(end, size - 1) - start + 1 };
}

export default {
  async fetch(request, env) {
    const { headers: cors, origin, allowed } = corsHeaders(request, env);
    if (request.method === "OPTIONS") {
      if (origin && !allowed.includes(origin)) return response(403, "Origin not allowed", cors);
      return response(204, null, cors);
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return response(405, "Method not allowed", cors);
    }
    if (origin && !allowed.includes(origin)) return response(403, "Origin not allowed", cors);
    if (!env.MEDIA_BUCKET || !env.MEDIA_EDGE_SIGNING_SECRET) return response(503, "Private media delivery is not configured", cors);

    const url = new URL(request.url);
    const storageKey = url.pathname.startsWith("/media/") ? url.pathname.slice("/media/".length) : "";
    const expiresText = url.searchParams.get("expires") || "";
    const signature = url.searchParams.get("sig") || "";
    if (!UUID.test(storageKey) || !/^\d{10}$/.test(expiresText) || !HEX.test(signature)) {
      return response(404, "Media not found", cors);
    }
    const expiresAt = Number(expiresText);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(expiresAt) || expiresAt < now || expiresAt > now + 300) {
      return response(403, "Media link expired", cors);
    }
    const expected = await sign(env.MEDIA_EDGE_SIGNING_SECRET, storageKey, expiresAt);
    if (!constantTimeEqual(signature.toLowerCase(), expected)) return response(403, "Invalid media signature", cors);

    const metadata = await env.MEDIA_BUCKET.head(storageKey);
    if (!metadata) return response(404, "Media not found", cors);
    const headers = new Headers(cors);
    headers.set("Content-Type", metadata.httpMetadata?.contentType || "application/octet-stream");
    headers.set("Content-Length", String(metadata.size));
    headers.set("Accept-Ranges", "bytes");
    if (metadata.httpEtag) headers.set("ETag", metadata.httpEtag);
    if (metadata.uploaded) headers.set("Last-Modified", new Date(metadata.uploaded).toUTCString());
    if (request.method === "HEAD") return response(200, null, headers);

    const range = parseRange(request.headers.get("Range"), metadata.size);
    if (range === false) {
      headers.set("Content-Range", "bytes */" + metadata.size);
      headers.delete("Content-Length");
      return response(416, null, headers);
    }
    const object = range
      ? await env.MEDIA_BUCKET.get(storageKey, { range })
      : await env.MEDIA_BUCKET.get(storageKey);
    if (!object) return response(404, "Media not found", headers);
    if (range) {
      headers.set("Content-Length", String(range.length));
      headers.set("Content-Range", "bytes " + range.offset + "-" + (range.offset + range.length - 1) + "/" + metadata.size);
      return response(206, object.body, headers);
    }
    return response(200, object.body, headers);
  },
};
