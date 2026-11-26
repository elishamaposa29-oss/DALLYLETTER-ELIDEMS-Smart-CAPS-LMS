import { useEffect, useState } from "react";
import { Link } from "wouter";
import { getApiUrl } from "@workspace/api-client-react";

type Props = {
  userId?: number | string | null;
  name: string;
  avatarUrl?: string | null;
  className?: string;
  showAvatar?: boolean;
};

export default function UserProfileLink({ userId, name, avatarUrl, className = "", showAvatar = true }: Props) {
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    if (!avatarUrl) { setImage(null); return; }
    let requestPath = avatarUrl;
    if (/^https?:\/\//i.test(avatarUrl)) {
      try {
        const parsed = new URL(avatarUrl);
        // Dallyletter media URLs are protected even when the API returned them
        // as absolute LMS4 URLs. Rebase those paths to the configured API host
        // and fetch them with the signed-in user's bearer token.
        if (parsed.pathname.startsWith("/api/")) {
          requestPath = parsed.pathname + parsed.search;
        } else {
          setImage(avatarUrl);
          return;
        }
      } catch {
        setImage(null);
        return;
      }
    }
    let active = true;
    let objectUrl: string | undefined;
    const token = typeof localStorage !== "undefined" ? localStorage.getItem("dallyletter_token") ?? "" : "";
    void fetch(getApiUrl(requestPath), { headers: token ? { Authorization: "Bearer " + token } : {} })
      .then(response => { if (!response.ok) throw new Error("Avatar unavailable"); return response.blob(); })
      .then(blob => { objectUrl = URL.createObjectURL(blob); if (active) setImage(objectUrl); })
      .catch(() => { if (active) setImage(null); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [avatarUrl]);
  if (!userId || !Number.isSafeInteger(Number(userId)) || Number(userId) <= 0) {
    return <span className={className}>{name}</span>;
  }
  return <Link href={"/profile/" + Number(userId)} aria-label={"View " + name + "'s profile"} title={"View " + name + "'s profile"} className={"inline-flex min-w-0 items-center gap-2 rounded-md hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary " + className}>
    {showAvatar && <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-bold text-primary ring-1 ring-border">{image ? <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" /> : name.slice(0, 1).toUpperCase()}</span>}
    <span className="min-w-0 truncate">{name}</span>
  </Link>;
}
