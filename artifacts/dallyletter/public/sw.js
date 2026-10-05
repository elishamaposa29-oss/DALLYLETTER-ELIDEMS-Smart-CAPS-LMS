const CACHE = 'dallyletter-v2';
const SHELL = ['/', '/manifest.json', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/')) return;
  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    try {
      const response = await fetch(e.request);
      if (response.ok && response.type === "basic") {
        const cache = await caches.open(CACHE);
        await cache.put(e.request, response.clone());
      }
      return response;
    } catch {
      return cached || caches.match('/');
    }
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
