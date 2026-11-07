import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Linking from "expo-linking";
import { getApiUrl } from "@workspace/api-client-react";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Share, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { getApiMediaAuthHeaders, requiresApiMediaAuth } from "@/components/media-auth";
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
const offlineMediaDownloads = new Map<string, Promise<SavedMedia[string]>>();

async function downloadOfflineMediaRecord(
  userId: number,
  token: string | undefined,
  url: string,
  fileName?: string,
  onProgress?: (value: number) => void,
): Promise<SavedMedia[string]> {
  if (!url.trim()) throw new Error("Invalid media URL.");
  const existingUri = await getOfflineMediaUri(userId, url);
  if (existingUri) {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    const entries = raw ? JSON.parse(raw) as SavedMedia : {};
    if (entries[url]) return entries[url];
  }
  if (!FileSystem.documentDirectory) throw new Error("Offline file storage is unavailable on this device.");
  const directory = FileSystem.documentDirectory + "dallyletter-offline/";
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true }).catch(() => undefined);
  const ext = (url.match(/\\.([a-z0-9]{2,5})(?:[?#]|$)/i)?.[1] || (url.match(/[?&]type=([^&]+)/)?.[1] || "").split("/").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  const localUri = directory + hash(String(userId) + ":" + url) + "-" + Date.now().toString(36) + "." + ext;
  try {
    const task = FileSystem.createDownloadResumable(
      resolveMediaUrl(url),
      localUri,
      { headers: getApiMediaAuthHeaders(url, token, getApiUrl("/")) },
      event => {
        if (onProgress && event.totalBytesExpectedToWrite > 0) {
          onProgress(Math.min(100, Math.round(event.totalBytesWritten / event.totalBytesExpectedToWrite * 100)));
        }
      },
    );
    const result = await task.downloadAsync();
    if (!result?.uri || result.status < 200 || result.status >= 300) {
      throw new Error("Media download did not complete successfully" + (result?.status ? " (HTTP " + result.status + ")." : "."));
    }
    const info = await FileSystem.getInfoAsync(result.uri);
    const bytes = info.exists && "size" in info ? Number(info.size || 0) : 0;
    if (!info.exists || bytes <= 0) throw new Error("Downloaded media could not be verified.");
    const raw = await AsyncStorage.getItem(keyFor(userId));
    const entries = raw ? JSON.parse(raw) as SavedMedia : {};
    const previous = entries[url];
    const current = await getOfflineMediaUsage(userId);
    const previousBytes = Number(previous?.bytes || 0);
    if (!previous && current.items >= MAX_OFFLINE_MEDIA_ITEMS) throw new Error("Offline storage item limit reached (250 files).");
    if (current.bytes - previousBytes + bytes > MAX_OFFLINE_MEDIA_BYTES) throw new Error("Offline storage limit reached (512 MB).");
    const record = {
      localUri: result.uri,
      fileName: fileName || previous?.fileName || url.split("/").pop()?.split("?")[0] || "Learning media",
      downloadedAt: new Date().toISOString(),
      bytes,
    };
    entries[url] = record;
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(entries));
    if (previous?.localUri && previous.localUri !== record.localUri) {
      await FileSystem.deleteAsync(previous.localUri, { idempotent: true }).catch(() => undefined);
    }
    return record;
  } catch (error) {
    await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => undefined);
    throw error;
  }
}

/** Concurrent requests for the same account/media share one download and one registry write. */
export function downloadOfflineMediaRecordForAccount(
  userId: number,
  token: string | undefined,
  url: string,
  fileName?: string,
  onProgress?: (value: number) => void,
): Promise<SavedMedia[string]> {
  const key = String(userId) + ":" + url;
  const existing = offlineMediaDownloads.get(key);
  if (existing) return existing;
  const pending = downloadOfflineMediaRecord(userId, token, url, fileName, onProgress);
  offlineMediaDownloads.set(key, pending);
  void pending.finally(() => {
    if (offlineMediaDownloads.get(key) === pending) offlineMediaDownloads.delete(key);
  }).catch(() => undefined);
  return pending;
}

export async function saveOfflineMediaForAccount(userId: number, token: string | undefined, url: string, fileName?: string): Promise<string> {
  return (await downloadOfflineMediaRecordForAccount(userId, token, url, fileName)).localUri;
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
  const directMedia = /\/api\/(?:lessons|messages|assignments|exercises)\/media\//i.test(url) || /\.(?:png|jpe?g|gif|webp|avif|mp4|m4v|mov|webm|mp3|m4a|aac|ogg|wav|pdf|docx?|pptx?|xlsx?)(?:[?#].*)?$/i.test(url) || /[?&]type=(?:image|video|audio|application%2Fpdf|application\/pdf)\//i.test(url);
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
    try {
      const record = await downloadOfflineMediaRecordForAccount(user.id, token, url, fileName, setProgress);
      setSaved(record);
      await refreshUsage();
      Alert.alert("Saved for offline use", "This file is stored on this device for this account. Open it from the lesson even without internet.");
    } catch (error) {
      Alert.alert("Download failed", error instanceof Error ? error.message : "Reconnect and try again.");
    } finally { setBusy(false); setProgress(0); }
  };
  const shareProtectedLessonMedia = async () => {
    if (!token) { Alert.alert("Sign in required", "Sign in before creating a protected media share link."); return; }
    let resourcePath = url;
    try {
      if (/^https?:\/\//i.test(url)) {
        const parsed = new URL(url);
        resourcePath = parsed.pathname + parsed.search;
      }
    } catch { Alert.alert("Cannot share", "This media URL is not valid."); return; }
    const match = resourcePath.match(/^\/api\/lessons\/media\/([a-f0-9-]{36})(?:\?type=([^&]+))?/i);
    if (!match) { Alert.alert("Sharing unavailable", "The website only supports protected share links for lesson media. This file can still be saved offline."); return; }
    try {
      const response = await fetch(getApiUrl("/api/lessons/media/" + match[1] + "/share"), { method: "POST", headers: { Authorization: "Bearer " + token } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.shareToken !== "string") throw new Error(data.error || "The server refused to create a share link.");
      const webBase = (process.env.EXPO_PUBLIC_WEB_BASE_URL || "https://dallyletter-elidems-onlineschoolbye.vercel.app").replace(/\/+$/, "");
      const type = match[2] ? decodeURIComponent(match[2]) : "";
      const shareUrl = webBase + "/shared-media?url=" + encodeURIComponent(resourcePath) + "&type=" + encodeURIComponent(type) + "&title=" + encodeURIComponent(fileName || "Learning resource") + "&shareToken=" + encodeURIComponent(data.shareToken);
      await Share.share({ title: (fileName || "Learning resource") + " · Dallyletter Elidems", message: "Shared from Dallyletter Elidems. Anyone with this link can view the resource until the share link expires.\n" + shareUrl, url: shareUrl });
    } catch (error) { Alert.alert("Could not share media", error instanceof Error ? error.message : "Please reconnect and try again."); }
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
    {/\/api\/lessons\/media\/[a-f0-9-]{36}/i.test(url) ? <TouchableOpacity accessibilityRole="button" onPress={() => void shareProtectedLessonMedia()} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: "row", alignItems: "center", gap: 7 }}><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>Share protected link</Text></TouchableOpacity> : null}
    {usage ? <Text style={{width:"100%",color:colors.mutedForeground,fontSize:11}}>Offline storage: {(usage.bytes/1024/1024).toFixed(1)} / {(usage.maxBytes/1024/1024).toFixed(0)} MB · {usage.items} / {usage.maxItems} files</Text> : null}
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={accessibilityLabel || (saved ? "Open saved offline media" : "Download media for offline use")} disabled={busy} onPress={saved ? () => void openSaved() : () => void download} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: "row", alignItems: "center", gap: 7, opacity: busy ? 0.7 : 1 }}>
      {busy ? <ActivityIndicator size="small" color={colors.primary}/> : null}
      <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>{busy ? "Downloading " + progress + "%" : saved ? "Available offline · Open" : "Download for offline"}</Text>
    </TouchableOpacity>
    {saved ? <TouchableOpacity accessibilityRole="button" onPress={() => void remove()}><Text style={{ color: "#b91c1c", fontSize: 12 }}>Remove download</Text></TouchableOpacity> : null}
  </View>;
}
