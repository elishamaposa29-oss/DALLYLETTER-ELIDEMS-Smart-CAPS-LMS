import type { QueueStorage } from "./QueuedSubmissionStoreCore";

export type OfflineLearningKind = "lesson" | "draft" | "message" | "learning";
export type OfflineLearningRecord<T = unknown> = {
  id: string;
  userId: number;
  kind: OfflineLearningKind;
  value: T;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  bytes: number;
};

export type OfflineStorePolicy = { now?: number; retentionMs?: number; maxBytes?: number; maxEntries?: number };
const retentionDefault = 60 * 24 * 60 * 60 * 1000;
const maxBytesDefault = 8 * 1024 * 1024;
const maxEntriesDefault = 500;
const keyFor = (userId: number) => `dallyletter_offline_learning_v1_user_${userId}`;

function validUser(userId: number): boolean {
  return Number.isSafeInteger(userId) && userId > 0;
}
function byteSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export async function listOfflineLearningRecords<T = unknown>(storage: QueueStorage, userId: number, policy: OfflineStorePolicy = {}): Promise<OfflineLearningRecord<T>[]> {
  if (!validUser(userId)) return [];
  const now = policy.now ?? Date.now(), retention = policy.retentionMs ?? retentionDefault;
  try {
    const raw = await storage.getItem(keyFor(userId));
    const rows = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(rows)) return [];
    return rows.filter((row: any) => row && row.userId === userId && typeof row.id === "string" &&
      ["lesson", "draft", "message", "learning"].includes(row.kind) &&
      Number.isFinite(row.updatedAt) && now - row.updatedAt >= 0 && now - row.updatedAt <= retention &&
      Number.isFinite(row.expiresAt) && row.expiresAt > now) as OfflineLearningRecord<T>[];
  } catch { return []; }
}

export async function putOfflineLearningRecord<T>(storage: QueueStorage, userId: number, kind: OfflineLearningKind, id: string, value: T, policy: OfflineStorePolicy = {}): Promise<OfflineLearningRecord<T>[]> {
  if (!validUser(userId) || !id || id.length > 240) throw new Error("Invalid offline learning record identity.");
  const now = policy.now ?? Date.now(), retention = policy.retentionMs ?? retentionDefault;
  const maxBytes = policy.maxBytes ?? maxBytesDefault, maxEntries = policy.maxEntries ?? maxEntriesDefault;
  const current = await listOfflineLearningRecords<T>(storage, userId, policy);
  const record: OfflineLearningRecord<T> = { id, userId, kind, value, createdAt: current.find(row => row.id === id && row.kind === kind)?.createdAt ?? now, updatedAt: now, expiresAt: now + retention, bytes: byteSize(value) };
  let rows = [...current.filter(row => !(row.id === id && row.kind === kind)), record];
  const totalBytes = () => rows.reduce((sum, row) => sum + row.bytes, 0);
  // Evict least-recently-used cached lesson material first. Never evict drafts,
  // messages or learner-generated learning events to make room for a cache item.
  while (rows.length > maxEntries || totalBytes() > maxBytes) {
    const candidates = rows.filter(row => row.kind === "lesson" && !(row.id === id && row.kind === kind)).sort((a,b)=>a.updatedAt-b.updatedAt);
    if (!candidates.length) throw new Error("Offline storage is full. Sync or remove cached lessons before saving more learner work.");
    rows = rows.filter(row => row !== candidates[0]);
  }
  await storage.setItem(keyFor(userId), JSON.stringify(rows));
  return rows;
}

export async function removeOfflineLearningRecord(storage: QueueStorage, userId: number, kind: OfflineLearningKind, id: string): Promise<OfflineLearningRecord[]> {
  if (!validUser(userId)) return [];
  const rows = (await listOfflineLearningRecords(storage, userId)).filter(row => !(row.kind === kind && row.id === id));
  await storage.setItem(keyFor(userId), JSON.stringify(rows));
  return rows;
}

export async function pruneOfflineLearningRecords(storage: QueueStorage, userId: number, policy: OfflineStorePolicy = {}): Promise<OfflineLearningRecord[]> {
  const rows = await listOfflineLearningRecords(storage, userId, policy);
  await storage.setItem(keyFor(userId), JSON.stringify(rows));
  return rows;
}
