import AsyncStorage from "@react-native-async-storage/async-storage";

export type QueuedSubmission = {
  id: string;
  userId: number;
  kind: "assignment" | "exercise" | "poll";
  targetId: number;
  path: string;
  body: string;
  createdAt: string;
  attempts: number;
  lastError?: string;
};
const queueKey=(userId:number)=>`dallyletter_pending_submissions_v1_user_${userId}`;
export async function listQueuedSubmissions(userId:number):Promise<QueuedSubmission[]> {
  try {const raw=await AsyncStorage.getItem(queueKey(userId));const rows=raw?JSON.parse(raw):[];return Array.isArray(rows)?rows.filter((x:any)=>x&&x.userId===userId&&typeof x.id==="string"):[];}
  catch{return [];}
}
export async function enqueueSubmission(item:Omit<QueuedSubmission,"id"|"createdAt"|"attempts">):Promise<QueuedSubmission[]> {
  const current=await listQueuedSubmissions(item.userId);
  const id=`${item.kind}:${item.targetId}`;
  const next:QueuedSubmission={...item,id,createdAt:new Date().toISOString(),attempts:0};
  // Keep one latest pending payload per learning item; never create duplicate queue entries.
  const rows=[...current.filter(x=>x.id!==id),next].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  await AsyncStorage.setItem(queueKey(item.userId),JSON.stringify(rows));
  return rows;
}
export async function removeQueuedSubmission(userId:number,id:string):Promise<QueuedSubmission[]> {
  const rows=(await listQueuedSubmissions(userId)).filter(x=>x.id!==id);
  await AsyncStorage.setItem(queueKey(userId),JSON.stringify(rows));
  return rows;
}
export async function updateQueuedSubmission(userId:number,id:string,error:string):Promise<QueuedSubmission[]> {
  const rows=(await listQueuedSubmissions(userId)).map(x=>x.id===id?{...x,attempts:x.attempts+1,lastError:error.slice(0,300)}:x);
  await AsyncStorage.setItem(queueKey(userId),JSON.stringify(rows));
  return rows;
}
