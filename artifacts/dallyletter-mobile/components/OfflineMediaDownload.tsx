import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Linking from "expo-linking";
import { getApiUrl } from "@workspace/api-client-react";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

type SavedMedia = Record<string, { localUri: string; fileName: string; downloadedAt: string; bytes?: number }>;
const keyFor = (userId: number) => "dallyletter_offline_media_v1_user_" + userId;
function hash(value: string) { let h = 2166136261; for (let i=0;i<value.length;i++) { h ^= value.charCodeAt(i); h = Math.imul(h,16777619); } return (h>>>0).toString(16); }
export function resolveMediaUrl(url: string) { return /^https?:\/\//i.test(url) ? url : getApiUrl(url); }
export async function getOfflineMediaUri(userId: number | undefined, url: string): Promise<string | null> {
  if (!userId || !url) return null;
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    const saved = raw ? JSON.parse(raw) as SavedMedia : {};
    return saved[url]?.localUri ?? null;
  } catch { return null; }
}
export async function removeOfflineMedia(userId: number, url: string): Promise<void> {
  const raw = await AsyncStorage.getItem(keyFor(userId));
  const saved = raw ? JSON.parse(raw) as SavedMedia : {};
  const item = saved[url];
  if (item?.localUri) await FileSystem.deleteAsync(item.localUri, { idempotent: true }).catch(() => undefined);
  delete saved[url];
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(saved));
}
export default function OfflineMediaDownload({ url, fileName, accessibilityLabel }: { url: string; fileName?: string; accessibilityLabel?: string }) {
  const { user, token } = useAuth();
  const colors = useColors();
  const [saved, setSaved] = useState<SavedMedia[string] | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const resolved = resolveMediaUrl(url);
  useEffect(() => {
    let active = true;
    void getOfflineMediaUri(user?.id, url).then(async localUri => {
      if (!active || !user?.id || !localUri) { if (active) setSaved(null); return; }
      const raw = await AsyncStorage.getItem(keyFor(user.id));
      const entries = raw ? JSON.parse(raw) as SavedMedia : {};
      if (active) setSaved(entries[url] ?? null);
    });
    return () => { active = false; };
  }, [url, user?.id]);
  const download = async () => {
    if (!user?.id || busy) { if (!user?.id) Alert.alert("Sign in required", "Sign in before saving media for offline use."); return; }
    setBusy(true); setProgress(0);
    let localUri: string | undefined;
    try {
      const directory = (FileSystem.documentDirectory || "") + "dallyletter-offline/";
      if (!FileSystem.documentDirectory) throw new Error("Offline file storage is unavailable on this device.");
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true }).catch(() => undefined);
      const ext = (url.match(/\.([a-z0-9]{2,5})(?:[?#]|$)/i)?.[1] || (url.match(/[?&]type=([^&]+)/)?.[1] || "").split("/").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,5) || "bin";
      localUri = directory + hash(String(user.id) + ":" + url) + "." + ext;
      const task = FileSystem.createDownloadResumable(resolved, localUri, { headers: token ? { Authorization: "Bearer " + token } : {} }, event => {
        if (event.totalBytesExpectedToWrite > 0) setProgress(Math.min(100, Math.round(event.totalBytesWritten / event.totalBytesExpectedToWrite * 100)));
      });
      const result = await task.downloadAsync();
      if (!result?.uri) throw new Error("The download did not produce a local file.");
      const info = await FileSystem.getInfoAsync(result.uri);
      const raw = await AsyncStorage.getItem(keyFor(user.id));
      const entries = raw ? JSON.parse(raw) as SavedMedia : {};
      const record = { localUri: result.uri, fileName: fileName || url.split("/").pop()?.split("?")[0] || "Learning media", downloadedAt: new Date().toISOString(), bytes: info.exists && "size" in info ? info.size : undefined };
      entries[url] = record;
      await AsyncStorage.setItem(keyFor(user.id), JSON.stringify(entries));
      setSaved(record);
      Alert.alert("Saved for offline use", "This file is stored on this device for this account. Open it from the lesson even without internet.");
    } catch (error) {
      if (localUri) await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => undefined);
      Alert.alert("Download failed", error instanceof Error ? error.message : "Reconnect and try again.");
    } finally { setBusy(false); setProgress(0); }
  };
  const openSaved = async () => {
    if (!saved?.localUri) return;
    try { await Linking.openURL(saved.localUri); }
    catch { Alert.alert("Saved on device", saved.localUri); }
  };
  const remove = async () => {
    if (!user?.id) return;
    try { await removeOfflineMedia(user.id, url); setSaved(null); }
    catch (error) { Alert.alert("Could not remove download", error instanceof Error ? error.message : "Please retry."); }
  };
  return <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 8 }}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={accessibilityLabel || (saved ? "Open saved offline media" : "Download media for offline use")} disabled={busy} onPress={saved ? () => void openSaved() : () => void download} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: "row", alignItems: "center", gap: 7, opacity: busy ? 0.7 : 1 }}>
      {busy ? <ActivityIndicator size="small" color={colors.primary}/> : null}
      <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>{busy ? "Downloading " + progress + "%" : saved ? "Available offline · Open" : "Download for offline"}</Text>
    </TouchableOpacity>
    {saved ? <TouchableOpacity accessibilityRole="button" onPress={() => void remove()}><Text style={{ color: "#b91c1c", fontSize: 12 }}>Remove download</Text></TouchableOpacity> : null}
  </View>;
}
