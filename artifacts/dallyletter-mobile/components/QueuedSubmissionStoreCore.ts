export type QueuedSubmission = {
  id: string;
  /** Stable across every retry of this logical submission. */
  idempotencyKey: string;
  userId: number;
  kind: "assignment" | "exercise" | "poll" | "message";
  targetId: number;
  path: string;
  body: string;
  createdAt: string;
  attempts: number;
  lastError?: string;
};

export interface QueueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const queueKey = (userId: number) => `dallyletter_pending_submissions_v1_user_${userId}`;

export function createSubmissionIdempotencyKey(): string {
  // Works in React Native runtimes without requiring a crypto polyfill.
  return `dl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export async function listQueuedSubmissions(storage: QueueStorage, userId: number): Promise<QueuedSubmission[]> {
  try {
    const raw = await storage.getItem(queueKey(userId));
    const rows = raw ? JSON.parse(raw) : [];
    return Array.isArray(rows) ? rows.filter((x: any) => x && x.userId === userId && typeof x.id === "string").map((x: any) => ({ ...x, idempotencyKey: typeof x.idempotencyKey === "string" && x.idempotencyKey ? x.idempotencyKey : x.id })) : [];
  } catch {
    return [];
  }
}

export async function enqueueSubmission(storage: QueueStorage, item: Omit<QueuedSubmission, "id" | "idempotencyKey" | "createdAt" | "attempts"> & { idempotencyKey?: string }): Promise<QueuedSubmission[]> {
  const current = await listQueuedSubmissions(storage, item.userId);
  // Keep exactly one pending operation per learning target. If the learner edits
  // an unsent answer, replace its payload and rotate the replay key so the server can safely accept the new body.
  const duplicate = current.find((x) => x.kind === item.kind && x.targetId === item.targetId && x.path === item.path);
  if (duplicate) {
    if (duplicate.body === item.body) return current;
    const replaced = current.map((row) => row.id === duplicate.id
      ? (() => { const id = createSubmissionIdempotencyKey(); return { ...row, id, idempotencyKey: id, body: item.body, attempts: 0, lastError: undefined }; })()
      : row);
    await storage.setItem(queueKey(item.userId), JSON.stringify(replaced));
    return replaced;
  }
  const idempotencyKey = item.idempotencyKey || createSubmissionIdempotencyKey();
  const id = idempotencyKey;
  const next: QueuedSubmission = { ...item, id, idempotencyKey, createdAt: new Date().toISOString(), attempts: 0 };
  const rows = [...current, next].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  await storage.setItem(queueKey(item.userId), JSON.stringify(rows));
  return rows;
}

export async function removeQueuedSubmission(storage: QueueStorage, userId: number, id: string): Promise<QueuedSubmission[]> {
  const rows = (await listQueuedSubmissions(storage, userId)).filter((x) => x.id !== id);
  await storage.setItem(queueKey(userId), JSON.stringify(rows));
  return rows;
}

export async function updateQueuedSubmission(storage: QueueStorage, userId: number, id: string, error: string): Promise<QueuedSubmission[]> {
  const rows = (await listQueuedSubmissions(storage, userId)).map((x) =>
    x.id === id ? { ...x, attempts: x.attempts + 1, lastError: error.slice(0, 300) } : x
  );
  await storage.setItem(queueKey(userId), JSON.stringify(rows));
  return rows;
}
