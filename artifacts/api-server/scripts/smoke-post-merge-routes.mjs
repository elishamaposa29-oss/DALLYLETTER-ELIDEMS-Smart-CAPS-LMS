#!/usr/bin/env node
/**
 * Deployed API smoke test for the post-merge profile/auth routes.
 *
 * Usage:
 *   API_BASE_URL=https://dallyletter-elidems-smart-caps-lms-4.onrender.com node scripts/smoke-post-merge-routes.mjs
 *
 * This deliberately sends no production credentials and performs no writes.
 * Protected route probes must be rejected before private data or mutation.
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
  "/api/healthz",
  { method: "GET" },
  [200],
  "API health check is reachable and database connectivity is healthy",
);

const unknownRoute = await fetch(base + "/api/__api_404_repair_unknown_route__");
if (unknownRoute.status !== 404) {
  throw new Error(`Unknown API route should return HTTP 404, got ${unknownRoute.status}`);
}
console.log("PASS unknown API routes return HTTP 404");

await assertRouteResponds(
  "/api/users/me/cover",
  { method: "POST", body: new FormData() },
  [401, 403],
  "profile cover route is mounted and authentication-gated",
);

await assertRouteResponds(
  "/api/config/currentYear",
  { method: "GET" },
  [401, 403],
  "current-year config route is mounted and authentication-gated",
);

await assertRouteResponds(
  "/api/academic-records/current-year",
  { method: "GET" },
  [401, 403],
  "academic-records current-year route is mounted and authentication-gated",
);

await assertRouteResponds(
  "/api/profile/4/social",
  { method: "GET" },
  [401, 403],
  "Profile Hub social route is mounted and authentication-gated",
);

await assertRouteResponds(
  "/api/academic-records/report-learners",
  { method: "GET" },
  [401, 403],
  "academic report learner-list route is mounted and authentication-gated",
);

await assertRouteResponds("/api/academic-records/me", { method: "GET" }, [401, 403], "learner academic record route is mounted and authentication-gated");
await assertRouteResponds("/api/academic-records/reports/me", { method: "GET" }, [401, 403], "approved learner reports route is mounted and authentication-gated");
await assertRouteResponds("/api/academic-records/reports/drafts", { method: "GET" }, [401, 403], "academic report draft list is mounted and authentication-gated");
await assertRouteResponds("/api/academic-records/reports/drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) }, [401, 403], "academic report draft creation is authentication-gated");
await assertRouteResponds("/api/academic-records/reports/drafts/1/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) }, [401, 403], "academic report submission is authentication-gated");
await assertRouteResponds("/api/academic-records/reports/drafts/1/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "approved" }) }, [401, 403], "academic report review is authentication-gated");
await assertRouteResponds("/api/academic-records/reports/drafts/1/download/pdf", { method: "GET" }, [401, 403], "approved academic PDF route is authentication-gated");

await assertRouteResponds(
  "/api/manager-permissions/me",
  { method: "GET" },
  [401, 403],
  "manager permissions route is mounted and authentication-gated",
);

await assertRouteResponds("/api/profile/me/privacy", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({}) }, [401, 403], "profile privacy update is authentication-gated");
await assertRouteResponds("/api/teacher-cv-workspace/config", { method: "GET" }, [401, 403], "teacher CV workflow config is authentication-gated");
await assertRouteResponds("/api/teacher-cv-workspace/config", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ reviewDurationDays: 30 }) }, [401, 403], "teacher CV workflow config update is authentication-gated");
await assertRouteResponds("/api/teacher-cv-workspace/queue", { method: "GET" }, [401, 403], "teacher CV review queue is authentication-gated");
await assertRouteResponds("/api/teacher-cv-workspace/7/chat", { method: "GET" }, [401, 403], "teacher CV chat read is authentication-gated");
await assertRouteResponds("/api/teacher-cv-workspace/7/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: "unauthenticated smoke probe" }) }, [401, 403], "teacher CV chat write is authentication-gated");
await assertRouteResponds("/api/qualifications/3/review-history", { method: "GET" }, [401, 403], "qualification review history is authentication-gated");
await assertRouteResponds("/api/users/me/teacher-cv/pdf", { method: "GET" }, [401, 403], "teacher CV PDF is authentication-gated");
await assertRouteResponds("/api/achievements/award/recommendations", { method: "GET" }, [401, 403], "achievement award recommendations is authentication-gated");

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
