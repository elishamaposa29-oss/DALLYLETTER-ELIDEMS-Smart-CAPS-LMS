import { useEffect, useRef, useState } from "react";
import { getApiUrl } from "@workspace/api-client-react";
import { isStoredMediaUrl } from "@/lib/media-url";

export function AuthenticatedAudio({ src, className }: { src: string; className?: string }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    let active = true;
    if (!isStoredMediaUrl(src)) {
      return () => {
        active = false;
      };
    }

    const token = localStorage.getItem("dallyletter_token");
    fetch(getApiUrl(src), { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      .then(response => {
        if (!response.ok) throw new Error("Audio unavailable");
        return response.blob();
      })
      .then(blob => {
        if (active) setObjectUrl(URL.createObjectURL(blob));
      })
      .catch(() => setObjectUrl(null));

    return () => {
      active = false;
      setObjectUrl(current => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
    };
  }, [src]);

  useEffect(()=>{ if(audioRef.current) audioRef.current.playbackRate=speed; },[speed,objectUrl]);
  return objectUrl ? <div className="flex items-center gap-2 max-w-full"><audio ref={audioRef} controls className={className} src={objectUrl} /><select aria-label="Playback speed" value={speed} onChange={e=>setSpeed(Number(e.target.value))} className="h-8 rounded-md border bg-background px-1 text-xs"><option value="1">1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></div> : <span className="text-xs text-muted-foreground">Loading voice message...</span>;
}