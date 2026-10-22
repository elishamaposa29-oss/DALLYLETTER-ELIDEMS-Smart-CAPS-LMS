import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import { getApiUrl } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { getOfflineMediaUri } from "@/components/OfflineMediaDownload";
import OfflineMediaDownload from "@/components/OfflineMediaDownload";

export default function AuthenticatedMediaPreview({ url, height = 220, accessibilityLabel }: { url: string; height?: number; accessibilityLabel?: string }) {
  const { token, user } = useAuth();
  const colors = useColors();
  const [offlineUri, setOfflineUri] = useState<string | null>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
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
  const imageSource = { uri: offlineUri || resolved, headers: !offlineUri && !isRemote && token ? { Authorization: "Bearer " + token } : undefined };
  const label = accessibilityLabel || (isImage ? "Attached image" : "Attached media");
  const looksVideo = /video|\\.(mp4|m4v|mov|webm|ogv)(?:[?#].*)?$/i.test(url);
  const looksAudio = /audio|\\.(mp3|m4a|aac|ogg|wav)(?:[?#].*)?$/i.test(url);
  const videoPlayer = useVideoPlayer(looksVideo ? { uri: resolved, headers: !isRemote && token ? { Authorization: "Bearer " + token } : undefined } : null, player => { player.loop = false; });
  useEffect(() => {
    if (!looksVideo || !offlineUri) return;
    void videoPlayer.replaceAsync({ uri: offlineUri }).catch(() => undefined);
  }, [looksVideo, offlineUri, videoPlayer]);
  return <View style={{ width: "100%" }}>
    <Pressable accessibilityRole="button" accessibilityLabel={"Open " + label + " fullscreen"} onPress={() => setFullScreen(true)} style={{ width: "100%", minHeight: isImage ? height : 76, borderRadius: 12, overflow: "hidden", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
      {isImage ? <Image source={imageSource} contentFit="contain" accessibilityLabel={label} style={{ width: "100%", height, backgroundColor: "#f3f4f6" }} cachePolicy="memory-disk" transition={150} /> : looksVideo ? <VideoView player={videoPlayer} style={{ width: "100%", height: Math.max(180, height) }} nativeControls allowsFullscreen={false} contentFit="contain" accessibilityLabel={label} /> : <View style={{ minHeight: 76, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}><Feather name={looksAudio ? "headphones" : "file-text"} size={24} color={colors.primary} /><View style={{ flex: 1 }}><Text style={{ color: colors.foreground, fontWeight: "600" }}>{label}</Text><Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 3 }}>Tap to open media</Text></View><Feather name="maximize-2" size={18} color={colors.mutedForeground} /></View>}
    </Pressable>
    <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 5 }}><Pressable accessibilityRole="button" accessibilityLabel="Media options" onPress={() => setShowOptions(v => !v)} hitSlop={10} style={{ paddingHorizontal: 10, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 6 }}><Feather name="more-horizontal" size={18} color={colors.mutedForeground} /><Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Options</Text></Pressable></View>
    {showOptions ? <View style={{ padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.card }}><OfflineMediaDownload url={url} fileName={accessibilityLabel} /></View> : null}
    <Modal visible={fullScreen} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => setFullScreen(false)}>
      <View style={{ flex: 1, backgroundColor: "#07111f", paddingTop: 18 }}>
        <View style={{ minHeight: 52, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><Text numberOfLines={1} style={{ color: "#fff", flex: 1, fontSize: 15, fontWeight: "600" }}>{label}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close fullscreen media" onPress={() => { setFullScreen(false); setShowOptions(false); }} hitSlop={12} style={{ padding: 10 }}><Feather name="x" size={24} color="#fff" /></Pressable></View>
        <View style={{ flex: 1, justifyContent: "center" }}>{isImage ? <Image source={imageSource} contentFit="contain" accessibilityLabel={label} style={{ width: "100%", height: "100%" }} cachePolicy="memory-disk" /> : looksVideo ? <VideoView player={videoPlayer} style={{ width: "100%", height: "100%" }} nativeControls allowsFullscreen contentFit="contain" accessibilityLabel={label} /> : <View style={{ alignItems: "center", padding: 24 }}><Feather name={looksAudio ? "headphones" : "file-text"} size={42} color="#fff" /><Text style={{ color: "#fff", marginTop: 14, textAlign: "center" }}>{looksAudio ? "Audio playback is not yet wired into this media viewer." : "Open this document using the available media options."}</Text></View>}</View>
        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: "#334155" }}><Pressable accessibilityRole="button" onPress={() => setShowOptions(v => !v)} style={{ alignSelf: "flex-end", padding: 10, flexDirection: "row", alignItems: "center", gap: 8 }}><Feather name="more-horizontal" size={18} color="#fff" /><Text style={{ color: "#fff" }}>Media options</Text></Pressable>{showOptions ? <View style={{ padding: 10, borderRadius: 10, backgroundColor: "#fff" }}><OfflineMediaDownload url={url} fileName={accessibilityLabel} /></View> : null}</View>
      </View>
    </Modal>
  </View>;
}
