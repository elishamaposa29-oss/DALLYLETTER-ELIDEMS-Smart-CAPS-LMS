import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { hashPassword, verifyPassword } from "./password-hash.js";

test("new password hashes are salted scrypt hashes and verify correctly", async () => {
  const first = await hashPassword("correct horse battery");
  const second = await hashPassword("correct horse battery");
  assert.match(first, /^scrypt\$16384\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
  assert.notEqual(first, second, "random salts must produce different hashes");
  assert.deepEqual(await verifyPassword("correct horse battery", first), { valid: true, needsRehash: false });
  assert.deepEqual(await verifyPassword("wrong password", first), { valid: false, needsRehash: false });
});

test("legacy fixed-salt hashes verify and request a transparent rehash", async () => {
  const legacy = crypto.createHash("sha256").update("old account password" + "dallyletter_salt_2024").digest("hex");
  assert.deepEqual(await verifyPassword("old account password", legacy), { valid: true, needsRehash: true });
  assert.deepEqual(await verifyPassword("incorrect", legacy), { valid: false, needsRehash: false });
});

test("malformed stored hashes are rejected safely", async () => {
  for (const value of ["", "scrypt$999999$8$1$bad$bad", "not-a-hash", "scrypt$16384$8$1$xyz$xyz"]) {
    assert.deepEqual(await verifyPassword("password", value), { valid: false, needsRehash: false });
  }
});
