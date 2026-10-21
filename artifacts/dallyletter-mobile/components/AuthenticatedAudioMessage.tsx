import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from "react-native";
import { getApiUrl } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function AuthenticatedAudioMessage({ url }: { url: string }) {
  const { token } = useAuth();
  const colors = useColors();
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    setLocalUri(null);
    const load = async () => {
      setLoading(true);
      try {
        const source = /^https?:\/\//i.test(url) ? url : getApiUrl(url);
        const directory = (FileSystem.cacheDirectory || FileSystem.documentDirectory || "") + "dallyletter-audio/";
        if (!directory) throw new Error("Audio cache is unavailable.");
        await FileSystem.makeDirectoryAsync(directory, { intermediates: true }).catch(() => undefined);
        const name = "voice-" + url.split("/").pop()?.replace(/[^a-z0-9_-]/gi,"").slice(0,80) + ".m4a";
        const destination = directory + name;
        const result = await FileSystem.downloadAsync(source, destination, { headers: token ? { Authorization: "Bearer " + token } : {} });
        if (!active) { await FileSystem.deleteAsync(result.uri,{idempotent:true}).catch(()=>undefined); return; }
        setLocalUri(result.uri);
        player.replace(result.uri);
      } catch (e) { if(active) Alert.alert("Voice message unavailable",e instanceof Error?e.message:"Reconnect to load this voice message."); }
      finally { if(active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [url, token, player]);
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 }}>
    <TouchableOpacity accessibilityRole="button" disabled={loading || !localUri} onPress={() => { if (!localUri) return; try { if (status.playing) player.pause(); else player.play(); } catch { Alert.alert("Playback failed","This audio file could not be played on this device."); } }} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 8 }}>
      {loading ? <ActivityIndicator size="small" color={colors.primary}/> : <Text style={{ color: colors.primary, fontWeight: "700" }}>{status.playing ? "Ⅱ Pause voice" : "▶ Play voice"}</Text>}
    </TouchableOpacity>
    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{loading ? "Loading audio…" : status.duration ? Math.floor(status.duration/60)+":"+String(Math.floor(status.duration%60)).padStart(2,"0") : "Voice message"}</Text>
  </View>;
}
