import test from "node:test";
import assert from "node:assert/strict";
import { getApiMediaAuthHeaders, requiresApiMediaAuth } from "./media-auth.js";

const api = "https://api.example.test";

test("adds authentication for relative protected media paths", () => {
  assert.equal(requiresApiMediaAuth("/api/lessons/media/123", api), true);
  assert.deepEqual(getApiMediaAuthHeaders("/api/messages/media/123", "test-token", api), { Authorization: "Bearer test-token" });
});

test("adds authentication for absolute URLs on the configured API origin only", () => {
  assert.equal(requiresApiMediaAuth("https://api.example.test/api/assignments/media/123", api), true);
  assert.deepEqual(getApiMediaAuthHeaders("https://api.example.test/api/exercises/media/123", "test-token", api), { Authorization: "Bearer test-token" });
});

test("never forwards the bearer token to an external origin that mimics a protected path", () => {
  const hostile = "https://evil.example/api/lessons/media/123";
  assert.equal(requiresApiMediaAuth(hostile, api), false);
  assert.deepEqual(getApiMediaAuthHeaders(hostile, "test-token", api), {});
  assert.deepEqual(getApiMediaAuthHeaders("https://api.example.test/api/users", "test-token", api), {});
});

test("does not authorize malformed URLs or protocol-confused origins", () => {
  assert.equal(requiresApiMediaAuth("not a URL", api), false);
  assert.equal(requiresApiMediaAuth("http://api.example.test/api/messages/media/123", api), false);
});
