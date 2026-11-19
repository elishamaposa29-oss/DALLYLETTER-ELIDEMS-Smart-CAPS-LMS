import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Expand, Share2, ZoomIn, ZoomOut, RefreshCw } from "lucide-react";
import { createProtectedMediaShareLink, DEFAULT_DALLYLETTER_WEB_URL, getApiUrl } from "@workspace/api-client-react";

interface AuthenticatedMediaProps {
  url: string;
  type: "audio" | "video" | "image" | "document";
  title: string;
  /** Render branding only in the dedicated shared-resource viewer, never in ordinary in-app previews. */
  brandedShare?: boolean;
  shareToken?: string;
}

export function AuthenticatedMedia({ url, type, title, brandedShare = false, shareToken }: AuthenticatedMediaProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [scale, setScale] = useState(1);
  const supportsProtectedShare = (() => {
    try { const path = new URL(url, window.location.origin).pathname; const key = path.split("/").pop() || ""; return path.startsWith("/api/lessons/media/") && /^[a-f0-9-]{36}$/i.test(key); }
    catch { return false; }
  })();

  const shareBrandedLink = async () => {
    try {
      const protectedUrl = brandedShare && shareToken
        ? window.location.href
        : await createProtectedMediaShareLink({
            resourceUrl: url,
            title,
            type,
            token: localStorage.getItem("dallyletter_token"),
            webBaseUrl: DEFAULT_DALLYLETTER_WEB_URL,
          });
      const shareData = {
        title: `${title || "Learning resource"} · Dallyletter Elidems`,
        text: "Shared from Dallyletter Elidems — The fun way to success. Anyone with this link can view the resource until it expires.",
        url: protectedUrl,
      };
      if (typeof navigator.share === "function") {
        try { await navigator.share(shareData); return; }
        catch (error) { if (error instanceof DOMException && error.name === "AbortError") return; }
      }
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(protectedUrl);
          window.alert("Protected Dallyletter link copied. You can paste it into any app or social platform.");
          return;
        } catch { /* Use the compatible copy fallback below. */ }
      }
      const fallback = document.createElement("textarea");
      fallback.value = protectedUrl;
      fallback.setAttribute("readonly", "");
      fallback.style.position = "fixed";
      fallback.style.opacity = "0";
      document.body.appendChild(fallback);
      fallback.select();
      const copied = document.execCommand("copy");
      fallback.remove();
      if (copied) {
        window.alert("Protected Dallyletter link copied. You can paste it into any app or social platform.");
        return;
      }
      window.prompt("Copy this protected Dallyletter link:", protectedUrl);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not create the protected Dallyletter link.");
    }
  };

  useEffect(() => {
    let active = true;
    const token = localStorage.getItem("dallyletter_token");

    setObjectUrl(null);
    setError(false);
    const mediaRequestUrl = new URL(getApiUrl(url), window.location.origin);
    if (brandedShare && shareToken) {
      mediaRequestUrl.searchParams.set("shareToken", shareToken);
      // Stream public media directly; the browser requests only needed byte ranges.
      setObjectUrl(mediaRequestUrl.toString());
      return () => { active = false; };
    }
    fetch(mediaRequestUrl.toString(), { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      .then(response => {
        if (!response.ok) throw new Error("Media unavailable");
        return response.blob();
      })
      .then(blob => {
        if (active) setObjectUrl(URL.createObjectURL(blob));
      })
      .catch(() => {
        if (active) setError(true);
      });

    return () => {
      active = false;
      setObjectUrl(current => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
    };
  }, [url, brandedShare, shareToken]);

  const downloadUrl = (() => { if (objectUrl?.startsWith("blob:")) return objectUrl; try { const target = new URL(objectUrl || "", window.location.origin); target.searchParams.set("download", "1"); return target.toString(); } catch { return objectUrl || ""; } })();

  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><p className="font-semibold">Media unavailable</p><p className="mt-1">The learning resource could not be loaded safely.</p><Button type="button" size="sm" variant="outline" className="mt-3 gap-1" onClick={()=>window.location.reload()}><RefreshCw className="h-3.5 w-3.5"/>Try again</Button></div>;
  if (!objectUrl) return <p className="text-sm text-muted-foreground">Loading media...</p>;
  if (type === "audio") return <div className="space-y-2 rounded-md border p-3">{brandedShare && <p className="text-xs font-bold tracking-wide text-muted-foreground">DALLYLETTER ELIDEMS · SHARED LEARNING RESOURCE</p>}<audio className="w-full" src={objectUrl} title={title} controls preload="none" />{brandedShare && <a className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm" href={downloadUrl} download><Download className="h-4 w-4"/>Download file to share</a>}{supportsProtectedShare && <Button type="button" size="sm" variant="outline" onClick={() => void shareBrandedLink()}><Share2 className="mr-2 h-4 w-4"/>Share protected link</Button>}</div>;
  if (type === "video") return <div className="space-y-2"><div className="relative overflow-hidden rounded-md bg-black"><video className="aspect-video w-full rounded-md bg-black" src={objectUrl} title={title} controls preload="none" playsInline />{brandedShare && <span aria-hidden="true" className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1 rounded bg-black/55 px-1.5 py-1 text-[9px] font-semibold tracking-wide text-white"><img src="/icons/icon-192.png" alt="" className="h-3 w-3 rounded-[2px]"/>DALLYLETTER ELIDEMS</span>}</div>{brandedShare && <a className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm" href={downloadUrl} download><Download className="h-4 w-4"/>Download file to share</a>}{supportsProtectedShare && <Button type="button" size="sm" variant="outline" onClick={() => void shareBrandedLink()}><Share2 className="mr-2 h-4 w-4"/>Share protected link</Button>}</div>;
  if (type === "image") return <div className="space-y-2"><div className="flex flex-wrap gap-1.5"><Button type="button" size="sm" variant="outline" onClick={()=>setScale(s=>Math.min(3,s+.25))} aria-label="Zoom in"><ZoomIn className="h-4 w-4"/></Button><Button type="button" size="sm" variant="outline" onClick={()=>setScale(s=>Math.max(.5,s-.25))} aria-label="Zoom out"><ZoomOut className="h-4 w-4"/></Button><Button type="button" size="sm" variant="outline" onClick={()=>window.open(objectUrl,"_blank","noopener,noreferrer")}><Expand className="mr-1 h-4 w-4"/>Full screen</Button><a className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm" href={downloadUrl} download><Download className="h-4 w-4"/>Download</a>{supportsProtectedShare && <Button type="button" size="sm" variant="outline" onClick={() => void shareBrandedLink()}><Share2 className="mr-1 h-4 w-4"/>Share protected link</Button>}</div><div className="overflow-auto rounded-md border bg-white"><div className="relative"><img className="max-h-[70vh] w-full origin-center object-contain transition-transform" style={{transform:`scale(${scale})`}} src={objectUrl} alt={title} loading="lazy" decoding="async"/>{brandedShare && <><div aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden"><span className="rotate-[-24deg] rounded-lg bg-black/30 px-4 py-2 text-center text-sm font-black tracking-[0.2em] text-white/80 sm:text-xl"><img src="/icons/icon-192.png" alt="" className="mx-auto mb-1 h-5 w-5 rounded"/>DALLYLETTER ELIDEMS</span></div><span className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/60 px-2 py-1 text-[10px] font-bold tracking-wide text-white">DALLYLETTER ELIDEMS</span></>}</div></div></div>;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2"><a className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm font-medium hover:bg-muted" href={objectUrl} target="_blank" rel="noopener noreferrer"><Expand className="h-4 w-4"/>Open full screen</a><a className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm" href={downloadUrl} download={title}><Download className="h-4 w-4"/>Download</a>{supportsProtectedShare && <Button type="button" size="sm" variant="outline" onClick={() => void shareBrandedLink()}><Share2 className="mr-1 h-4 w-4"/>Share protected link</Button>}</div><div className="relative overflow-hidden rounded-md border bg-white">{brandedShare && <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 grid place-items-center overflow-hidden"><span className="rotate-[-24deg] rounded-lg bg-black/20 px-4 py-2 text-center text-lg font-black tracking-[0.2em] text-black/50"><img src="/icons/icon-192.png" alt="" className="mx-auto mb-1 h-5 w-5 rounded"/>DALLYLETTER ELIDEMS</span></div>}<iframe className="h-[70vh] min-h-96 w-full border-0 bg-white" src={objectUrl} title={title} /></div>
      <p className="text-xs text-muted-foreground">If the embedded viewer is unavailable on your device, use Open full screen or Download.</p>
    </div>
  );
}