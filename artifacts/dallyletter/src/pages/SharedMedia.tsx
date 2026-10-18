import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { AuthenticatedMedia } from "@/components/AuthenticatedMedia";

type MediaType = "audio" | "video" | "image" | "document";

export default function SharedMedia() {
  const [location] = useLocation();
  const params = useMemo(() => new URLSearchParams(window.location.search), [location]);
  const url = params.get("url") ?? "";
  const title = (params.get("title") ?? "Dallyletter learning resource").slice(0, 180);
  const type = params.get("type") as MediaType;
  const validType = ["audio", "video", "image", "document"].includes(type);
  const shareToken = params.get("shareToken") ?? "";
  const validUrl = /^\/api\/lessons\/media\/[a-f0-9-]{36}(?:\?type=[a-zA-Z0-9%./+-]+)?$/i.test(url) && /^[0-9]{10,12}\.[a-f0-9]{64}$/i.test(shareToken);
  return <>
    <main className="mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"><div className="flex items-center gap-3"><img src="/icons/icon-192.png" alt="Dallyletter Elidems watermark app icon" className="h-12 w-12 rounded-xl object-contain" /><div><p className="text-xs font-bold tracking-widest text-amber-600">DALLYLETTER ELIDEMS</p><h1 className="text-2xl font-bold">Shared learning resource</h1><p className="text-sm text-muted-foreground">The fun way to success.</p></div></div><div className="flex gap-2"><Button variant="outline" onClick={() => { window.location.href = "/login"; }}>Sign in</Button><Button onClick={() => { window.location.href = "/register"; }}>Sign up</Button></div></div>
      {!validUrl || !validType
        ? <div className="rounded-lg border p-4 text-sm">This shared resource link is invalid or incomplete. Ask the sender to share it again.</div>
        : <AuthenticatedMedia url={url} type={type} title={title} brandedShare />}
    </main>
  </>;
}
