import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const cvApi = read("artifacts/api-server/src/routes/teacherCvWorkspace.ts");
const usersApi = read("artifacts/api-server/src/routes/users.ts");
const contentPermissionApi = read("artifacts/api-server/src/routes/contentPermissions.ts");
const mobileReview = read("artifacts/dallyletter-mobile/components/TeacherCvReviewWorkspace.tsx");
const adminEntry = read("artifacts/dallyletter-mobile/components/AdminMore.tsx");
const managerEntry = read("artifacts/dallyletter-mobile/components/ManagerMore.tsx");
const adminLayout = read("artifacts/dallyletter-mobile/app/(admin)/_layout.tsx");
const managerLayout = read("artifacts/dallyletter-mobile/app/(manager)/_layout.tsx");
const transferReview = read("artifacts/dallyletter-mobile/components/TransferRequestReviewWorkspace.tsx");
const teacherReports = read("artifacts/dallyletter-mobile/app/(teacher)/reports.tsx");
const reportReview = read("artifacts/dallyletter-mobile/components/AcademicReportReviewWorkspace.tsx");
const permissionMobile = read("artifacts/dallyletter-mobile/components/ManagerPermissionControlsMobile.tsx");
const qualificationReview = read("artifacts/dallyletter-mobile/components/QualificationReviewWorkspaceMobile.tsx");
const achievementReview = read("artifacts/dallyletter-mobile/components/AchievementRecommendationReviewWorkspaceMobile.tsx");
const adminUsers = read("artifacts/dallyletter-mobile/app/(admin)/users.tsx");
const ownerTools = read("artifacts/dallyletter-mobile/app/(admin)/tools.tsx");
const adminSettings = read("artifacts/dallyletter/src/pages/admin/AdminSettings.tsx");
const managerMore = read("artifacts/dallyletter-mobile/components/ManagerMore.tsx");
const managerRoute = read("artifacts/dallyletter-mobile/app/(manager)/teacher-cv-workspace.tsx");
const mobileOperations = read("artifacts/dallyletter-mobile/components/MobileOperationsWorkspace.tsx");
const webOperations = read("artifacts/dallyletter/src/pages/OperationsWorkspace.tsx");
const webLessons = read("artifacts/dallyletter/src/pages/teacher/TeacherLessons.tsx");

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
assert.ok(adminEntry.includes('normalizedRole === "admin"'), "Admin may open the CV workspace for the read-only CV and survey view capability");
assert.ok(mobileReview.includes('const canReview = isOwner || managerGrants["teacher_cv.review"] === true;'), "Android CV rejection/review actions must require Owner or an explicit Senior Manager grant");
assert.ok(mobileReview.includes('const canAuthorize = isOwner || managerGrants["teacher_cv.authorize"] === true;'), "Android CV approval must require Owner or an explicit Senior Manager authorization grant");
assert.ok(mobileReview.includes('const canViewQualificationDocuments = isOwner || normalizedRole === "admin" || managerGrants["qualifications.view"] === true;'), "Admin retains read-only access to submitted qualification documents through the CV workspace");
assert.ok(mobileReview.includes('const canViewQualificationHistory = isOwner || managerGrants["qualifications.view"] === true;'), "Admin does not receive qualification review-history access merely from CV view");
assert.ok(mobileReview.includes('getApiUrl("/api/users/" + selectedId + "/teacher-documents/" + qualification.document_id)'), "Android certificate preview uses the same permission-checked teacher-document endpoint as web");
assert.ok(!mobileReview.includes('const isAdmin = normalizedRole === "admin"'), "Admin must not bypass teacher CV approval permissions");
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
assert.ok(transferReview.includes('const canApprove=isOwner||permissions["transfers.approve"]===true') && transferReview.includes('const canReject=isOwner||permissions["transfers.reject"]===true'), "Android transfer review must preserve Senior-only approval and separately grantable rejection");
for (const operation of [
  'api("/api/academic-records/report-learners")',
  'api("/api/academic-records/reports/drafts")',
  'api("/api/academic-records/reports/drafts", {',
  'method: "POST"',
  "Create report draft",
  "Saved report drafts",
  "Download official PDF",
]) assert.ok(teacherReports.includes(operation), "Android teacher report builder missing operation: " + operation);
assert.ok(adminLayout.includes('name="transfer-requests"'), "Owner transfer review route is not registered");
assert.ok(managerLayout.includes('name="transfer-requests"'), "Manager transfer review route is not registered");
assert.ok(managerMore.includes('permissions?.["transfers.view"]') && managerMore.includes("/(manager)/transfer-requests"), "Manager transfer review entry is not gated by transfers.view");
assert.ok(adminEntry.includes("/(admin)/transfer-requests"), "Owner transfer review entry is missing");


const academicRecordsApi = read("artifacts/api-server/src/routes/academicRecords.ts");
for (const operation of [
  'router.get("/academic-records/reports/drafts"',
  'router.post("/academic-records/reports/drafts/:id/review"',
  'router.get("/academic-records/reports/drafts/:id/download/pdf"',
]) assert.ok(academicRecordsApi.includes(operation), "Academic report backend lifecycle missing: " + operation);
for (const operation of [
  '"/api/academic-records/reports/drafts"',
  '"/api/academic-records/reports/drafts/"+row.id+"/review"',
  '"/api/academic-records/reports/drafts/"+row.id+"/download/pdf"',
  'Approve report',
  'Reject report',
  'Review note',
  'Download approved PDF',
]) assert.ok(reportReview.includes(operation), "Android academic report review operation missing: " + operation);
assert.ok(managerMore.includes('permissions?.["reports.view"]') && managerMore.includes('permissions?.["reports.create"]') && managerMore.includes("/(manager)/academic-reports"), "Manager academic report workspace is not gated by reports.view or reports.create");
assert.ok(adminEntry.includes("/(admin)/academic-reports"), "Owner academic report review entry is missing");
assert.ok(managerLayout.includes('name="academic-reports"') && adminLayout.includes('name="academic-reports"'), "Academic report review routes are not registered");


const managerPermissionsApi = read("artifacts/api-server/src/routes/managerPermissions.ts");
for (const operation of [
  'router.get("/:userId"',
  'router.put("/:userId"',
  'router.get("/:userId/history"',
  'router.patch("/:userId/role"',
]) assert.ok(managerPermissionsApi.includes(operation), "Owner manager permission API lifecycle missing: " + operation);
for (const operation of [
  '"/api/manager-permissions/"+id',
  '"/api/manager-permissions/"+id+"/role"',
  '"/api/manager-permissions/"+id+"/history"',
  'Save individual grants',
  'View change history',
  'p.seniorOnly===true&&role==="junior_manager"',
]) assert.ok(permissionMobile.includes(operation), "Android Owner permission editor operation missing: " + operation);
assert.ok(adminUsers.includes("Manager roles & individual permissions") && adminUsers.includes("/(admin)/manager-permissions"), "Owner Users screen does not expose the Android permission editor");
assert.ok(adminLayout.includes('name="manager-permissions"'), "Android Owner permission editor route is not registered");


const paymentApi = read("artifacts/api-server/src/routes/payments.ts");
for (const operation of [
  'router.get("/payments/manual-reports/history"',
  'router.get("/payments/manual-reports"',
  'router.post("/payments/manual-reports/:reportId/reject"',
  'router.post("/payments/:id/manual-settlement"',
]) assert.ok(paymentApi.includes(operation), "Owner manual payment report API lifecycle missing: " + operation);
for (const operation of [
  '"/api/payments/manual-reports"',
  '"/api/payments/"+paymentId+"/manual-settlement"',
  '"/api/payments/manual-reports/"+report.report_id+"/reject"',
  '"/api/payments/manual-reports/history"',
  'Manual payment report history',
  'Unverified learner payment reports',
  'Verify & settle',
  'Reject report',
  'canReviewManualPayments ? request("/api/payments/manual-reports") : Promise.resolve([])',
]) assert.ok(ownerTools.includes(operation), "Android Owner manual payment report operation missing: " + operation);
assert.ok(adminSettings.includes('"/api/payments/manual-reports/history"') && adminSettings.includes("Manual payment report history"), "Owner web payment report history screen is missing");


for (const operation of [
  'router.get("/qualifications/pending"',
  'router.get("/qualifications/:id/document"',
  'router.get("/qualifications/:id/review-history"',
  'router.patch("/qualifications/:id/verify"',
]) assert.ok(usersApi.includes(operation), "Qualification review API lifecycle missing: " + operation);
for (const operation of [
  '"/api/users/" + selectedId + "/teacher-documents/" + qualification.document_id',
  '"/api/qualifications/" + qualificationId + "/review-history"',
  '"/api/qualifications/" + qualification.id + "/verify"',
  'Verify qualification',
  'Reject qualification',
]) assert.ok(mobileReview.includes(operation), "Android teacher qualification review operation missing: " + operation);


assert.ok(qualificationReview.includes('"/api/qualifications/pending"') && qualificationReview.includes('"/api/qualifications/"+row.document_id+"/document"') && qualificationReview.includes('"/api/qualifications/"+row.id+"/review-history"') && qualificationReview.includes('"/api/qualifications/"+row.id+"/verify"'), "Android standalone qualification review lifecycle is incomplete");
assert.ok(managerMore.includes('permissions?.["qualifications.view"]') && managerMore.includes("/(manager)/qualifications"), "Manager qualification review entry is not gated by qualifications.view");
assert.ok(adminEntry.includes("/(admin)/qualifications"), "Owner qualification review entry is missing");
assert.ok(managerLayout.includes('name="qualifications"') && adminLayout.includes('name="qualifications"'), "Qualification review routes are not registered");


const achievementApi = read("artifacts/api-server/src/routes/achievements.ts");
assert.ok(achievementApi.includes('router.post("/award/recommendations"') && achievementApi.includes('router.get("/award/recommendations"') && achievementApi.includes('router.post("/award/recommendations/:id/review"'), "Achievement recommendation submit/list/review API is missing");
assert.ok(achievementReview.includes('"/api/achievements/award/recommendations"') && achievementReview.includes('"/api/achievements/award/recommendations/"+row.id+"/review"') && achievementReview.includes('"/api/achievements/award/recommendations","POST"') && achievementReview.includes("Submit recommendation") && achievementReview.includes("Choose learner") && achievementReview.includes("Choose achievement") && achievementReview.includes("Approve & award") && achievementReview.includes("Reject"), "Android Manager achievement recommendation submit/list/approve/reject lifecycle is incomplete");
assert.ok(achievementReview.includes('authority.permissions?.["achievements.recommend"]===true'), "Android Manager achievement recommendation submission must require achievements.recommend");
assert.ok(managerMore.includes('permissions?.["achievements.view"]') && managerMore.includes("/(manager)/achievement-recommendations"), "Manager achievement review entry is not gated by achievements.view");
assert.ok(managerLayout.includes('name="achievement-recommendations"'), "Manager achievement review route is not registered");

console.log("Role workflow parity static regression checks passed.");
