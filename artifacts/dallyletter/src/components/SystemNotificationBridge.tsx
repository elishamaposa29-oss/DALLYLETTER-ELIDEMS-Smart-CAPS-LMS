import { useEffect } from "react";
import { getApiUrl } from "@workspace/api-client-react";

const token = () => localStorage.getItem("dallyletter_token") ?? "";

export function SystemNotificationBridge() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
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
            icon: "/favicon.ico",
            badge: "/favicon.ico",
            tag: `dallyletter-${id}`,
            data: { url: n.link || "/student/notifications" },
          });
          markSeen(id);
        }
      } catch { /* notification delivery must never break the app */ }
    };

    const interval = window.setInterval(() => void sync(), 20000);
    void sync();
    const onMessage = (event: MessageEvent) => { if (event.data?.type === "DALLYLETTER_NOTIFICATION_CLICK" && event.data.url) window.location.assign(event.data.url); };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => { stopped = true; window.clearInterval(interval); navigator.serviceWorker.removeEventListener("message", onMessage); };
  }, []);
  return null;
}
