import { Image } from "expo-image";
import { getApiUrl } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";

export default function AuthenticatedMediaPreview({ url, height = 220, accessibilityLabel }: { url: string; height?: number; accessibilityLabel?: string }) {
  const { token } = useAuth();
  const isRemote = /^https?:\/\//i.test(url);
  const resolved = isRemote ? url : getApiUrl(url);
  const mediaType = (() => {
    try {
      const parsed = new URL(url, "https://dallyletter.invalid");
      return (parsed.searchParams.get("type") || "").toLowerCase();
    } catch { return ""; }
  })();
  const isImage = mediaType.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif)(?:[?#].*)?$/i.test(url);
  if (!isImage) return null;
  return <Image
    source={{ uri: resolved, headers: !isRemote && token ? { Authorization: "Bearer " + token } : undefined }}
    contentFit="contain"
    accessibilityLabel={accessibilityLabel || "Attached image"}
    style={{ width: "100%", height, borderRadius: 10, backgroundColor: "#f3f4f6" }}
    cachePolicy="memory-disk"
    transition={150}
  />;
}
