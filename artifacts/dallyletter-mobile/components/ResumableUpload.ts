import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { getApiUrl } from "@workspace/api-client-react";

type UploadSession = { sessionId: string; uri: string; fileName: string; totalBytes: number; mimeType: string; updatedAt: number };
type UploadProgress = { sentBytes: number; totalBytes: number; percent: number };
const sessionKey = (userId: number, uri: string) => "dallyletter_resumable_upload_v1_user_" + userId + "_" + encodeURIComponent(uri).slice(0,160);

async function requestJson(url: string, token: string, init: RequestInit = {}) {
  const response = await fetch(getApiUrl(url), { ...init, headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(init.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body.error || "Upload request failed") + " (HTTP " + response.status + ").");
  return body;
}

/** Uploads in small acknowledged chunks. The session id is persisted per account/file,
 * so calling this again after an interruption resumes from the server's confirmed offset. */
export async function uploadFileResumably(options: {
  userId: number;
  token: string;
  uri: string;
  fileName: string;
  mimeType: string;
  totalBytes: number;
  onProgress?: (progress: UploadProgress) => void;
}): Promise<{ mediaUrl: string; storageKey: string; fileName: string; size: number }> {
  const { userId, token, uri, fileName, mimeType, totalBytes, onProgress } = options;
  if (!Number.isSafeInteger(userId) || userId < 1 || !uri || !token || !Number.isSafeInteger(totalBytes) || totalBytes < 1) throw new Error("Invalid resumable upload details.");
  const key = sessionKey(userId, uri);
  let session: UploadSession | null = null;
  try { const raw = await AsyncStorage.getItem(key); session = raw ? JSON.parse(raw) as UploadSession : null; } catch { session = null; }
  if (!session || session.uri !== uri || session.totalBytes !== totalBytes || session.fileName !== fileName || session.mimeType !== mimeType) {
    const created = await requestJson("/api/uploads/sessions", token, { method: "POST", body: JSON.stringify({ fileName, mimeType, totalBytes }) });
    session = { sessionId: created.sessionId, uri, fileName, totalBytes, mimeType, updatedAt: Date.now() };
    await AsyncStorage.setItem(key, JSON.stringify(session));
  }
  let state: any;
  try { state = await requestJson("/api/uploads/sessions/" + session.sessionId, token); }
  catch (error) {
    if (!(error instanceof Error) || !error.message.includes("HTTP 404")) throw error;
    const created = await requestJson("/api/uploads/sessions", token, { method: "POST", body: JSON.stringify({ fileName, mimeType, totalBytes }) });
    session = { ...session, sessionId: created.sessionId, updatedAt: Date.now() };
    await AsyncStorage.setItem(key, JSON.stringify(session));
    state = await requestJson("/api/uploads/sessions/" + session.sessionId, token);
  }
  if (state.complete && state.mediaUrl) { await AsyncStorage.removeItem(key); return state; }
  const chunkBytes = Number(state.chunkBytes);
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1) throw new Error("The server returned an invalid chunk size.");
  const received = new Set<number>((state.received || []).map((item: any) => Number(item.index)));
  let sentBytes = (state.received || []).reduce((sum: number, item: any) => sum + Number(item.size || 0), 0);
  onProgress?.({ sentBytes, totalBytes, percent: Math.min(100, Math.round(sentBytes / totalBytes * 100)) });
  const chunks = Math.ceil(totalBytes / chunkBytes);
  for (let index = 0; index < chunks; index++) {
    if (received.has(index)) continue;
    const offset = index * chunkBytes, length = Math.min(chunkBytes, totalBytes - offset);
    const data = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64, position: offset, length });
    if (!data) throw new Error("Could not read upload chunk " + index + " from this device.");
    await requestJson("/api/uploads/sessions/" + session.sessionId + "/chunks/" + index, token, { method: "PUT", body: JSON.stringify({ offset, data }) });
    sentBytes += length;
    onProgress?.({ sentBytes, totalBytes, percent: Math.min(100, Math.round(sentBytes / totalBytes * 100)) });
    await AsyncStorage.setItem(key, JSON.stringify({ ...session, updatedAt: Date.now() }));
  }
  const completed = await requestJson("/api/uploads/sessions/" + session.sessionId + "/complete", token, { method: "POST", body: "{}" });
  await AsyncStorage.removeItem(key);
  return completed;
}

export async function cancelResumableUpload(userId: number, uri: string, token: string): Promise<void> {
  const key = sessionKey(userId, uri);
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return;
  const session = JSON.parse(raw) as UploadSession;
  await requestJson("/api/uploads/sessions/" + session.sessionId, token, { method: "DELETE" }).catch(() => undefined);
  await AsyncStorage.removeItem(key);
}
