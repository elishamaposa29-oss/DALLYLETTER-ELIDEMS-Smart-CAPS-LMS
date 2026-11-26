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

export interface QueueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const queueKey = (userId: number) => `dallyletter_pending_submissions_v1_user_${userId}`;

export async function listQueuedSubmissions(storage: QueueStorage, userId: number): Promise<QueuedSubmission[]> {
  try {
    const raw = await storage.getItem(queueKey(userId));
    const rows = raw ? JSON.parse(raw) : [];
    return Array.isArray(rows) ? rows.filter((x: any) => x && x.userId === userId && typeof x.id === "string") : [];
  } catch {
    return [];
  }
}

export async function enqueueSubmission(storage: QueueStorage, item: Omit<QueuedSubmission, "id" | "createdAt" | "attempts">): Promise<QueuedSubmission[]> {
  const current = await listQueuedSubmissions(storage, item.userId);
  const id = `${item.kind}:${item.targetId}`;
  const next: QueuedSubmission = { ...item, id, createdAt: new Date().toISOString(), attempts: 0 };
  // One latest pending payload per learning item; never duplicate queue entries.
  const rows = [...current.filter((x) => x.id !== id), next].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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
