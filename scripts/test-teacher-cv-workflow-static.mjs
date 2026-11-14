import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const auth = read("artifacts/api-server/src/routes/auth.ts");
const googleButton = read("artifacts/dallyletter/src/components/GoogleSignInButton.tsx");
const login = read("artifacts/dallyletter/src/pages/Login.tsx");
const register = read("artifacts/dallyletter/src/pages/Register.tsx");
const workspaceApi = read("artifacts/api-server/src/routes/teacherCvWorkspace.ts");
const workspaceUi = read("artifacts/dallyletter/src/pages/TeacherCvWorkspace.tsx");
const ownerDashboard = read("artifacts/dallyletter/src/pages/admin/OwnerCommandCenter.tsx");
const appRoutes = read("artifacts/dallyletter/src/App.tsx");
const managerPermissions = read("artifacts/api-server/src/routes/managerPermissions.ts");
const managerPolicy = read("artifacts/api-server/src/lib/manager-permission-policy.ts");
const mobileReviewUi = read("artifacts/dallyletter-mobile/components/TeacherCvReviewWorkspace.tsx");
const roleAccess = read("artifacts/api-server/src/lib/role-access.ts");
const expiry = read("artifacts/api-server/src/lib/teacher-cv-expiry.ts");
const authContext = read("artifacts/dallyletter/src/contexts/AuthContext.tsx");
const mobileAuthContext = read("artifacts/dallyletter-mobile/contexts/AuthContext.tsx");

assert.match(auth, /router\.post\("\/auth\/google"/, "Google Identity Services endpoint must be registered");
assert.match(auth, /verifyGoogleIdToken\(credential, clientId\)/, "API must verify the Google ID token against the configured OAuth client");
assert.match(auth, /email_verified/, "Google sign-in must require a verified email address");
assert.match(googleButton, /VITE_GOOGLE_CLIENT_ID/, "Web Google sign-in must use the existing Vite OAuth client ID");
assert.match(googleButton, /\/api\/auth\/google/, "Web Google sign-in must exchange its credential with the LMS API");
assert.match(login, /<GoogleSignInButton\s*\/>/, "Login page must render Google sign-in");
assert.match(register, /<GoogleSignInButton mode="signup"\s*\/>/, "Registration page must render Google sign-up");

assert.match(workspaceApi, /requireManagerPermissionForRequest\(\(req\)=>req\.body\?\.action==="approve"\?"teacher_cv\.authorize":"teacher_cv\.review"\)/, "Approval and rejection must use separate explicit manager permissions");
assert.match(managerPermissions, /teacher_cv\.authorize.*seniorOnly: true/, "Teacher authorization must remain a Senior Manager/Owner-only permission");
assert.match(managerPermissions, /teacher_cv\.review.*seniorOnly: true/, "Teacher application review must remain a Senior Manager/Owner-only permission");
assert.match(workspaceApi, /role='teacher',teacher_application_status='approved',teacher_review_deadline=NULL/, "Approval must explicitly retain the teacher role and activate the application");
assert.match(workspaceApi, /teacherApplicationStatus:action==="approve"\?"approved":"rejected_pending_conversion"/, "Decision response must report the effective application state");
assert.match(workspaceApi, /dashboardPath:action==="approve"\?"\/teacher":"\/profile-hub"/, "Approval notification response must route the teacher to the teacher dashboard");
assert.match(workspaceApi, /teacher_application_status='rejected_pending_conversion'.*teacher_review_deadline=now\(\)/, "Rejection must immediately restrict teaching and schedule learner conversion");
assert.match(workspaceApi, /teacher_profiles/, "Reviewer detail endpoint must retrieve the applicant's saved CV and survey profile");
assert.match(workspaceApi, /surveySubmittedAt/, "Reviewer queue must include independent readiness survey submissions");
assert.match(workspaceUi, /Teacher's professional CV preview/, "Reviewer UI must render the applicant's professional CV");
assert.match(workspaceUi, /Readiness survey/, "Reviewer UI must render the applicant's readiness survey");
assert.match(workspaceUi, /Approve & Activate Full Teacher Access/, "Reviewer UI must expose the teacher activation action");
assert.match(workspaceUi, /Reject application \(grace period applies\)/, "Reviewer UI must expose rejection with the existing conversion grace period");
assert.match(workspaceUi, /canAuthorize/, "Reviewer UI must gate activation on the explicit authorization grant");
assert.match(ownerDashboard, /Open full CV & survey/, "Owner dashboard must link directly to the applicant's CV and survey");
assert.match(appRoutes, /\/admin\/teacher-cv-workspace/, "Owner CV workspace route must be registered");
assert.match(appRoutes, /\/manager\/teacher-cv-workspace/, "Manager CV workspace route must be registered");

assert.match(roleAccess, /isTeacherRestricted/, "Pending and rejected applicants must remain restricted from teacher operations");
assert.match(expiry, /SET role='student',teacher_application_status='auto_converted'/, "Expired or rejected applications must convert to the learner role");
assert.match(authContext, /refetchInterval: 15_000/, "Web sessions must refresh role/application state promptly after Owner approval");
assert.match(mobileAuthContext, /}, 15_000\);/, "Mobile sessions must refresh role/application state promptly after Owner approval");

console.log("TEACHER_CV_WORKFLOW_STATIC: PASS — Google sign-in wiring, CV/survey review, explicit manager authorization, teacher activation, rejection grace period, learner conversion, routes and session refresh.");
