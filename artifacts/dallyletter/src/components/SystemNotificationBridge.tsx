import { useEffect, useState } from "react";
import { getApiUrl } from "@workspace/api-client-react";

const token = () => localStorage.getItem("dallyletter_token") ?? "";

function decodeBase64Url(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function enableBackgroundPush(): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return false;
  const configResponse = await fetch(getApiUrl("/api/push/config"), { headers: { Authorization: `Bearer ${token()}` } });
  if (!configResponse.ok) return false;
  const config = await configResponse.json();
  if (!config.enabled || !config.publicKey) return false;
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return false;
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeBase64Url(config.publicKey) });
  }
  const body = subscription.toJSON();
  const response = await fetch(getApiUrl("/api/push/subscriptions"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
    body: JSON.stringify(body),
  });
  return response.ok;
}

export function SystemNotificationBridge() {
  const [pushReady, setPushReady] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("Notification" in window)) return;
    let stopped = false;
    const seenKey = "dallyletter.system-notifications.seen";
    const readSeen = () => { try { return new Set<string>(JSON.parse(localStorage.getItem(seenKey) || "[]")); } catch { return new Set<string>(); } };
    const markSeen = (id: string) => { const s = readSeen(); s.add(id); localStorage.setItem(seenKey, JSON.stringify(Array.from(s).slice(-100))); };

    const sync = async () => {
      if (stopped || Notification.permission !== "granted") return;
      try {
        const r = await fetch(getApiUrl("/api/notifications"), { headers: { Authorization: `Bearer ${token()}` } });
        if (!r.ok) return;
        const list = await r.json();
        const seen = readSeen();
        const registration = await navigator.serviceWorker.ready;
        for (const n of (Array.isArray(list) ? list : []).filter((x:any) => !x.isRead).slice(0, 10)) {
          const id = String(n.id);
          if (seen.has(id)) continue;
          await registration.showNotification(n.title || "DALLYLETTER ELIDEMS", {
            body: n.message || "",
            icon: "/icons/icon-192.png",
            badge: "/icons/icon-192.png",
            tag: `dallyletter-${id}`,
            data: { url: n.link || "/student/notifications" },
          });
          markSeen(id);
        }
      } catch { /* never break the application */ }
    };

    const checkPush = async () => {
      try {
        const r = await fetch(getApiUrl("/api/push/config"), { headers: { Authorization: `Bearer ${token()}` } });
        if (!r.ok) return;
        const config = await r.json();
        if (!config.enabled) return;
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (existing && Notification.permission === "granted") {
          const body = existing.toJSON();
          await fetch(getApiUrl("/api/push/subscriptions"), { method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token()}` }, body:JSON.stringify(body) });
          setPushReady(true);
        } else if (Notification.permission === "default" && !localStorage.getItem("dallyletter.push.prompt-dismissed")) {
          setShowPrompt(true);
        }
      } catch { /* push is optional */ }
    };

    const interval = window.setInterval(() => void sync(), 20000);
    void sync(); void checkPush();
    const onMessage = (event: MessageEvent) => { if (event.data?.type === "DALLYLETTER_NOTIFICATION_CLICK" && event.data.url) window.location.assign(event.data.url); };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => { stopped = true; window.clearInterval(interval); navigator.serviceWorker.removeEventListener("message", onMessage); };
  }, []);

  const enable = async () => {
    setBusy(true);
    try { setPushReady(await enableBackgroundPush()); setShowPrompt(false); }
    catch { setShowPrompt(false); }
    finally { setBusy(false); }
  };

  return showPrompt && !pushReady ? (
    <div className="fixed bottom-4 left-4 right-4 z-[80] mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#0A1931] text-[#FFC72C] font-black">D</div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-[#0A1931]">Stay connected with ELIDEMS 🔔</p>
          <p className="mt-1 text-sm text-slate-600">Receive important lessons, assignments, groups and school updates even when Dallyletter is closed.</p>
          <div className="mt-3 flex gap-2">
            <button className="rounded-xl bg-[#0A1931] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={busy} onClick={() => void enable()}>{busy ? "Enabling…" : "Allow notifications"}</button>
            <button className="rounded-xl px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100" onClick={() => { localStorage.setItem("dallyletter.push.prompt-dismissed","1"); setShowPrompt(false); }}>Not now</button>
          </div>
        </div>
      </div>
    </div>
  ) : null;
}
