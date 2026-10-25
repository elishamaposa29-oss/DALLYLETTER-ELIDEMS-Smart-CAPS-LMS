import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedPublicRegistrationRole } from "./registration-policy.js";

test("public signup allows learner accounts and teacher applications only", () => {
  assert.equal(isAllowedPublicRegistrationRole("student"), true);
  assert.equal(isAllowedPublicRegistrationRole("teacher"), true);
});

test("public signup rejects privileged, prefect, malformed, and unknown roles", () => {
  for (const role of ["owner", "admin", "platform_owner", "manager", "senior_manager", "prefect", "student_manager", "", " Student ", null, 1, {}, true]) {
    assert.equal(isAllowedPublicRegistrationRole(role), false, String(role));
  }
});
