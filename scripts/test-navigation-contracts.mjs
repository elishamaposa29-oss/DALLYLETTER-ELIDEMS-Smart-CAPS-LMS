import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const webRoutes = read("../artifacts/dallyletter/src/App.tsx");
const ownerCenter = read("../artifacts/dallyletter/src/pages/admin/OwnerCommandCenter.tsx");
const webCv = read("../artifacts/dallyletter/src/pages/TeacherCvWorkspace.tsx");
const mobileManagerRoute = read("../artifacts/dallyletter-mobile/app/(manager)/teacher-cv-workspace.tsx").trim();
const mobileOwnerRoute = read("../artifacts/dallyletter-mobile/app/(admin)/teacher-cv-workspace.tsx").trim();
const mobileCv = read("../artifacts/dallyletter-mobile/components/TeacherCvReviewWorkspace.tsx");

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
assert.ok(webCv.includes('new URLSearchParams(window.location.search).get("teacherId")') && webCv.includes("[canChat]"), "Web deep links must reopen applicant details after reviewer permissions resolve");

console.log("Navigation contracts passed: legacy study-group path, owner event destinations, shared Android CV workspace and permission-aware CV deep links.");
