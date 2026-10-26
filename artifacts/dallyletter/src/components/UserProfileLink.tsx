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
    if (/^https:\/\//i.test(avatarUrl)) { setImage(avatarUrl); return; }
    let active = true;
    let objectUrl: string | undefined;
    const token = typeof localStorage !== "undefined" ? localStorage.getItem("dallyletter_token") ?? "" : "";
    void fetch(getApiUrl(avatarUrl), { headers: token ? { Authorization: "Bearer " + token } : {} })
      .then(response => { if (!response.ok) throw new Error("Avatar unavailable"); return response.blob(); })
      .then(blob => { objectUrl = URL.createObjectURL(blob); if (active) setImage(objectUrl); })
      .catch(() => { if (active) setImage(null); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [avatarUrl]);
  if (!userId || !Number.isSafeInteger(Number(userId)) || Number(userId) <= 0) {
    return <span className={className}>{name}</span>;
  }
  return <Link href={"/profile/" + Number(userId)} aria-label={"View " + name + "'s profile"} title={"View " + name + "'s profile"} className={"inline-flex min-w-0 items-center gap-2 rounded-md hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary " + className}>
    {showAvatar && <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-bold text-primary">{image ? <img src={image} alt="" className="h-full w-full object-cover" /> : name.slice(0, 1).toUpperCase()}</span>}
    <span className="min-w-0 truncate">{name}</span>
  </Link>;
}
