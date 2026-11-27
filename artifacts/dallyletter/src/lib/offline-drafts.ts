type DraftRecord<T = unknown> = { key: string; value: T; updatedAt: number };

async function workerRequest<T>(message: Record<string, unknown>, token: string, userId: number): Promise<T> {
  if (!("serviceWorker" in navigator)) throw new Error("Offline draft storage requires a supported browser.");
  const registration = await navigator.serviceWorker.ready;
  const worker = navigator.serviceWorker.controller || registration.active;
  if (!worker) throw new Error("Offline storage is not ready yet. Reload the page and try again.");
  return new Promise<T>((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => { channel.port1.close(); reject(new Error("Offline storage did not respond.")); }, 5000);
    channel.port1.onmessage = event => {
      window.clearTimeout(timeout);
      channel.port1.close();
      const result = event.data;
      if (!result?.ok) reject(new Error(result?.error || "Offline storage failed."));
      else resolve(result as T);
    };
    worker.postMessage({ ...message, authorization: "Bearer " + token, userId }, [channel.port2]);
  });
}

/** Persist a user draft in the account-scoped, 60-day offline store. */
export async function saveOfflineDraft<T>(key: string, value: T, token: string, userId: number): Promise<void> {
  await workerRequest({ type: "DALLYLETTER_SAVE_OFFLINE_DRAFT", draft: { key, value } }, token, userId);
}

/** Read only drafts belonging to the currently authenticated account. */
export async function listOfflineDrafts<T = unknown>(token: string, userId: number): Promise<DraftRecord<T>[]> {
  const result = await workerRequest<{ drafts: DraftRecord<T>[] }>({ type: "DALLYLETTER_GET_OFFLINE_DRAFTS" }, token, userId);
  return result.drafts;
}

/** Remove drafts for the authenticated account; queued submissions are never deleted here. */
export function clearOfflineDrafts(token: string, userId: number): void {
  navigator.serviceWorker?.controller?.postMessage({ type: "DALLYLETTER_CLEAR_OFFLINE_DRAFTS", authorization: "Bearer " + token, userId });
}
