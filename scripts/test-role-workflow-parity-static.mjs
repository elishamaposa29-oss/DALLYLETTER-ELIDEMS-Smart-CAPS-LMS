import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const cvApi = read("artifacts/api-server/src/routes/teacherCvWorkspace.ts");
const contentPermissionApi = read("artifacts/api-server/src/routes/contentPermissions.ts");
const mobileReview = read("artifacts/dallyletter-mobile/components/TeacherCvReviewWorkspace.tsx");
const adminEntry = read("artifacts/dallyletter-mobile/components/AdminMore.tsx");
const managerEntry = read("artifacts/dallyletter-mobile/components/ManagerMore.tsx");
const adminLayout = read("artifacts/dallyletter-mobile/app/(admin)/_layout.tsx");
const managerLayout = read("artifacts/dallyletter-mobile/app/(manager)/_layout.tsx");
const transferReview = read("artifacts/dallyletter-mobile/components/TransferRequestReviewWorkspace.tsx");
const managerMore = read("artifacts/dallyletter-mobile/components/ManagerMore.tsx");
const managerRoute = read("artifacts/dallyletter-mobile/app/(manager)/teacher-cv-workspace.tsx");
const mobileOperations = read("artifacts/dallyletter-mobile/components/MobileOperationsWorkspace.tsx");
const webOperations = read("artifacts/dallyletter/src/pages/OperationsWorkspace.tsx");
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

assert.ok(adminEntry.includes("/(admin)/teacher-cv-workspace"), "Admin/Owner More screen must link to the CV review workspace");
assert.ok(adminEntry.includes('normalizedRole === "admin"'), "Admin must see the CV review entry because the API explicitly authorizes Admin CV review");
assert.ok(mobileReview.includes('const isAdmin = normalizedRole === "admin"'), "Android CV review workspace must expose actions allowed to Admin by the API");
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
assert.ok(contentPermissionApi.includes('router.get("/content-permissions/reports"'), "Backend management escalation report list is missing");
assert.ok(contentPermissionApi.includes('router.post("/content-permissions/:id/report/review"'), "Backend management escalation review action is missing");
assert.ok(webOperations.includes('/api/content-permissions/reports') && webOperations.includes("Management escalation reports") && webOperations.includes("report/review"), "Web escalation report list/review UI is missing");
assert.ok(mobileOperations.includes('/api/content-permissions/reports') && mobileOperations.includes("Management escalation reports") && mobileOperations.includes("report/review"), "Android escalation report list/review UI is missing");


const transferApi = read("artifacts/api-server/src/routes/academicRecords.ts");
for (const operation of [
  'router.get("/academic-records/transfer-requests"',
  'router.post("/academic-records/transfer-requests/:id/review"',
  'router.get("/academic-records/transfer-requests/:id/download"',
]) assert.ok(transferApi.includes(operation), "Transfer request backend lifecycle missing: " + operation);
for (const operation of [
  '"/api/academic-records/transfer-requests"',
  '"/api/academic-records/transfer-requests/"+row.id+"/review"',
  '"/api/academic-records/transfer-requests/"+row.id+"/download"',
  'Approve request',
  'Reject request',
  'Original submitted form',
  'Download approved PDF',
]) assert.ok(transferReview.includes(operation), "Android transfer review operation missing: " + operation);
assert.ok(adminLayout.includes('name="transfer-requests"'), "Owner transfer review route is not registered");
assert.ok(managerLayout.includes('name="transfer-requests"'), "Manager transfer review route is not registered");
assert.ok(managerMore.includes('permissions?.["transfers.view"]') && managerMore.includes("/(manager)/transfer-requests"), "Manager transfer review entry is not gated by transfers.view");
assert.ok(adminEntry.includes("/(admin)/transfer-requests"), "Owner transfer review entry is missing");

console.log("Role workflow parity static regression checks passed.");
