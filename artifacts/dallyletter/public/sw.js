const SHELL_CACHE = "dallyletter-shell-v4";
const ASSET_CACHE = "dallyletter-assets-v4";
const API_CACHE = "dallyletter-private-api-v1";
const API_CACHE_MAX_ENTRIES = 160;
const API_CACHE_MAX_BYTES = 12 * 1024 * 1024;
const API_CACHE_MAX_ENTRY_BYTES = 512 * 1024;
const API_CACHE_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;
const API_CACHE_FRESH_MS = 5 * 60 * 1000;
const SHELL = ["/", "/manifest.json", "/favicon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];
const MAX_ASSETS = 30;
const MAX_ASSET_BYTES = 2 * 1024 * 1024;

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL)).catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys
      .filter(key => key.startsWith("dallyletter-") && key !== SHELL_CACHE && key !== ASSET_CACHE && key !== API_CACHE)
      .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function cacheAsset(request, response) {
  if (!response.ok || response.type !== "basic") return;
  const rawSize = response.headers.get("content-length");
  if (!rawSize) return;
  const size = Number(rawSize);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_ASSET_BYTES) return;
  try {
    const cache = await caches.open(ASSET_CACHE);
    await cache.put(request, response.clone());
    const keys = await cache.keys();
    if (keys.length > MAX_ASSETS) {
      await Promise.all(keys.slice(0, keys.length - MAX_ASSETS).map(key => cache.delete(key)));
    }
  } catch { /* Quota/private-mode failures must not break online loading. */ }
}


function isDallyletterApiUrl(url) {
  return url.pathname.startsWith("/api/") && (
    url.origin === self.location.origin ||
    url.hostname === "dallyletter-elidems-smart-caps-lms-4.onrender.com"
  );
}

function isOfflineCacheableApiRequest(request, url) {
  if (request.method !== "GET" || !isDallyletterApiUrl(url)) return false;
  if (!/^Bearer\\s+\\S+/i.test(request.headers.get("authorization") || "")) return false;
  // Never persist authentication, payments, financial/admin controls, uploads,
  // private media bytes, or one-time/sensitive workflow endpoints.
  if (/^\\/api\\/(?:auth|payments?|financial|admin|owner|audit-logs|teacher-cv|qualifications|media)(?:\\/|$)/i.test(url.pathname)) return false;
  if (/\\/(?:media|upload|download)(?:\\/|$)/i.test(url.pathname)) return false;
  return true;
}

async function apiCacheKey(request, url) {
  const authorization = request.headers.get("authorization") || "";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(authorization));
  const scope = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const keyUrl = new URL(url.href);
  keyUrl.searchParams.set("__dallyletter_offline_scope", scope);
  return new Request(keyUrl.href, { method: "GET", headers: { "X-Dallyletter-Offline-Scope": scope } });
}

async function trimApiCache(cache) {
  const keys = await cache.keys();
  let totalBytes = 0;
  const sizes = [];
  for (const key of keys) {
    const response = await cache.match(key);
    const size = Number(response?.headers.get("X-Dallyletter-Offline-Bytes") || 0);
    totalBytes += size;
    sizes.push({ key, size });
  }
  while (sizes.length > API_CACHE_MAX_ENTRIES || totalBytes > API_CACHE_MAX_BYTES) {
    const oldest = sizes.shift();
    if (!oldest) break;
    await cache.delete(oldest.key);
    totalBytes -= oldest.size;
  }
}

async function storeApiResponse(cache, key, response) {
  if (!response.ok || response.type === "opaque") return;
  const contentType = response.headers.get("content-type") || "";
  if (!/\\bapplication\\/(?:[a-z0-9.+-]*\\+)?json\\b/i.test(contentType)) return;
  if (/\\bno-store\\b/i.test(response.headers.get("cache-control") || "")) return;
  if ((response.headers.get("vary") || "").trim() === "*") return;
  const body = await response.clone().arrayBuffer();
  if (!body.byteLength || body.byteLength > API_CACHE_MAX_ENTRY_BYTES) return;
  const headers = new Headers(response.headers);
  headers.set("X-Dallyletter-Offline-Cached-At", String(Date.now()));
  headers.set("X-Dallyletter-Offline-Bytes", String(body.byteLength));
  await cache.put(key, new Response(body, { status: response.status, statusText: response.statusText, headers }));
  await trimApiCache(cache);
}

async function handleOfflineApiGet(request, url) {
  const cache = await caches.open(API_CACHE);
  const key = await apiCacheKey(request, url);
  const cached = await cache.match(key);
  const cachedAt = Number(cached?.headers.get("X-Dallyletter-Offline-Cached-At") || 0);
  const age = cachedAt ? Date.now() - cachedAt : Number.POSITIVE_INFINITY;
  if (cached && age >= 0 && age <= API_CACHE_FRESH_MS) return cached;
  try {
    const response = await fetch(request);
    if (response.status === 304 && cached) return cached;
    if (response.ok) await storeApiResponse(cache, key, response.clone()).catch(() => undefined);
    return response;
  } catch {
    if (cached && age >= 0 && age <= API_CACHE_MAX_AGE_MS) return cached;
    return new Response(JSON.stringify({ error: "You are offline and this information has not been saved on this device yet.", code: "OFFLINE_CACHE_MISS" }), {
      status: 503,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}

async function clearPrivateOfflineCache() {
  await caches.delete(API_CACHE);
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (isOfflineCacheableApiRequest(request, url)) {
    event.respondWith(handleOfflineApiGet(request, url));
    return;
  }
  if (url.origin !== self.location.origin) return;
  // Never cache API responses, uploads, or private media.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/media/")) return;

  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(fetch(request).then(response => {
      if (response.ok && response.type === "basic") {
        caches.open(SHELL_CACHE).then(cache => cache.put("/", response.clone())).catch(() => undefined);
      }
      return response;
    }).catch(async () => (await caches.match(request)) || (await caches.match("/")) || Response.error()));
    return;
  }

  const isAsset = request.destination === "script" || request.destination === "style" ||
    request.destination === "font" || url.pathname.startsWith("/assets/");
  if (!isAsset) return;
  event.respondWith((async () => {
    const cache = await caches.open(ASSET_CACHE);
    const cached = await cache.match(request);
    const network = fetch(request).then(async response => {
      await cacheAsset(request, response);
      return response;
    }).catch(() => cached || Response.error());
    return cached || network;
  })());
});

self.addEventListener("message", event => {
  if (event.data?.type === "DALLYLETTER_CLEAR_PRIVATE_OFFLINE_CACHE") {
    event.waitUntil(clearPrivateOfflineCache());
    return;
  }
  if (event.data?.type !== "DALLYLETTER_NOTIFICATION") return;
  const n = event.data.notification || {};
  event.waitUntil(self.registration.showNotification(n.title || "DALLYLETTER ELIDEMS", {
    body: n.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: String(n.id || n.title || "dallyletter-notification"),
    renotify: Boolean(n.renotify),
    data: { url: n.url || "/student/notifications" },
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/student/notifications", self.location.origin).href;
  event.waitUntil((async () => {
    const open = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = open.find(client => client.url.startsWith(self.location.origin));
    if (existing) { await existing.focus(); existing.postMessage({ type: "DALLYLETTER_NOTIFICATION_CLICK", url: target }); return; }
    await clients.openWindow(target);
  })());
});

self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text?.() || "" }; }
  const title = payload.title || "DALLYLETTER ELIDEMS";
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body || payload.message || "",
    icon: payload.icon || "/favicon.ico",
    badge: payload.badge || "/favicon.ico",
    tag: String(payload.id || title),
    data: { url: payload.url || "/student/notifications" },
    requireInteraction: Boolean(payload.requireInteraction),
  }));
});
