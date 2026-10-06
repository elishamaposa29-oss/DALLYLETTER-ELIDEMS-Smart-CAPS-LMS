import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Expand, Share2, ZoomIn, ZoomOut } from "lucide-react";
import { getApiUrl } from "@workspace/api-client-react";

interface AuthenticatedMediaProps {
  url: string;
  type: "audio" | "video" | "image" | "document";
  title: string;
}

export function AuthenticatedMedia({ url, type, title }: AuthenticatedMediaProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    let active = true;
    const token = localStorage.getItem("dallyletter_token");

    setObjectUrl(null);
    setError(false);
    fetch(getApiUrl(url), { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
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
  }, [url]);

  if (error) return <p className="text-sm text-destructive">Media unavailable.</p>;
  if (!objectUrl) return <p className="text-sm text-muted-foreground">Loading media...</p>;
  if (type === "audio") return <audio className="w-full" src={objectUrl} title={title} controls />;
  if (type === "video") return <video className="aspect-video w-full rounded-md bg-black" src={objectUrl} title={title} controls />;
  if (type === "image") return <div className="space-y-2"><div className="flex flex-wrap gap-1.5"><Button type="button" size="sm" variant="outline" onClick={()=>setScale(s=>Math.min(3,s+.25))} aria-label="Zoom in"><ZoomIn className="h-4 w-4"/></Button><Button type="button" size="sm" variant="outline" onClick={()=>setScale(s=>Math.max(.5,s-.25))} aria-label="Zoom out"><ZoomOut className="h-4 w-4"/></Button><Button type="button" size="sm" variant="outline" onClick={()=>window.open(objectUrl,"_blank","noopener,noreferrer")}><Expand className="mr-1 h-4 w-4"/>Full screen</Button><a className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm" href={objectUrl} download><Download className="h-4 w-4"/>Download</a><Button type="button" size="sm" variant="outline" onClick={async()=>{try{if(navigator.share)await navigator.share({title,url:objectUrl});else await navigator.clipboard.writeText(objectUrl)}catch{}}}><Share2 className="mr-1 h-4 w-4"/>Share</Button></div><div className="overflow-auto rounded-md border bg-white"><img className="max-h-[70vh] w-full origin-center object-contain transition-transform" style={{transform:`scale(${scale})`}} src={objectUrl} alt={title}/></div></div>;

  return (
    <div className="space-y-2">
      <iframe className="h-96 w-full rounded-md border" src={objectUrl} title={title} />
      <a className="text-sm text-primary hover:underline" href={objectUrl} target="_blank" rel="noreferrer">
        Open document
      </a>
    </div>
  );
}