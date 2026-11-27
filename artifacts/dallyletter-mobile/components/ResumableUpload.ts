import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { getApiUrl } from "@workspace/api-client-react";

type UploadSession = { sessionId: string; durableUri: string; fileName: string; totalBytes: number; mimeType: string; fingerprint: string; updatedAt: number };
type UploadProgress = { sentBytes: number; totalBytes: number; percent: number };
const sessionKey = (userId: number, fileName: string, totalBytes: number, mimeType: string) =>
  "dallyletter_resumable_upload_v1_user_" + userId + "_" + encodeURIComponent([fileName,totalBytes,mimeType].join("|")).slice(0,160);

async function pruneExpiredUploadSessions(userId:number,token:string):Promise<void> {
  const prefix="dallyletter_resumable_upload_v1_user_"+userId+"_";
  const keys=(await AsyncStorage.getAllKeys()).filter(key=>key.startsWith(prefix));
  if(!keys.length)return;
  const rows=await AsyncStorage.multiGet(keys);
  for(const [key,raw] of rows) {
    if(!raw)continue;
    try {
      const session=JSON.parse(raw) as UploadSession;
      if(Date.now()-Number(session.updatedAt||0)<=7*24*60*60*1000)continue;
      await requestJson("/api/uploads/sessions/"+session.sessionId,token,{method:"DELETE"}).catch(()=>undefined);
      if(session.durableUri)await FileSystem.deleteAsync(session.durableUri,{idempotent:true}).catch(()=>undefined);
      await AsyncStorage.removeItem(key);
    } catch { await AsyncStorage.removeItem(key).catch(()=>undefined); }
  }
}

async function requestJson(url: string, token: string, init: RequestInit = {}) {
  const response = await fetch(getApiUrl(url), { ...init, headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(init.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body.error || "Upload request failed") + " (HTTP " + response.status + ").");
  return body;
}

async function sourceFingerprint(uri: string, totalBytes: number): Promise<string> {
  const length = Math.min(64 * 1024, totalBytes);
  const first = await FileSystem.readAsStringAsync(uri,{encoding:FileSystem.EncodingType.Base64,position:0,length});
  const last = await FileSystem.readAsStringAsync(uri,{encoding:FileSystem.EncodingType.Base64,position:Math.max(0,totalBytes-length),length});
  return first + ":" + last;
}

async function persistSourceFile(uri: string, fileName: string, expectedBytes: number): Promise<string> {
  const root = FileSystem.documentDirectory;
  if (!root) throw new Error("Persistent device storage is unavailable for resumable uploads.");
  const directory = root + "dallyletter-uploads/";
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true }).catch(() => undefined);
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0,100) || "upload.bin";
  const durableUri = directory + Date.now().toString(36) + "-" + safeName;
  await FileSystem.copyAsync({ from: uri, to: durableUri });
  const info = await FileSystem.getInfoAsync(durableUri);
  if (!info.exists || !("size" in info) || Number(info.size) !== expectedBytes) {
    await FileSystem.deleteAsync(durableUri,{idempotent:true}).catch(()=>undefined);
    throw new Error("The selected file could not be copied completely into persistent device storage.");
  }
  return durableUri;
}

/** Server-acknowledged chunks and a durable local source file let Android resume after
 * app closure, process death, or network interruption without restarting from byte zero. */
export async function uploadFileResumably(options: {
  userId: number; token: string; uri: string; fileName: string; mimeType: string; totalBytes: number;
  onProgress?: (progress: UploadProgress) => void;
}): Promise<{ mediaUrl: string; storageKey: string; fileName: string; size: number }> {
  const { userId, token, uri, fileName, mimeType, totalBytes, onProgress } = options;
  if (!Number.isSafeInteger(userId) || userId < 1 || !uri || !token || !fileName || !mimeType || !Number.isSafeInteger(totalBytes) || totalBytes < 1) throw new Error("Invalid resumable upload details.");
  const key = sessionKey(userId,fileName,totalBytes,mimeType);
  await pruneExpiredUploadSessions(userId,token);
  let session: UploadSession | null = null;
  try { const raw=await AsyncStorage.getItem(key); session=raw?JSON.parse(raw) as UploadSession:null; } catch { session=null; }
  if (session && (session.fileName!==fileName || session.totalBytes!==totalBytes || session.mimeType!==mimeType)) {
    await requestJson("/api/uploads/sessions/"+session.sessionId,token,{method:"DELETE"}).catch(()=>undefined);
    if(session.durableUri) await FileSystem.deleteAsync(session.durableUri,{idempotent:true}).catch(()=>undefined);
    session=null;
  }
  if (session && session.durableUri) {
    try {
      const incomingFingerprint=await sourceFingerprint(uri,totalBytes);
      const storedFingerprint=session.fingerprint || await sourceFingerprint(session.durableUri,totalBytes);
      if(incomingFingerprint!==storedFingerprint) {
        await requestJson("/api/uploads/sessions/"+session.sessionId,token,{method:"DELETE"}).catch(()=>undefined);
        await FileSystem.deleteAsync(session.durableUri,{idempotent:true}).catch(()=>undefined);
        session=null;
      } else if(!session.fingerprint) {
        session={...session,fingerprint:storedFingerprint};
        await AsyncStorage.setItem(key,JSON.stringify(session));
      }
    } catch { /* A picker URI may no longer be readable; the persisted copy remains authoritative. */ }
  }
  if (!session) {
    const durableUri=await persistSourceFile(uri,fileName,totalBytes);
    try {
      const created=await requestJson("/api/uploads/sessions",token,{method:"POST",body:JSON.stringify({fileName,mimeType,totalBytes})});
      session={sessionId:created.sessionId,durableUri,fileName,totalBytes,mimeType,fingerprint:await sourceFingerprint(durableUri,totalBytes),updatedAt:Date.now()};
      await AsyncStorage.setItem(key,JSON.stringify(session));
    } catch(error) {
      await FileSystem.deleteAsync(durableUri,{idempotent:true}).catch(()=>undefined);
      throw error;
    }
  } else {
    const info=await FileSystem.getInfoAsync(session.durableUri).catch(()=>null);
    if (!info?.exists) {
      const durableUri=await persistSourceFile(uri,fileName,totalBytes);
      session={...session,durableUri,fingerprint:await sourceFingerprint(durableUri,totalBytes),updatedAt:Date.now()};
      await AsyncStorage.setItem(key,JSON.stringify(session));
    }
  }

  let state:any;
  try { state=await requestJson("/api/uploads/sessions/"+session.sessionId,token); }
  catch(error) {
    if (!(error instanceof Error)||!error.message.includes("HTTP 404")) throw error;
    const created=await requestJson("/api/uploads/sessions",token,{method:"POST",body:JSON.stringify({fileName,mimeType,totalBytes})});
    session={...session,sessionId:created.sessionId,updatedAt:Date.now()};
    await AsyncStorage.setItem(key,JSON.stringify(session));
    state=await requestJson("/api/uploads/sessions/"+session.sessionId,token);
  }
  if(state.complete&&state.mediaUrl) {
    await AsyncStorage.removeItem(key);
    await FileSystem.deleteAsync(session.durableUri,{idempotent:true}).catch(()=>undefined);
    return state;
  }
  const chunkBytes=Number(state.chunkBytes);
  if(!Number.isSafeInteger(chunkBytes)||chunkBytes<1)throw new Error("The server returned an invalid upload chunk size.");
  const received=new Set<number>((state.received||[]).map((row:any)=>Number(row.index)));
  let sentBytes=(state.received||[]).reduce((sum:number,row:any)=>sum+Number(row.size||0),0);
  onProgress?.({sentBytes,totalBytes,percent:Math.min(100,Math.round(sentBytes/totalBytes*100))});
  const chunks=Math.ceil(totalBytes/chunkBytes);
  for(let index=0;index<chunks;index++) {
    if(received.has(index))continue;
    const offset=index*chunkBytes,length=Math.min(chunkBytes,totalBytes-offset);
    const data=await FileSystem.readAsStringAsync(session.durableUri,{encoding:FileSystem.EncodingType.Base64,position:offset,length});
    if(!data)throw new Error("Could not read upload chunk "+index+" from this device.");
    await requestJson("/api/uploads/sessions/"+session.sessionId+"/chunks/"+index,token,{method:"PUT",body:JSON.stringify({offset,data})});
    sentBytes+=length;
    onProgress?.({sentBytes,totalBytes,percent:Math.min(100,Math.round(sentBytes/totalBytes*100))});
    await AsyncStorage.setItem(key,JSON.stringify({...session,updatedAt:Date.now()}));
  }
  const completed=await requestJson("/api/uploads/sessions/"+session.sessionId+"/complete",token,{method:"POST",body:"{}"});
  await AsyncStorage.removeItem(key);
  await FileSystem.deleteAsync(session.durableUri,{idempotent:true}).catch(()=>undefined);
  return completed;
}

export async function cancelResumableUpload(userId:number,fileName:string,totalBytes:number,mimeType:string,token:string):Promise<void> {
  const key=sessionKey(userId,fileName,totalBytes,mimeType);
  const raw=await AsyncStorage.getItem(key);
  if(!raw)return;
  const session=JSON.parse(raw) as UploadSession;
  await requestJson("/api/uploads/sessions/"+session.sessionId,token,{method:"DELETE"}).catch(()=>undefined);
  await FileSystem.deleteAsync(session.durableUri,{idempotent:true}).catch(()=>undefined);
  await AsyncStorage.removeItem(key);
}
