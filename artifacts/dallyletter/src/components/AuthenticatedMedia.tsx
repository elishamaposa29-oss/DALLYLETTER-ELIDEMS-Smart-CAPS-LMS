import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Expand, Share2, ZoomIn, ZoomOut, RefreshCw } from "lucide-react";
import { getApiUrl } from "@workspace/api-client-react";

interface AuthenticatedMediaProps {
  url: string;
  type: "audio" | "video" | "image" | "document";
  title: string;
  /** Render branding only in the dedicated shared-resource viewer, never in ordinary in-app previews. */
  brandedShare?: boolean;
}

export function AuthenticatedMedia({ url, type, title, brandedShare = false }: AuthenticatedMediaProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [mediaBlob, setMediaBlob] = useState<Blob | null>(null);
  const [error, setError] = useState(false);
  const [scale, setScale] = useState(1);

  const shareBrandedLink = async () => {
    let resourcePath = url;
    try {
      if (/^https?:\/\//i.test(url)) {
        const parsed = new URL(url);
        if (parsed.origin !== window.location.origin && !parsed.pathname.startsWith("/api/")) {
          window.alert("Only Dallyletter media links can be shared through the protected viewer.");
          return;
        }
        resourcePath = parsed.pathname + parsed.search;
      }
    } catch {
      window.alert("This media link cannot be shared safely.");
      return;
    }
    if (!/^\/api\/(?:lessons|messages)\/media\/[a-f0-9-]{36}(?:\?type=[a-zA-Z0-9%./+-]+)?$/i.test(resourcePath)) {
      window.alert("This resource does not have a supported Dallyletter media link.");
      return;
    }
    const mediaKey = resourcePath.match(/^\/api\/(?:lessons|messages)\/media\/([a-f0-9-]{36})/i)?.[1];
    if (!mediaKey || !resourcePath.startsWith("/api/lessons/media/")) {
      window.alert("This attachment cannot be shared publicly yet. Use the download option instead.");
      return;
    }
    const sessionToken = localStorage.getItem("dallyletter_token");
    const shareResponse = await fetch(getApiUrl(`/api/lessons/media/${mediaKey}/share`), { method: "POST", headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {} });
    const shareData = await shareResponse.json().catch(() => ({}));
    if (!shareResponse.ok || typeof shareData.shareToken !== "string") {
      window.alert(shareData.error || "A public share link could not be created. Download and share the file instead.");
      return;
    }
    const brandedUrl = `${window.location.origin}/shared-media?url=${encodeURIComponent(resourcePath)}&type=${encodeURIComponent(type)}&title=${encodeURIComponent(title || "Learning resource")}&shareToken=${encodeURIComponent(shareData.shareToken)}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: `${title || "Learning resource"} · Dallyletter Elidems`, text: "Shared from Dallyletter Elidems — The fun way to success. Anyone with this link can view the resource until it expires.", url: brandedUrl });
        return;
      }
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(brandedUrl);
          window.alert("Dallyletter viewer link copied. Anyone with the link can view this resource until the share link expires.");
          return;
        } catch { /* Continue to the compatible copy fallback below. */ }
      }
      const fallback = document.createElement("textarea");
      fallback.value = brandedUrl;
      fallback.setAttribute("readonly", "");
      fallback.style.position = "fixed";
      fallback.style.opacity = "0";
      document.body.appendChild(fallback);
      fallback.select();
      const copied = document.execCommand("copy");
      fallback.remove();
      if (copied) {
        window.alert("Dallyletter viewer link copied. The recipient must sign in and have permission to access the resource.");
        return;
      }
      window.prompt("Copy this Dallyletter share link:", brandedUrl);
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
    window.alert("Link sharing is unavailable here. Download the resource and share it from your device.");
  };

  useEffect(() => {
    let active = true;
    const token = localStorage.getItem("dallyletter_token");

    setObjectUrl(null);
    setMediaBlob(null);
    setError(false);
    fetch(getApiUrl(url), { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      .then(response => {
        if (!response.ok) throw new Error("Media unavailable");
        return response.blob();
      })
      .then(blob => {
        if (active) { setMediaBlob(blob); setObjectUrl(URL.createObjectURL(blob)); }
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
  }, [url]);

  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><p className="font-semibold">Media unavailable</p><p className="mt-1">The learning resource could not be loaded safely.</p><Button type="button" size="sm" variant="outline" className="mt-3 gap-1" onClick={()=>window.location.reload()}><RefreshCw className="h-3.5 w-3.5"/>Try again</Button></div>;
  if (!objectUrl) return <p className="text-sm text-muted-foreground">Loading media...</p>;
  if (type === "audio") return <div className="space-y-2 rounded-md border p-3">{brandedShare && <p className="text-xs font-bold tracking-wide text-muted-foreground">DALLYLETTER ELIDEMS · SHARED LEARNING RESOURCE</p>}<audio className="w-full" src={objectUrl} title={title} controls /><Button type="button" size="sm" variant="outline" onClick={() => void shareBrandedLink()}><Share2 className="mr-2 h-4 w-4"/>Share protected link</Button></div>;
  if (type === "video") return <div className="space-y-2"><div className="relative overflow-hidden rounded-md bg-black"><video className="aspect-video w-full rounded-md bg-black" src={objectUrl} title={title} controls />{brandedShare && <span aria-hidden="true" className="pointer-events-none absolute bottom-3 right-3 rounded bg-black/60 px-2 py-1 text-[10px] font-bold tracking-wide text-white">DALLYLETTER ELIDEMS</span>}</div><Button type="button" size="sm" variant="outline" onClick={() => void shareBrandedLink()}><Share2 className="mr-2 h-4 w-4"/>Share protected link</Button></div>;
  if (type === "image") return <div className="space-y-2"><div className="flex flex-wrap gap-1.5"><Button type="button" size="sm" variant="outline" onClick={()=>setScale(s=>Math.min(3,s+.25))} aria-label="Zoom in"><ZoomIn className="h-4 w-4"/></Button><Button type="button" size="sm" variant="outline" onClick={()=>setScale(s=>Math.max(.5,s-.25))} aria-label="Zoom out"><ZoomOut className="h-4 w-4"/></Button><Button type="button" size="sm" variant="outline" onClick={()=>window.open(objectUrl,"_blank","noopener,noreferrer")}><Expand className="mr-1 h-4 w-4"/>Full screen</Button><a className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm" href={objectUrl} download><Download className="h-4 w-4"/>Download</a><Button type="button" size="sm" variant="outline" onClick={()=>{try{if(mediaBlob&&typeof navigator.share==="function"){const file=new File([mediaBlob],`${(title||"Dallyletter-media").replace(/[^a-z0-9._-]/gi,"-")}`,{type:mediaBlob.type||"application/octet-stream"});if(typeof navigator.canShare!=="function"||navigator.canShare({files:[file]})){void navigator.share({title:`${title||"Learning resource"} · Dallyletter Elidems`,text:"Shared from Dallyletter Elidems — The fun way to success.",files:[file]}).then(()=>undefined).catch(async error=>{if(error instanceof DOMException&&error.name==="AbortError")return;await shareBrandedLink();});return;}}void shareBrandedLink();}catch{void shareBrandedLink();}}}><Share2 className="mr-1 h-4 w-4"/>Share</Button></div><div className="overflow-auto rounded-md border bg-white"><div className="relative"><img className="max-h-[70vh] w-full origin-center object-contain transition-transform" style={{transform:`scale(${scale})`}} src={objectUrl} alt={title}/>{brandedShare && <><div aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden"><span className="rotate-[-24deg] rounded-lg bg-black/30 px-4 py-2 text-center text-sm font-black tracking-[0.2em] text-white/80 sm:text-xl">DALLYLETTER ELIDEMS</span></div><span className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/60 px-2 py-1 text-[10px] font-bold tracking-wide text-white">DALLYLETTER ELIDEMS</span></>}</div></div></div>;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2"><a className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm font-medium hover:bg-muted" href={objectUrl} target="_blank" rel="noopener noreferrer"><Expand className="h-4 w-4"/>Open full screen</a><a className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm" href={objectUrl} download={title}><Download className="h-4 w-4"/>Download</a><Button type="button" size="sm" variant="outline" onClick={() => void shareBrandedLink()}><Share2 className="mr-1 h-4 w-4"/>Share protected link</Button></div><div className="relative overflow-hidden rounded-md border bg-white">{brandedShare && <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 grid place-items-center overflow-hidden"><span className="rotate-[-24deg] rounded-lg bg-black/20 px-4 py-2 text-center text-lg font-black tracking-[0.2em] text-black/50">DALLYLETTER ELIDEMS</span></div>}<iframe className="h-[70vh] min-h-96 w-full border-0 bg-white" src={objectUrl} title={title} /></div>
      <p className="text-xs text-muted-foreground">If the embedded viewer is unavailable on your device, use Open full screen or Download.</p>
    </div>
  );
}