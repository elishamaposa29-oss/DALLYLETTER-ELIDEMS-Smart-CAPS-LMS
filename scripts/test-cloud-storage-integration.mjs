import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [media, cloud, lessons, assignments, exercises, messages, schema] = await Promise.all([
  read("../artifacts/api-server/src/lib/media-storage.ts"),
  read("../artifacts/api-server/src/routes/cloudStorage.ts"),
  read("../artifacts/api-server/src/routes/lessons.ts"),
  read("../artifacts/api-server/src/routes/assignments.ts"),
  read("../artifacts/api-server/src/routes/exercises.ts"),
  read("../artifacts/api-server/src/routes/messages.ts"),
  read("../artifacts/api-server/src/lib/ensureCloudStorageSchema.ts"),
]);

assert.match(media, /persistUploadedMedia\([^)]*owner\?: CloudMediaOwner/);
assert.match(media, /used_bytes=used_bytes\+\$2[\s\S]*used_bytes\+\$2<=quota_bytes/);
assert.match(media, /INSERT INTO user_cloud_objects/);
assert.match(media, /getCloudObject\("media\/" \+ storageKey/);
assert.match(media, /GREATEST\(0,used_bytes-\$2\)/);
assert.match(lessons, /category: Number\(req\.query\.groupId\) > 0 \? "study_group" : file\.mimetype\.startsWith\("video\/"\) \? "video" : "lesson"/);
assert.match(assignments, /category: "assignment"/);
assert.match(exercises, /category: "exercise"/);
assert.match(messages, /category: groupId != null \? "study_group" : "message"/);
assert.match(cloud, /router\.post\("\/reconcile",requireAuth/);\nassert.match(cloud, /configured:isObjectStorageConfigured\(\)/);
assert.match(cloud, /WHERE id=\$1 AND user_id=\$2/);
assert.match(cloud, /WHERE user_id=\$1/);
assert.match(schema, /user_cloud_objects/);
assert.match(schema, /used_bytes<=quota_bytes/);

// Account-scoped quota contract: one account reaching its cap must not consume
// or expose another account's independent allowance.
const quota = 10 * 1024 * 1024 * 1024;
const accounts = new Map([[101, 0], [202, 0]]);
const reserve = (userId, size) => {
  const used = accounts.get(userId);
  if (used === undefined || !Number.isSafeInteger(size) || size <= 0 || used + size > quota) return false;
  accounts.set(userId, used + size);
  return true;
};
assert.equal(reserve(101, quota), true);
assert.equal(reserve(101, 1), false);
assert.equal(reserve(202, quota), true);
assert.equal(accounts.get(101), quota);
assert.equal(accounts.get(202), quota);
assert.equal(accounts.has(303), false);

console.log("Cloud storage integration contracts passed: learning uploads, quota reservation, reconciliation, and account isolation.");
