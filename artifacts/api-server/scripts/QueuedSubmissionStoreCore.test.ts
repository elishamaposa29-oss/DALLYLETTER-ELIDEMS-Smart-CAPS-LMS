import test from "node:test";
import assert from "node:assert/strict";
import { enqueueSubmission, listQueuedSubmissions, removeQueuedSubmission, updateQueuedSubmission, type QueueStorage } from "../../dallyletter-mobile/components/QueuedSubmissionStoreCore.js";
import { listOfflineLearningRecords, putOfflineLearningRecord, pruneOfflineLearningRecords } from "../../dallyletter-mobile/components/OfflineLearningStoreCore.js";

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

test("re-enqueueing the identical operation is deduplicated without changing its key", async () => {
  const storage = new MemoryStorage();
  await enqueueSubmission(storage, item(11, "draft 1"));
  const rows = await enqueueSubmission(storage, item(11, "draft 1"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].body, "draft 1");
  assert.equal(rows[0].attempts, 0);
  assert.equal(rows[0].idempotencyKey, rows[0].id);
});

test("a changed payload is retained as a separate operation instead of overwriting queued work", async () => {\n  const storage = new MemoryStorage();\n  await enqueueSubmission(storage, item(11, "first answer"));\n  const rows = await enqueueSubmission(storage, item(11, "second answer"));\n  assert.equal(rows.length, 2);\n  assert.deepEqual(rows.map(row => row.body), ["first answer", "second answer"]);\n  assert.notEqual(rows[0].idempotencyKey, rows[1].idempotencyKey);\n});\n\ntest("retry bookkeeping increments attempts and bounds error text", async () => {
  const storage = new MemoryStorage();
  await enqueueSubmission(storage, item(11, "answer"));
  const rows = await updateQueuedSubmission(storage, 11, (await listQueuedSubmissions(storage, 11))[0].id, "offline");
  assert.equal(rows[0].attempts, 1);
  assert.equal(rows[0].lastError, "offline");
  const again = await updateQueuedSubmission(storage, 11, (await listQueuedSubmissions(storage, 11))[0].id, "x".repeat(400));
  assert.equal(again[0].attempts, 2);
  assert.equal(again[0].lastError?.length, 300);
});

test("successful submission removal only changes the owning account queue", async () => {
  const storage = new MemoryStorage();
  await enqueueSubmission(storage, item(11, "A"));
  await enqueueSubmission(storage, item(22, "B"));
  await removeQueuedSubmission(storage, 11, (await listQueuedSubmissions(storage, 11))[0].id);
  assert.equal((await listQueuedSubmissions(storage, 11)).length, 0);
  assert.equal((await listQueuedSubmissions(storage, 22))[0].body, "B");
});

test("malformed stored data fails closed to an empty queue", async () => {
  const storage = new MemoryStorage();
  storage.values.set("dallyletter_pending_submissions_v1_user_11", "{not-json");
  assert.deepEqual(await listQueuedSubmissions(storage, 11), []);
});

test("offline learning records are isolated by account and retained for 60 days", async () => {
  const storage = new MemoryStorage();
  const now = 1_800_000_000_000;
  await putOfflineLearningRecord(storage, 11, "draft", "draft-1", { text: "unfinished work" }, { now });
  await putOfflineLearningRecord(storage, 22, "draft", "draft-1", { text: "another learner" }, { now });
  assert.equal((await listOfflineLearningRecords(storage, 11, { now })).length, 1);
  assert.equal((await listOfflineLearningRecords(storage, 22, { now }))[0].value.text, "another learner");
  assert.equal((await listOfflineLearningRecords(storage, 11, { now: now + 60 * 24 * 60 * 60 * 1000 + 1 })).length, 0);
});

test("retention pruning removes expired cached lessons deterministically", async () => {
  const storage = new MemoryStorage();
  const now = 1_800_000_000_000;
  await putOfflineLearningRecord(storage, 11, "lesson", "lesson-old", { text: "old" }, { now: now - 61 * 24 * 60 * 60 * 1000 });
  await putOfflineLearningRecord(storage, 11, "lesson", "lesson-new", { text: "new" }, { now });
  const rows = await pruneOfflineLearningRecords(storage, 11, { now });
  assert.deepEqual(rows.map(row => row.id), ["lesson-new"]);
});

test("storage pressure evicts least-recently-used lesson cache before learner drafts", async () => {
  const storage = new MemoryStorage();
  const now = 1_800_000_000_000;
  await putOfflineLearningRecord(storage, 11, "lesson", "lesson-old", "x".repeat(100), { now, maxBytes: 1000 });
  await putOfflineLearningRecord(storage, 11, "draft", "draft-keep", { text: "must survive" }, { now: now + 1, maxBytes: 1000 });
  await putOfflineLearningRecord(storage, 11, "learning", "event-1", "y".repeat(800), { now: now + 2, maxBytes: 1000 });
  const rows = await listOfflineLearningRecords(storage, 11, { now: now + 2 });
  assert.equal(rows.some(row => row.id === "draft-keep"), true);
  assert.equal(rows.some(row => row.id === "lesson-old"), false);
});

test("storage pressure refuses to discard drafts or learner events", async () => {
  const storage = new MemoryStorage();
  const now = 1_800_000_000_000;
  await putOfflineLearningRecord(storage, 11, "draft", "draft-keep", "x".repeat(100), { now, maxBytes: 300 });
  await assert.rejects(() => putOfflineLearningRecord(storage, 11, "learning", "event-2", "y".repeat(1000), { now: now + 1, maxBytes: 300 }), /storage is full/i);
  assert.equal((await listOfflineLearningRecords(storage, 11, { now: now + 1 })).some(row => row.id === "draft-keep"), true);
});
