import test from "node:test";
import assert from "node:assert/strict";
import { canReadPrivateProfileByRole, maskPayoutDestination } from "./profile-access-policy.js";

test("learners cannot read another teacher's private profile or payout fields", () => {
  assert.equal(canReadPrivateProfileByRole(21, 31, "student"), false);
  assert.equal(canReadPrivateProfileByRole(21, 31, "learner"), false);
});

test("a user can read their own private profile", () => {
  assert.equal(canReadPrivateProfileByRole(21, 21, "teacher"), true);
});

test("owner and admin may read private profile fields", () => {
  assert.equal(canReadPrivateProfileByRole(1, 31, "owner"), true);
  assert.equal(canReadPrivateProfileByRole(2, 31, "admin"), true);
});

test("owner payout previews mask phone and email destinations", () => {
  assert.equal(maskPayoutDestination("0771234123"), "077****123");
  assert.equal(maskPayoutDestination("teacher@example.com"), "t****@example.com");
});

test("teachers cannot read another teacher's payout profile", () => {
  assert.equal(canReadPrivateProfileByRole(31, 32, "teacher"), false);
});
