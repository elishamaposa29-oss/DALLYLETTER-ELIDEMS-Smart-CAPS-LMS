import { useMemo } from "react";
import { useLocation } from "wouter";
import { AuthenticatedMedia } from "@/components/AuthenticatedMedia";
import { DashboardLayout } from "@/components/DashboardLayout";

type MediaType = "audio" | "video" | "image" | "document";

export default function SharedMedia() {
  const [location] = useLocation();
  const params = useMemo(() => new URLSearchParams(window.location.search), [location]);
  const url = params.get("url") ?? "";
  const title = (params.get("title") ?? "Dallyletter learning resource").slice(0, 180);
  const type = params.get("type") as MediaType;
  const validType = ["audio", "video", "image", "document"].includes(type);
  const validUrl = /^\/api\/(?:lessons|messages)\/media\/[a-f0-9-]{36}(?:\?type=[a-zA-Z0-9%./+-]+)?$/i.test(url);
  return <DashboardLayout>
    <main className="mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-6">
      <div><p className="text-xs font-bold tracking-widest text-amber-600">DALLYLETTER ELIDEMS</p><h1 className="text-2xl font-bold">Shared learning resource</h1><p className="text-sm text-muted-foreground">The fun way to success.</p></div>
      {!validUrl || !validType
        ? <div className="rounded-lg border p-4 text-sm">This shared resource link is invalid or incomplete. Ask the sender to share it again.</div>
        : <AuthenticatedMedia url={url} type={type} title={title} />}
    </main>
  </DashboardLayout>;
}
