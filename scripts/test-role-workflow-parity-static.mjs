import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const cvApi = read("artifacts/api-server/src/routes/teacherCvWorkspace.ts");
const mobileReview = read("artifacts/dallyletter-mobile/components/TeacherCvReviewWorkspace.tsx");
const adminEntry = read("artifacts/dallyletter-mobile/components/AdminMore.tsx");
const managerEntry = read("artifacts/dallyletter-mobile/components/ManagerMore.tsx");
const adminLayout = read("artifacts/dallyletter-mobile/app/(admin)/_layout.tsx");
const managerRoute = read("artifacts/dallyletter-mobile/app/(manager)/teacher-cv-workspace.tsx");
const mobileOperations = read("artifacts/dallyletter-mobile/components/MobileOperationsWorkspace.tsx");
const webLessons = read("artifacts/dallyletter/src/pages/teacher/TeacherLessons.tsx");
const webOperations = read("artifacts/dallyletter/src/pages/OperationsWorkspace.tsx");

for (const endpoint of [
  'router.get("/queue"',
  'router.get("/:teacherId/details"',
  'router.get("/:teacherId/history"',
  'router.get("/:teacherId/chat"',
  'router.post("/:teacherId/chat"',
  'router.post("/:teacherId/decision"',
  'router.post("/:teacherId/survey/decision"',
  'router.patch("/config"',
]) assert.ok(cvApi.includes(endpoint), "Teacher CV API lifecycle missing: " + endpoint);

for (const operation of [
  'api("/queue")',
  'api("/" + id + "/details")',
  'api("/" + id + "/history")',
  'api("/" + id + "/chat")',
  'api("/" + selectedId + "/decision", "POST"',
  'api("/" + selectedId + "/survey/decision", "POST"',
  'api("/" + selectedId + "/chat", "POST"',
  'api("/config", "PATCH"',
  'Approve CV',
  'Reject CV',
  'Approve survey',
  'Reject survey',
  'Review history',
  'Uploaded documents',
  'Private applicant conversation',
]) assert.ok(mobileReview.includes(operation), "Android CV review workspace missing operation: " + operation);

assert.ok(adminEntry.includes("/(admin)/teacher-cv-workspace"), "Owner More screen must link to the CV review workspace");
assert.ok(managerEntry.includes("/(manager)/teacher-cv-workspace"), "Manager More screen must link to the permission-gated CV review workspace");
assert.ok(adminLayout.includes('name="teacher-cv-workspace"'), "Admin route must be registered as a hidden route");
assert.ok(managerRoute.includes("TeacherCvReviewWorkspace"), "Manager route must render the shared review workspace");

for (const operation of [
  'call("/api/content-permissions")',
  'call("/api/content-permissions/mine")',
  'call("/api/content-permissions","POST"',
  '"/api/content-permissions/"+id,"PATCH"',
  '"/api/content-permissions/"+id+"/report","POST"',
  'My submitted requests',
  'Report decision to management',
]) assert.ok(mobileOperations.includes(operation), "Android operations workspace missing content-permission operation: " + operation);

for (const operation of [
  'getApiUrl("/api/content-permissions")',
  'getApiUrl("/api/content-permissions/mine")',
  'getApiUrl(`/api/content-permissions/${id}`)',
]) assert.ok(webLessons.includes(operation), "Web teacher lesson workflow missing content-permission operation: " + operation);
assert.ok(webOperations.includes('api(`/api/content-permissions/${id}/report`'), "Web operations workspace missing content-permission escalation/report action");

console.log("Role workflow parity static regression checks passed.");
