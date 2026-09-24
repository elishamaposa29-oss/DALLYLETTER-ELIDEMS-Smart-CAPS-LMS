import { useEffect, useState } from "react";
import { getApiUrl } from "@workspace/api-client-react";

interface AuthenticatedMediaProps {
  url: string;
  type: "audio" | "video" | "image" | "document";
  title: string;
}

export function AuthenticatedMedia({ url, type, title }: AuthenticatedMediaProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

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
  if (type === "image") return <img className="max-h-96 w-full rounded-md object-contain" src={objectUrl} alt={title} />;

  return (
    <div className="space-y-2">
      <iframe className="h-96 w-full rounded-md border" src={objectUrl} title={title} />
      <a className="text-sm text-primary hover:underline" href={objectUrl} target="_blank" rel="noreferrer">
        Open document
      </a>
    </div>
  );
}