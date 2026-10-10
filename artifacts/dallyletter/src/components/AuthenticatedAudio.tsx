import { useEffect, useRef, useState } from "react";
import { getApiUrl } from "@workspace/api-client-react";
import { isStoredMediaUrl } from "@/lib/media-url";

export function AuthenticatedAudio({ src, className }: { src: string; className?: string }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!isStoredMediaUrl(src)) {
      return () => {
        active = false;
      };
    }

    const token = localStorage.getItem("dallyletter_token");
    setError(null);
    fetch(getApiUrl(src), { headers: token ? { Authorization: `Bearer ${token}` } : undefined, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error(`Audio unavailable (${response.status})`);
        const contentType = (response.headers.get("content-type") || "").toLowerCase();
        const blob = await response.blob();
        if (blob.size === 0) throw new Error("Empty audio response");
        // Object storage/CDN proxies can label valid uploaded audio as octet-stream.
        // Reject obvious login/error pages, but don't reject playable audio for that generic MIME.
        if (contentType.includes("text/html") || contentType.includes("application/json") || contentType.includes("text/plain")) {
          throw new Error("The media endpoint returned an error page instead of audio");
        }
        if (blob.type.toLowerCase().startsWith("audio/")) return blob;
        const path = src.split("?")[0].toLowerCase();
        const inferredType = path.endsWith(".ogg") ? "audio/ogg"
          : path.endsWith(".mp3") ? "audio/mpeg"
          : path.endsWith(".m4a") || path.endsWith(".mp4") ? "audio/mp4"
          : path.endsWith(".wav") ? "audio/wav"
          : path.endsWith(".webm") ? "audio/webm"
          : contentType.startsWith("audio/") ? contentType : "audio/webm";
        return new Blob([blob], { type: inferredType });
      })
      .then(blob => {
        if (active) setObjectUrl(URL.createObjectURL(blob));
      })
      .catch(error => { if (active) { setObjectUrl(null); setError(error instanceof Error ? error.message : "Audio unavailable"); } });

    return () => {
      active = false;
      setObjectUrl(current => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
    };
  }, [src]);

  useEffect(()=>{ if(audioRef.current) audioRef.current.playbackRate=speed; },[speed,objectUrl]);
  return (objectUrl || !isStoredMediaUrl(src)) ? <div className="flex items-center gap-2 max-w-full"><audio ref={audioRef} controls preload="metadata" className={className} src={objectUrl ?? (src.startsWith("/") ? getApiUrl(src) : src)} onError={() => setError("This voice recording could not be decoded by the browser.")} /><select aria-label="Playback speed" value={speed} onChange={e=>setSpeed(Number(e.target.value))} className="h-8 rounded-md border bg-background px-1 text-xs"><option value="1">1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></div>  : <span className="text-xs text-muted-foreground">{error ?? "Loading voice message..."}</span>;
}