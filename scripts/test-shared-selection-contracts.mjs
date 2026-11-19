import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = path => readFileSync(resolve(root, path), "utf8");
const api = read("artifacts/api-server/src/routes/users.ts");
const schema = read("artifacts/api-server/src/lib/ensureProfileHubSchema.ts");
const webUser = read("artifacts/dallyletter/src/components/selection/UserSelector.tsx");
const mobileUser = read("artifacts/dallyletter-mobile/components/selection/UserSelector.tsx");
const webSubject = read("artifacts/dallyletter/src/components/selection/SubjectSelector.tsx");
const mobileSubject = read("artifacts/dallyletter-mobile/components/selection/SubjectSelector.tsx");

assert.match(api, /router\.get\("\/users\/selection-directory", requireAuth/);
assert.match(api, /new Set\(\["all", "everyone", "teachers", "prefects", "learners", "managers", "both"\]\)/);
assert.match(api, /canViewManagerTarget\(actor/);
assert.ok(api.indexOf('router.get("/users/selection-directory"') < api.indexOf('router.get("/users/:id"'), "Static user-directory route must precede the dynamic user-id route");
assert.match(api, /avatar_url/);
assert.match(api, /router\.get\("\/subjects\/catalog", requireAuth/);
for (const source of ["lessons", "classes", "assignments", "polls", "study_groups", "learner_subjects", "teacher_subjects"]) {
  assert.match(api, new RegExp("FROM " + source + "|FROM " + source + " CROSS JOIN", "i"), "Subject catalogue must include " + source);
}
assert.match(api, /interaction_count DESC/);
assert.match(api, /last_interacted_at DESC/);
for (const activity of ["attendance", "assignment_submissions", "poll_submissions", "study_group_members"]) assert.match(api, new RegExp("FROM " + activity + "|JOIN " + activity, "i"), "Personal subject ranking must include " + activity);
assert.match(api, /router\.post\("\/subjects\/catalog", requireAuth/);
assert.match(api, /canAddSystemSubject\(actor\)/);
assert.match(api, /router\.post\("\/subjects\/catalog\/interaction", requireAuth/);
assert.match(api, /req\.currentUser!\.id, normalized, subject/);
assert.match(schema, /CREATE TABLE IF NOT EXISTS dallyletter_subject_catalog/);
assert.match(schema, /CREATE TABLE IF NOT EXISTS dallyletter_subject_interactions/);

for (const source of [webUser, mobileUser]) {
  assert.match(source, /selection-directory/);
  assert.match(source, /teachers/);
  assert.match(source, /prefects/);
  assert.match(source, /learners/);
  assert.match(source, /managers/);
  assert.match(source, /everyone/);
  assert.match(source, /UserProfileLink/);
}
for (const source of [webSubject, mobileSubject]) {
  assert.match(source, /subjects\/catalog/);
  assert.match(source, /subjects\/catalog\/interaction/);
  assert.match(source, /onBlur/);
  assert.match(source, /onSelect/);
  assert.doesNotMatch(source, /onBlur[^\\n]*canAdd[^\\n]*add\\(/, "Shared subject creation must require an explicit Add action");
}

const webUserIntegrations = [
  "artifacts/dallyletter/src/pages/admin/AdminNotifications.tsx",
  "artifacts/dallyletter/src/pages/admin/AdminAchievements.tsx",
  "artifacts/dallyletter/src/pages/admin/AdminPayments.tsx",
  "artifacts/dallyletter/src/pages/ProfileHub.tsx",
  "artifacts/dallyletter/src/pages/manager/ManagerReportReview.tsx",
  "artifacts/dallyletter/src/components/RecordBookWorkspace.tsx",
  "artifacts/dallyletter/src/pages/student/PrefectPanel.tsx",
  "artifacts/dallyletter/src/pages/student/StudentLessons.tsx",
];
for (const path of webUserIntegrations) assert.match(read(path), /UserSelector/, path + " must use shared user selector");

const webSubjectIntegrations = [
  "artifacts/dallyletter/src/pages/teacher/TeacherLessons.tsx",
  "artifacts/dallyletter/src/pages/teacher/TeacherClasses.tsx",
  "artifacts/dallyletter/src/pages/teacher/TeacherAssignments.tsx",
  "artifacts/dallyletter/src/pages/admin/AdminAssignments.tsx",
  "artifacts/dallyletter/src/pages/teacher/TeacherPolls.tsx",
  "artifacts/dallyletter/src/pages/admin/AdminPolls.tsx",
  "artifacts/dallyletter/src/pages/student/StudentStudyGroups.tsx",
  "artifacts/dallyletter/src/pages/Register.tsx",
  "artifacts/dallyletter/src/pages/ProfileHub.tsx",
  "artifacts/dallyletter/src/pages/student/StudentLessons.tsx",
];
for (const path of webSubjectIntegrations) assert.match(read(path), /SubjectSelector/, path + " must use shared subject selector");

for (const path of [
  "artifacts/dallyletter-mobile/components/FeatureHub.tsx",
  "artifacts/dallyletter-mobile/components/AcademicReportReviewWorkspace.tsx",
]) assert.match(read(path), /UserSelector/, path + " must use shared mobile user selector");
for (const path of [
  "artifacts/dallyletter-mobile/app/(teacher)/lessons.tsx",
  "artifacts/dallyletter-mobile/app/(teacher)/classes.tsx",
  "artifacts/dallyletter-mobile/components/FeatureHub.tsx",
  "artifacts/dallyletter-mobile/app/profile-hub.tsx",
]) assert.match(read(path), /SubjectSelector/, path + " must use shared mobile subject selector");

console.log("Shared user/subject selection contracts passed.");
