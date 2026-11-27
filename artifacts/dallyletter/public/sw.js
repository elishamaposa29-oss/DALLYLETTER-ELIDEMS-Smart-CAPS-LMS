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
  if (!/^Bearer\s+\S+/i.test(request.headers.get("authorization") || "")) return false;
  // Never persist authentication, payments, financial/admin controls, uploads,
  // private media bytes, or one-time/sensitive workflow endpoints.
  const learnerReadRoutes = /^\/api\/(?:lessons|exercises|assignments|polls|study-groups|messages|notifications|profile-connections|academic-records|attendance|daily-attendance|achievements|dashboard|users\/me|classes)(?:\/|$)/i;
  if (!learnerReadRoutes.test(url.pathname)) return false;
  if (/\/(?:media|upload|download)(?:\/|$)/i.test(url.pathname)) return false;
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
  if (!/\bapplication\/(?:[a-z0-9.+-]*\+)?json\b/i.test(contentType)) return;
  if (/\bno-store\b/i.test(response.headers.get("cache-control") || "")) return;
  if ((response.headers.get("vary") || "").trim() === "*") return;
  const body = await response.clone().arrayBuffer();
  if (!body.byteLength || body.byteLength > API_CACHE_MAX_ENTRY_BYTES) return;
  const headers = new Headers(response.headers);
  // The cached body is decoded/reconstructed; transport framing headers are stale.
  headers.delete("content-encoding");
  headers.delete("content-length");
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


const OFFLINE_DB = "dallyletter-offline-v2", OUTBOX_STORE = "outbox", DRAFT_STORE = "drafts", ACCOUNT_STORE = "accounts";
const OFFLINE_MAX_AGE_MS = 60*24*60*60*1000, OUTBOX_MAX_BYTES = 5*1024*1024, OUTBOX_MAX_ITEMS = 100, DRAFT_MAX_BYTES = 2*1024*1024;
function openOfflineDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(OFFLINE_DB,1);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains(OUTBOX_STORE))d.createObjectStore(OUTBOX_STORE,{keyPath:"id"});if(!d.objectStoreNames.contains(DRAFT_STORE))d.createObjectStore(DRAFT_STORE,{keyPath:"id"});if(!d.objectStoreNames.contains(ACCOUNT_STORE))d.createObjectStore(ACCOUNT_STORE,{keyPath:"id"});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function offlineStoreAll(n){const d=await openOfflineDb();try{return await new Promise((resolve,reject)=>{const t=d.transaction(n,"readonly"),r=t.objectStore(n).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);});}finally{d.close();}}
async function offlineGet(n,id){const d=await openOfflineDb();try{return await new Promise((resolve,reject)=>{const t=d.transaction(n,"readonly"),r=t.objectStore(n).get(id);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});}finally{d.close();}}
async function offlinePut(n,v){const d=await openOfflineDb();try{await new Promise((resolve,reject)=>{const t=d.transaction(n,"readwrite");t.objectStore(n).put(v);t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||new Error("Offline storage quota exceeded"));});}finally{d.close();}}
async function offlineDelete(n,id){const d=await openOfflineDb();try{await new Promise((resolve,reject)=>{const t=d.transaction(n,"readwrite");t.objectStore(n).delete(id);t.oncomplete=resolve;t.onerror=()=>reject(t.error);});}finally{d.close();}}
async function offlineTokenScope(a){const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(a));return "token:"+Array.from(new Uint8Array(h),b=>b.toString(16).padStart(2,"0")).join("");}
async function offlineScope(a,userId){const tokenKey=(await offlineTokenScope(a)).slice(6);if(Number.isSafeInteger(Number(userId))&&Number(userId)>0){const scope="user:"+Number(userId);await offlinePut(ACCOUNT_STORE,{id:tokenKey,scope,updatedAt:Date.now()});return scope;}const mapping=await offlineGet(ACCOUNT_STORE,tokenKey);return mapping?.scope||"token:"+tokenKey;}
function isOfflineQueueablePost(r,u){return r.method==="POST"&&isDallyletterApiUrl(u)&&/^Bearer\s+\S+/i.test(r.headers.get("authorization")||"")&&/^application\/json(?:;|$)/i.test(r.headers.get("content-type")||"")&&/^\/api\/(?:assignments\/\d+\/submit|exercises\/\d+\/submit|polls\/\d+\/submit)$/i.test(u.pathname);}
async function enqueueOfflinePost(r,u){const a=r.headers.get("authorization")||"",body=await r.clone().text(),bytes=new TextEncoder().encode(body).byteLength;if(bytes>262144)throw new Error("Submission is too large for offline queueing.");const scope=await offlineScope(a),rows=await offlineStoreAll(OUTBOX_STORE),now=Date.now(),active=rows.filter(x=>now-x.createdAt<=OFFLINE_MAX_AGE_MS);for(const x of rows)if(!active.includes(x))await offlineDelete(OUTBOX_STORE,x.id);const same=active.find(x=>x.scope===scope&&x.url===u.href&&x.body===body);if(same)return same;if(active.length>=OUTBOX_MAX_ITEMS||active.reduce((n,x)=>n+(x.bytes||0),0)+bytes>OUTBOX_MAX_BYTES)throw new Error("Offline submission storage is full. Reconnect and sync pending work first.");const key=r.headers.get("Idempotency-Key")||crypto.randomUUID(),entry={id:key,idempotencyKey:key,scope,url:u.href,method:"POST",body,bytes,createdAt:now};await offlinePut(OUTBOX_STORE,entry);try{await self.registration.sync?.register("dallyletter-offline-outbox");}catch{}return entry;}
async function notifyClients(m){for(const c of await self.clients.matchAll({type:"window",includeUncontrolled:true}))c.postMessage(m);}
async function replayOfflineOutbox(a,userId){if(!/^Bearer\s+\S+/i.test(a||""))return;const scope=await offlineScope(a,userId),fallbackScope=await offlineTokenScope(a),rows=(await offlineStoreAll(OUTBOX_STORE)).filter(x=>x.scope===scope||x.scope===fallbackScope).sort((x,y)=>x.createdAt-y.createdAt);for(const x of rows){if(x.scope!==scope){x.scope=scope;await offlinePut(OUTBOX_STORE,x);}if(Date.now()-x.createdAt>OFFLINE_MAX_AGE_MS){await offlineDelete(OUTBOX_STORE,x.id);continue;}try{const r=await fetch(x.url,{method:x.method,headers:{Authorization:a,"Content-Type":"application/json","Idempotency-Key":x.idempotencyKey},body:x.body});if(r.ok||(r.status>=400&&r.status<500&&r.status!==408&&r.status!==409&&r.status!==429)){await offlineDelete(OUTBOX_STORE,x.id);await notifyClients({type:"DALLYLETTER_OFFLINE_SUBMISSION_RESULT",id:x.id,ok:r.ok,status:r.status});}else break;}catch{break;}}}
async function saveOfflineDraft(d,a,userId){if(!/^Bearer\s+\S+/i.test(a||"")||!d||typeof d.key!=="string"||d.key.length>180)throw new Error("Invalid offline draft.");const scope=await offlineScope(a,userId),body=JSON.stringify(d.value??null),bytes=new TextEncoder().encode(body).byteLength;if(bytes>262144)throw new Error("Draft exceeds offline size limit.");const rows=await offlineStoreAll(DRAFT_STORE),now=Date.now(),id=scope+":"+d.key,active=rows.filter(x=>now-x.updatedAt<=OFFLINE_MAX_AGE_MS);for(const x of rows)if(!active.includes(x))await offlineDelete(DRAFT_STORE,x.id);const used=active.filter(x=>x.scope===scope&&x.id!==id).reduce((n,x)=>n+x.bytes,0);if(used+bytes>DRAFT_MAX_BYTES)throw new Error("Offline draft storage is full. Reconnect or remove old drafts.");await offlinePut(DRAFT_STORE,{id,scope,key:d.key,value:d.value??null,bytes,updatedAt:now});await notifyClients({type:"DALLYLETTER_OFFLINE_DRAFT_SAVED",key:d.key});}
async function deleteOfflineDraft(d,a,userId){if(!d||typeof d.key!=="string")return;const scope=await offlineScope(a,userId);await offlineDelete(DRAFT_STORE,scope+":"+d.key);}
async function clearOfflineDrafts(a,userId){const scope=await offlineScope(a,userId);for(const x of await offlineStoreAll(DRAFT_STORE))if(x.scope===scope)await offlineDelete(DRAFT_STORE,x.id);}


self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (isOfflineQueueablePost(request,url)) {
    event.respondWith((async()=>{try{return await fetch(request.clone());}catch{try{const q=await enqueueOfflinePost(request,url);return new Response(JSON.stringify({queued:true,id:q.id,idempotencyKey:q.idempotencyKey,message:"Saved on this device; it will submit when you reconnect."}),{status:202,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Dallyletter-Queued":"true"}});}catch(e){return new Response(JSON.stringify({error:e instanceof Error?e.message:"Unable to save offline.",code:"OFFLINE_QUEUE_FAILED"}),{status:507,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});}}})());
    return;
  }
  if (request.method !== "GET") return;
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
  if(event.data?.type==="DALLYLETTER_REPLAY_OFFLINE_OUTBOX"){event.waitUntil(replayOfflineOutbox(event.data.authorization,event.data.userId));return;}
  if(event.data?.type==="DALLYLETTER_SAVE_OFFLINE_DRAFT"){event.waitUntil(saveOfflineDraft(event.data.draft,event.data.authorization,event.data.userId).then(()=>event.ports[0]?.postMessage({ok:true})).catch(e=>event.ports[0]?.postMessage({ok:false,error:e instanceof Error?e.message:"Draft save failed."})));return;}
  if(event.data?.type==="DALLYLETTER_GET_OFFLINE_DRAFTS"){
    event.waitUntil((async()=>{try{const scope=await offlineScope(event.data.authorization,event.data.userId);const rows=(await offlineStoreAll(DRAFT_STORE)).filter(x=>x.scope===scope&&Date.now()-x.updatedAt<=OFFLINE_MAX_AGE_MS);event.ports[0]?.postMessage({ok:true,drafts:rows.map(x=>({key:x.key,value:x.value,updatedAt:x.updatedAt}))});}catch(error){event.ports[0]?.postMessage({ok:false,error:error instanceof Error?error.message:"Unable to read drafts."});}})());
    return;
  }
  if(event.data?.type==="DALLYLETTER_DELETE_OFFLINE_DRAFT"){event.waitUntil(deleteOfflineDraft(event.data.draft,event.data.authorization,event.data.userId));return;}
  if(event.data?.type==="DALLYLETTER_CLEAR_OFFLINE_DRAFTS"){event.waitUntil(clearOfflineDrafts(event.data.authorization,event.data.userId));return;}

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

self.addEventListener("sync",event=>{if(event.tag==="dallyletter-offline-outbox")event.waitUntil(notifyClients({type:"DALLYLETTER_OFFLINE_SYNC_REQUIRED"}));});

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
