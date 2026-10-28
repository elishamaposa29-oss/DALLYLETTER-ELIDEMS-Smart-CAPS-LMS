#!/usr/bin/env node
/**
 * Deployed API smoke test for the post-merge profile/auth routes.
 *
 * Usage:
 *   API_BASE_URL=https://dallyletter-elidems-smart-caps-lms-4.onrender.com node scripts/smoke-post-merge-routes.mjs
 *
 * This deliberately sends no production credentials and performs no writes:
 * both requests are expected to be rejected by authentication/validation before
 * any profile upload, database mutation, or account creation can occur.
 */
const base = (process.env.API_BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");

async function assertRouteResponds(path, init, acceptedStatuses, label) {
  const response = await fetch(base + path, init);
  const body = await response.text();
  if (response.status === 404) {
    throw new Error(`${label}: route returned 404 (deployment may be stale or route is not mounted)`);
  }
  if (!acceptedStatuses.includes(response.status)) {
    throw new Error(`${label}: expected HTTP ${acceptedStatuses.join(" or ")}, got ${response.status}: ${body.slice(0, 240)}`);
  }
  console.log(`PASS ${label}: HTTP ${response.status}`);
}

await assertRouteResponds(
  "/api/users/me/cover",
  { method: "POST", body: new FormData() },
  [401, 403],
  "profile cover route is mounted and authentication-gated",
);

await assertRouteResponds(
  "/api/auth/google",
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ credential: "invalid.test.token" }),
  },
  [400, 401, 503],
  "Google sign-in route is mounted and rejects invalid/missing credentials",
);

console.log("Post-merge route smoke checks passed. These checks do not prove inbox delivery or successful authenticated media uploads.");
