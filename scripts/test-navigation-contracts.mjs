import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const webRoutes = read("../artifacts/dallyletter/src/App.tsx");
const vercelConfig = JSON.parse(read("../vercel.json"));
const ownerCenter = read("../artifacts/dallyletter/src/pages/admin/OwnerCommandCenter.tsx");
const webCv = read("../artifacts/dallyletter/src/pages/TeacherCvWorkspace.tsx");
const mobileManagerRoute = read("../artifacts/dallyletter-mobile/app/(manager)/teacher-cv-workspace.tsx").trim();
const mobileOwnerRoute = read("../artifacts/dallyletter-mobile/app/(admin)/teacher-cv-workspace.tsx").trim();
const mobileCv = read("../artifacts/dallyletter-mobile/components/TeacherCvReviewWorkspace.tsx");

const roleShellRewrites = vercelConfig.rewrites.filter((item) => /^(student|teacher|manager|admin)$/.test(item.source.split("/")[1] || "") && item.destination === "/app.html");
for (const role of ["student", "teacher", "manager", "admin"]) {
  assert.ok(roleShellRewrites.some((item) => item.source === "/" + role + "/(.*)"), `Nested /${role}/* routes must rewrite to the React application shell; wildcard rewrites must be tested against deployed Vercel behavior.`);
}
assert.equal(vercelConfig.trailingSlash, true, "Protected role route rewrite tests must preserve the deployed trailing-slash contract");

for (const route of [
  'path="/student/study-groups"',
  'path="/student/groups"',
  'path="/manager/teacher-cv-workspace"',
  'path="/admin/teacher-cv-workspace"',
]) {
  assert.ok(webRoutes.includes(route), `Missing registered navigation route: ${route}`);
}

for (const [label, destination] of [
  ["group events", "`/student/study-groups?group=${id}`"],
  ["message events", 'message: "/admin/chat"'],
  ["assignment events", 'assignment: "/admin/assignments"'],
  ["class events", 'class: "/admin/classes"'],
  ["poll events", '`/admin/polls?poll=${id}`'],
]) {
  assert.ok(ownerCenter.includes(destination), `Owner Command Center ${label} point to the correct role-accessible destination`);
}

const sharedMobileRoute = 'export { default } from "@/components/TeacherCvReviewWorkspace";';
assert.equal(mobileManagerRoute, sharedMobileRoute, "Manager Android route must use the shared CV review workspace");
assert.equal(mobileOwnerRoute, sharedMobileRoute, "Owner Android route must use the shared CV review workspace");
assert.ok(mobileCv.includes('canChat ? api("/" + id + "/chat") : Promise.resolve([])'), "Opening an application must not fail when the reviewer has no chat grant");
assert.ok(mobileCv.includes("if (!selectedId || !canChat)"), "Mobile chat synchronization must respect the live chat grant");
assert.ok(mobileCv.includes('getApiUrl("/api/users/" + selectedId + "/teacher-cv/pdf")'), "Android reviewers must retain the professional CV PDF export available on web");
assert.ok(webCv.includes("/api/qualifications/") && webCv.includes("/review-history") && webCv.includes("View qualification review history"), "Web reviewers must retain the qualification review history available on Android");
assert.ok(webCv.includes('setCanViewQualificationHistory(Boolean(p["qualifications.view"]))') && webCv.includes('canViewQualificationHistory && <div className="mt-2"'), "Qualification review history must only be offered to reviewers with the backend-required view grant");
assert.ok(webCv.includes('new URLSearchParams(window.location.search).get("teacherId")') && webCv.includes("[canChat]"), "Web deep links must reopen applicant details after reviewer permissions resolve");
assert.ok(webRoutes.includes('path="/manager/teacher-cv-workspace"><ProtectedRoute allowedRoles={["owner","senior_manager","manager","junior_manager"]} allowManagerStaff>'), "Manager CV workspace must require a manager role or explicitly designated teacher-manager status");
assert.ok(webRoutes.includes('path="/admin/teacher-cv-workspace"><ProtectedRoute allowedRoles={["owner","admin"]}'), "Admin CV workspace must remain read-only while Owner review authority is preserved");
assert.ok(webCv.includes('else if(admin){p={};setCanReview(false);setCanAuthorize(false);setCanVerifyQualifications(false);setCanViewQualificationHistory(false);setCanChat(false);'), "Admin CV access must not imply approval, authorization, qualification verification, history viewing or chat grants");

console.log("Navigation contracts passed: legacy study-group path, owner event destinations, shared Android CV workspace and permission-aware CV deep links.");
