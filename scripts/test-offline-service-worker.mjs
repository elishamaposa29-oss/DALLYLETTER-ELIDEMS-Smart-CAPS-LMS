import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workerPath = path.join(root, "artifacts/dallyletter/public/sw.js");
const source = await readFile(workerPath, "utf8");
const syntax = spawnSync(process.execPath, ["--check", workerPath], { encoding: "utf8" });
assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout || "Service worker syntax check failed.");

for (const contract of [
  "DALLYLETTER_REPLAY_OFFLINE_OUTBOX",
  "DALLYLETTER_SAVE_OFFLINE_DRAFT",
  "DALLYLETTER_GET_OFFLINE_DRAFTS",
  "DALLYLETTER_DELETE_OFFLINE_DRAFT",
  "Idempotency-Key",
  "OFFLINE_MAX_AGE_MS = 60*24*60*60*1000",
  "OUTBOX_MAX_BYTES = 5*1024*1024",
  "DRAFT_MAX_BYTES = 2*1024*1024",
  "DALLYLETTER_OFFLINE_SUBMISSION_RESULT",
  "DALLYLETTER_OFFLINE_SUBMISSION_QUEUED",
  "offlineScope(a,userId)",
  "messages)$/i.test(u.pathname)",
]) assert.ok(source.includes(contract), `Missing offline service-worker contract: ${contract}`);

const entryStart = source.indexOf("const entry={id:key,idempotencyKey:key");
const entryEnd = source.indexOf(";", entryStart);
const entry = source.slice(entryStart, entryEnd);
assert.ok(entryStart >= 0 && !entry.includes("authorization"), "Bearer credentials must never be persisted in the offline outbox.");
console.log("OFFLINE_SERVICE_WORKER: PASS — syntax, account scoping, bounded outbox, drafts and idempotent replay.");
