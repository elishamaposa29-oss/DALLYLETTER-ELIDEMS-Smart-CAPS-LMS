import test from "node:test";
import assert from "node:assert/strict";
import { enqueueSubmission, listQueuedSubmissions, removeQueuedSubmission, updateQueuedSubmission, type QueueStorage } from "./QueuedSubmissionStoreCore.js";

class MemoryStorage implements QueueStorage {
  values = new Map<string, string>();
  async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { this.values.set(key, value); }
}

const item = (userId: number, body: string, targetId = 42) => ({
  userId, kind: "assignment" as const, targetId, path: `/api/assignments/${targetId}/submit`, body,
});

test("queued submissions remain isolated by account", async () => {
  const storage = new MemoryStorage();
  await enqueueSubmission(storage, item(11, "learner A answer"));
  await enqueueSubmission(storage, item(22, "learner B answer"));
  assert.equal((await listQueuedSubmissions(storage, 11))[0].body, "learner A answer");
  assert.equal((await listQueuedSubmissions(storage, 22))[0].body, "learner B answer");
  assert.equal((await listQueuedSubmissions(storage, 11)).length, 1);
});

test("re-enqueue replaces the pending payload for the same learning item", async () => {
  const storage = new MemoryStorage();
  await enqueueSubmission(storage, item(11, "draft 1"));
  const rows = await enqueueSubmission(storage, item(11, "draft 2"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].body, "draft 2");
  assert.equal(rows[0].attempts, 0);
  assert.equal(rows[0].id, "assignment:42");
});

test("retry bookkeeping increments attempts and bounds error text", async () => {
  const storage = new MemoryStorage();
  await enqueueSubmission(storage, item(11, "answer"));
  const rows = await updateQueuedSubmission(storage, 11, "assignment:42", "offline");
  assert.equal(rows[0].attempts, 1);
  assert.equal(rows[0].lastError, "offline");
  const again = await updateQueuedSubmission(storage, 11, "assignment:42", "x".repeat(400));
  assert.equal(again[0].attempts, 2);
  assert.equal(again[0].lastError?.length, 300);
});

test("successful submission removal only changes the owning account queue", async () => {
  const storage = new MemoryStorage();
  await enqueueSubmission(storage, item(11, "A"));
  await enqueueSubmission(storage, item(22, "B"));
  await removeQueuedSubmission(storage, 11, "assignment:42");
  assert.equal((await listQueuedSubmissions(storage, 11)).length, 0);
  assert.equal((await listQueuedSubmissions(storage, 22))[0].body, "B");
});

test("malformed stored data fails closed to an empty queue", async () => {
  const storage = new MemoryStorage();
  storage.values.set("dallyletter_pending_submissions_v1_user_11", "{not-json");
  assert.deepEqual(await listQueuedSubmissions(storage, 11), []);
});
