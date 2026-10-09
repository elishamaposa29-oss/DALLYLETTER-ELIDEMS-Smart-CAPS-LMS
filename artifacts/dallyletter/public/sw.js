const SHELL_CACHE = "dallyletter-shell-v4";
const ASSET_CACHE = "dallyletter-assets-v4";
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
      .filter(key => key.startsWith("dallyletter-") && key !== SHELL_CACHE && key !== ASSET_CACHE)
      .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function cacheAsset(request, response) {
  if (!response.ok || response.type !== "basic") return;
  const size = Number(response.headers.get("content-length") || 0);
  if (size > MAX_ASSET_BYTES) return;
  try {
    const cache = await caches.open(ASSET_CACHE);
    await cache.put(request, response.clone());
    const keys = await cache.keys();
    if (keys.length > MAX_ASSETS) {
      await Promise.all(keys.slice(0, keys.length - MAX_ASSETS).map(key => cache.delete(key)));
    }
  } catch { /* Quota/private-mode failures must not break online loading. */ }
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
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
