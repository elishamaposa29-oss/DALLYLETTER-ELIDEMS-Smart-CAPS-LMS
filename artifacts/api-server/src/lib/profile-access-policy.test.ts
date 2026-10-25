import test from "node:test";
import assert from "node:assert/strict";
import { canReadPrivateUserProfile } from "./profile-access-policy.js";

test("a user can read their own private profile", () => {
  assert.equal(canReadPrivateUserProfile(7, 7, false), true);
});

test("a regular user cannot read another account's private profile", () => {
  assert.equal(canReadPrivateUserProfile(7, 8, false), false);
});

test("authorized account managers can read another account's private profile", () => {
  assert.equal(canReadPrivateUserProfile(7, 8, true), true);
});
