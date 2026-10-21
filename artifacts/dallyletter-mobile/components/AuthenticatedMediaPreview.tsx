import { Image } from "expo-image";
import { getApiUrl } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { getOfflineMediaUri } from "@/components/OfflineMediaDownload";
import OfflineMediaDownload from "@/components/OfflineMediaDownload";

export default function AuthenticatedMediaPreview({ url, height = 220, accessibilityLabel }: { url: string; height?: number; accessibilityLabel?: string }) {
  const { token, user } = useAuth();
  const [offlineUri, setOfflineUri] = useState<string | null>(null);
  const isRemote = /^https?:\/\//i.test(url);
  const resolved = isRemote ? url : getApiUrl(url);
  const mediaType = (() => {
    try {
      const parsed = new URL(url, "https://dallyletter.invalid");
      return (parsed.searchParams.get("type") || "").toLowerCase();
    } catch { return ""; }
  })();
  const isImage = mediaType.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif)(?:[?#].*)?$/i.test(url);
  useEffect(() => {
    let active = true;
    setOfflineUri(null);
    void getOfflineMediaUri(user?.id, url).then(uri => { if (active) setOfflineUri(uri); });
    return () => { active = false; };
  }, [url, user?.id]);
  if (!isImage) return <OfflineMediaDownload url={url} fileName={accessibilityLabel} />;
  return <View style={{ width: "100%" }}>
    <Image
      source={{ uri: offlineUri || resolved, headers: !offlineUri && !isRemote && token ? { Authorization: "Bearer " + token } : undefined }}
      contentFit="contain"
      accessibilityLabel={accessibilityLabel || "Attached image"}
      style={{ width: "100%", height, borderRadius: 10, backgroundColor: "#f3f4f6" }}
      cachePolicy="memory-disk"
      transition={150}
    />
    <OfflineMediaDownload url={url} fileName={accessibilityLabel} />
  </View>;
}
