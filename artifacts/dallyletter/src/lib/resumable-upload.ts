import { getApiUrl } from "@workspace/api-client-react";

type SessionRecord = { sessionId: string; name: string; size: number; type: string; lastModified: number };
type Progress = { sentBytes: number; totalBytes: number; percent: number };

async function requestJson(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(getApiUrl(path), { ...init, headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(init.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body.error || "Upload request failed") + " (HTTP " + response.status + ").");
  return body;
}

function sessionKey(userId: number, file: File): string {
  return "dallyletter_resumable_upload_v1_user_" + userId + "_" + btoa(unescape(encodeURIComponent([file.name,file.size,file.type,file.lastModified].join("|")))).slice(0,120);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i=0;i<bytes.length;i+=step) binary += String.fromCharCode(...bytes.subarray(i,Math.min(i+step,bytes.length)));
  return btoa(binary);
}

/** Browser counterpart to the Android uploader. The server is authoritative for
 * received chunk offsets; session metadata survives reloads and interrupted transfers. */
export async function uploadFileResumably(file: File, token: string, userId: number, onProgress?: (progress: Progress) => void): Promise<{ mediaUrl: string; storageKey: string; fileName: string; size: number }> {
  if (!file || !token || !Number.isSafeInteger(userId) || userId < 1 || file.size < 1) throw new Error("Invalid resumable upload details.");
  const key = sessionKey(userId,file);
  let session: SessionRecord | null = null;
  try { const raw=localStorage.getItem(key); session=raw?JSON.parse(raw) as SessionRecord:null; } catch { session=null; }
  if (!session || session.name!==file.name || session.size!==file.size || session.type!==file.type || session.lastModified!==file.lastModified) {
    const created=await requestJson("/api/uploads/sessions",token,{method:"POST",body:JSON.stringify({fileName:file.name,mimeType:file.type,totalBytes:file.size})});
    session={sessionId:created.sessionId,name:file.name,size:file.size,type:file.type,lastModified:file.lastModified};
    localStorage.setItem(key,JSON.stringify(session));
  }
  let state:any;
  try { state=await requestJson("/api/uploads/sessions/"+session.sessionId,token); }
  catch(error) {
    if (!(error instanceof Error) || !error.message.includes("HTTP 404")) throw error;
    const created=await requestJson("/api/uploads/sessions",token,{method:"POST",body:JSON.stringify({fileName:file.name,mimeType:file.type,totalBytes:file.size})});
    session={...session,sessionId:created.sessionId};localStorage.setItem(key,JSON.stringify(session));
    state=await requestJson("/api/uploads/sessions/"+session.sessionId,token);
  }
  if(state.complete&&state.mediaUrl){localStorage.removeItem(key);return state;}
  const chunkBytes=Number(state.chunkBytes);
  if(!Number.isSafeInteger(chunkBytes)||chunkBytes<1)throw new Error("Server returned an invalid upload chunk size.");
  const received=new Set<number>((state.received||[]).map((row:any)=>Number(row.index)));
  let sentBytes=(state.received||[]).reduce((n:number,row:any)=>n+Number(row.size||0),0);
  onProgress?.({sentBytes,totalBytes:file.size,percent:Math.min(100,Math.round(sentBytes/file.size*100))});
  const count=Math.ceil(file.size/chunkBytes);
  for(let index=0;index<count;index++){
    if(received.has(index))continue;
    const offset=index*chunkBytes,blob=file.slice(offset,Math.min(file.size,offset+chunkBytes));
    const bytes=new Uint8Array(await blob.arrayBuffer());
    await requestJson("/api/uploads/sessions/"+session.sessionId+"/chunks/"+index,token,{method:"PUT",body:JSON.stringify({offset,data:toBase64(bytes)})});
    sentBytes+=bytes.byteLength;
    onProgress?.({sentBytes,totalBytes:file.size,percent:Math.min(100,Math.round(sentBytes/file.size*100))});
    localStorage.setItem(key,JSON.stringify(session));
  }
  const completed=await requestJson("/api/uploads/sessions/"+session.sessionId+"/complete",token,{method:"POST",body:"{}"});
  localStorage.removeItem(key);
  return completed;
}
