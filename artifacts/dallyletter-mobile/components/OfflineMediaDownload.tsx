import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Linking from "expo-linking";
import { getApiUrl } from "@workspace/api-client-react";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

type SavedMedia = Record<string, { localUri: string; fileName: string; downloadedAt: string; bytes?: number }>;
type OfflineUsage = {items:number;bytes:number;maxItems:number;maxBytes:number};
const keyFor = (userId: number) => "dallyletter_offline_media_v1_user_" + userId;
const MAX_OFFLINE_MEDIA_BYTES = 512 * 1024 * 1024;
const MAX_OFFLINE_MEDIA_ITEMS = 250;
export async function getOfflineMediaUsage(userId: number): Promise<{items:number;bytes:number;maxItems:number;maxBytes:number}> {
  const raw = await AsyncStorage.getItem(keyFor(userId));
  const saved = raw ? JSON.parse(raw) as SavedMedia : {};
  let bytes = 0;
  let items = 0;
  for (const entry of Object.values(saved)) {
    const info = await FileSystem.getInfoAsync(entry.localUri).catch(() => null);
    if (info?.exists) { items += 1; bytes += info && "size" in info ? Number(info.size || entry.bytes || 0) : Number(entry.bytes || 0); }
  }
  return {items,bytes,maxItems:MAX_OFFLINE_MEDIA_ITEMS,maxBytes:MAX_OFFLINE_MEDIA_BYTES};
}
function hash(value: string) { let h = 2166136261; for (let i=0;i<value.length;i++) { h ^= value.charCodeAt(i); h = Math.imul(h,16777619); } return (h>>>0).toString(16); }
export function resolveMediaUrl(url: string) { return /^https?:\/\//i.test(url) ? url : getApiUrl(url); }
function needsMediaAuth(url: string) { return /\/api\/(?:lessons|messages|assignments|exercises)\/media\//i.test(url); }
export async function saveOfflineMediaForAccount(userId: number, token: string | undefined, url: string, fileName?: string): Promise<string> {
  if (!url || /^https?:\/\//i.test(url) && !/^https?:\/\//i.test(url)) throw new Error("Invalid media URL.");
  const existingUri = await getOfflineMediaUri(userId, url);
  if (existingUri) return existingUri;
  if (!FileSystem.documentDirectory) throw new Error("Offline file storage is unavailable on this device.");
  const directory = FileSystem.documentDirectory + "dallyletter-offline/";
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true }).catch(() => undefined);
  const ext = (url.match(/\.([a-z0-9]{2,5})(?:[?#]|$)/i)?.[1] || (url.match(/[?&]type=([^&]+)/)?.[1] || "").split("/").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  const localUri = directory + hash(String(userId) + ":" + url) + "-" + Date.now().toString(36) + "." + ext;
  try {
    const result = await FileSystem.downloadAsync(resolveMediaUrl(url), localUri, { headers: needsMediaAuth(url) && token ? { Authorization: "Bearer " + token } : {} });
    if (result.status < 200 || result.status >= 300) throw new Error("Media server returned HTTP " + result.status + ".");
    const info = await FileSystem.getInfoAsync(result.uri);
    const bytes = info.exists && "size" in info ? Number(info.size || 0) : 0;
    if (!info.exists || bytes <= 0) throw new Error("Downloaded media could not be verified.");
    const raw = await AsyncStorage.getItem(keyFor(userId));
    const entries = raw ? JSON.parse(raw) as SavedMedia : {};
    const current = await getOfflineMediaUsage(userId);
    if (!entries[url] && current.items >= MAX_OFFLINE_MEDIA_ITEMS) throw new Error("Offline storage item limit reached (250 files).");
    if (current.bytes + bytes > MAX_OFFLINE_MEDIA_BYTES) throw new Error("Offline storage limit reached (512 MB).");
    entries[url] = { localUri: result.uri, fileName: fileName || url.split("/").pop()?.split("?")[0] || "Learning media", downloadedAt: new Date().toISOString(), bytes };
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(entries));
    return result.uri;
  } catch (error) {
    await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => undefined);
    throw error;
  }
}

export async function getOfflineMediaUri(userId: number | undefined, url: string): Promise<string | null> {
  if (!userId || !url) return null;
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    const saved = raw ? JSON.parse(raw) as SavedMedia : {};
    const localUri = saved[url]?.localUri;
    if (!localUri) return null;
    const info = await FileSystem.getInfoAsync(localUri);
    if (info.exists) return localUri;
    delete saved[url];
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(saved));
    return null;
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
  const [usage, setUsage] = useState<OfflineUsage | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const refreshUsage = useCallback(async () => {
    if (!user?.id) { setUsage(null); return; }
    try { setUsage(await getOfflineMediaUsage(user.id)); } catch { setUsage(null); }
  }, [user?.id]);
  const resolved = resolveMediaUrl(url);
  const directMedia = /^\/api\/(?:lessons|messages|assignments|exercises)\/media\//i.test(url) || /\.(?:png|jpe?g|gif|webp|avif|mp4|m4v|mov|webm|mp3|m4a|aac|ogg|wav|pdf|docx?|pptx?|xlsx?)(?:[?#].*)?$/i.test(url) || /[?&]type=(?:image|video|audio|application%2Fpdf|application\/pdf)\//i.test(url);
  useEffect(() => { void refreshUsage(); }, [refreshUsage]);
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
      // Use a unique versioned filename so a failed replacement never destroys
      // a previously saved offline copy of the same media URL.
      localUri = directory + hash(String(user.id) + ":" + url) + "-" + Date.now().toString(36) + "." + ext;
      const task = FileSystem.createDownloadResumable(resolved, localUri, { headers: !/^https?:\/\//i.test(url) && token ? { Authorization: "Bearer " + token } : {} }, event => {
        if (event.totalBytesExpectedToWrite > 0) setProgress(Math.min(100, Math.round(event.totalBytesWritten / event.totalBytesExpectedToWrite * 100)));
      });
      const result = await task.downloadAsync();
      if (!result?.uri) throw new Error("The download did not produce a local file.");
      const info = await FileSystem.getInfoAsync(result.uri);
      const raw = await AsyncStorage.getItem(keyFor(user.id));
      const entries = raw ? JSON.parse(raw) as SavedMedia : {};
      const previousLocalUri = entries[url]?.localUri;
      const record = { localUri: result.uri, fileName: fileName || url.split("/").pop()?.split("?")[0] || "Learning media", downloadedAt: new Date().toISOString(), bytes: info.exists && "size" in info ? info.size : undefined };
      const newBytes = Number(record.bytes || 0);
      const previousBytes = Number(entries[url]?.bytes || 0);
      const currentUsage = await getOfflineMediaUsage(user.id);
      if (!entries[url] && currentUsage.items >= MAX_OFFLINE_MEDIA_ITEMS) throw new Error("Offline download limit reached (250 files). Remove an older download before saving another.");
      if (currentUsage.bytes - previousBytes + newBytes > MAX_OFFLINE_MEDIA_BYTES) throw new Error("Offline storage limit reached (512 MB). Remove older downloads or choose a smaller file.");
      if (newBytes <= 0) throw new Error("The downloaded file size could not be verified; it was not saved to the offline library.");
      entries[url] = record;
      await AsyncStorage.setItem(keyFor(user.id), JSON.stringify(entries));
      // Remove the replaced copy only after the new copy and registry are safely saved.
      if (previousLocalUri && previousLocalUri !== record.localUri) {
        await FileSystem.deleteAsync(previousLocalUri, { idempotent: true }).catch(() => undefined);
      }
      setSaved(record);
      await refreshUsage();
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
    try { await removeOfflineMedia(user.id, url); setSaved(null); await refreshUsage(); }
    catch (error) { Alert.alert("Could not remove download", error instanceof Error ? error.message : "Please retry."); }
  };
  if (!directMedia && !saved) return <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 6 }}>External link · Internet required</Text>;
  return <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 8 }}>
    {usage ? <Text style={{width:"100%",color:colors.mutedForeground,fontSize:11}}>Offline storage: {(usage.bytes/1024/1024).toFixed(1)} / {(usage.maxBytes/1024/1024).toFixed(0)} MB · {usage.items} / {usage.maxItems} files</Text> : null}
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={accessibilityLabel || (saved ? "Open saved offline media" : "Download media for offline use")} disabled={busy} onPress={saved ? () => void openSaved() : () => void download} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: "row", alignItems: "center", gap: 7, opacity: busy ? 0.7 : 1 }}>
      {busy ? <ActivityIndicator size="small" color={colors.primary}/> : null}
      <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>{busy ? "Downloading " + progress + "%" : saved ? "Available offline · Open" : "Download for offline"}</Text>
    </TouchableOpacity>
    {saved ? <TouchableOpacity accessibilityRole="button" onPress={() => void remove()}><Text style={{ color: "#b91c1c", fontSize: 12 }}>Remove download</Text></TouchableOpacity> : null}
  </View>;
}
