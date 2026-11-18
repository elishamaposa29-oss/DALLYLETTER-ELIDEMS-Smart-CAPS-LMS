import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const auth = read("artifacts/api-server/src/routes/auth.ts");
const googleButton = read("artifacts/dallyletter/src/components/GoogleSignInButton.tsx");
const login = read("artifacts/dallyletter/src/pages/Login.tsx");
const register = read("artifacts/dallyletter/src/pages/Register.tsx");
const workspaceApi = read("artifacts/api-server/src/routes/teacherCvWorkspace.ts");
const emailNotificationQueue = read("artifacts/api-server/src/lib/email-notification-queue.ts");
const managerQualifications = read("artifacts/dallyletter/src/pages/manager/ManagerQualifications.tsx");
const dashboardLayout = read("artifacts/dallyletter/src/components/DashboardLayout.tsx");
const appRoutesSource = read("artifacts/dallyletter/src/App.tsx");
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
const teacherQualifications = read("artifacts/dallyletter/src/pages/TeacherQualifications.tsx");
const attendanceCalendar = read("artifacts/dallyletter/src/components/DailyAppAttendanceCard.tsx");
const apiApp = read("artifacts/api-server/src/app.ts");
const profileHub = read("artifacts/dallyletter/src/pages/ProfileHub.tsx");
const usersRoutes = read("artifacts/api-server/src/routes/users.ts");
const globalToast = read("artifacts/dallyletter/src/components/ui/toast.tsx");
const globalToaster = read("artifacts/dallyletter/src/components/ui/toaster.tsx");
const mobileFeedback = read("artifacts/dallyletter-mobile/components/FeedbackMessage.tsx");
const mobileStudentWork = read("artifacts/dallyletter-mobile/app/(student)/work.tsx");
const mobileTeacherWork = read("artifacts/dallyletter-mobile/app/(teacher)/work.tsx");
const mobileStudentChat = read("artifacts/dallyletter-mobile/app/(student)/chat.tsx");
const mobileTeacherChat = read("artifacts/dallyletter-mobile/app/(teacher)/chat.tsx");
const mobileAuthLogin = read("artifacts/dallyletter-mobile/app/login.tsx");
const mobileAuthSignup = read("artifacts/dallyletter-mobile/app/signup.tsx");
const mobileAuthForgot = read("artifacts/dallyletter-mobile/app/forgot-password.tsx");
const mobileAuthReset = read("artifacts/dallyletter-mobile/app/reset-password.tsx");
const mobileTeacherReports = read("artifacts/dallyletter-mobile/app/(teacher)/reports.tsx");
const mobileAdminTools = read("artifacts/dallyletter-mobile/app/(admin)/tools.tsx");
const mobileManagerPermissions = read("artifacts/dallyletter-mobile/components/ManagerPermissionControlsMobile.tsx");
const mobileTransferReview = read("artifacts/dallyletter-mobile/components/TransferRequestReviewWorkspace.tsx");
const mobileQualificationReview = read("artifacts/dallyletter-mobile/components/QualificationReviewWorkspaceMobile.tsx");
const mobileAcademicReports = read("artifacts/dallyletter-mobile/components/AcademicReportReviewWorkspace.tsx");
const mobileOperations = read("artifacts/dallyletter-mobile/components/MobileOperationsWorkspace.tsx");
const mobileManagerDashboard = read("artifacts/dallyletter-mobile/components/ManagerDashboard.tsx");
const globalStyles = read("artifacts/dallyletter/src/index.css");

const renderBlueprint = read("render.yaml");

assert.match(auth, /router\.post\("\/auth\/google"/, "Google Identity Services endpoint must be registered");
assert.match(auth, /verifyGoogleIdToken\(credential, clientId\)/, "API must verify the Google ID token against the configured OAuth client");
assert.match(auth, /email_verified/, "Google sign-in must require a verified email address");
assert.match(googleButton, /VITE_GOOGLE_CLIENT_ID/, "Web Google sign-in must use the existing Vite OAuth client ID");
assert.match(googleButton, /\/api\/auth\/google/, "Web Google sign-in must exchange its credential with the LMS API");
assert.match(login, /<GoogleSignInButton\s*\/>/, "Login page must render Google sign-in");
assert.match(register, /<GoogleSignInButton mode="signup"\s*\/>/, "Registration page must render Google sign-up");
assert.ok(apiApp.includes("elishamaposa29-oss-dallyletter-elid(?:-[a-z0-9-]+)?"), "CORS must trust the exact account-scoped Dallyletter Vercel production and preview hostname pattern");
assert.match(profileHub, /Open CV & readiness survey/, "Pending teachers must have a direct, clickable path to their CV and readiness survey workspace");
assert.match(profileHub, /optional supporting evidence; missing items do not block submission/, "Profile Hub must not incorrectly describe optional CV documents as mandatory");
const productionRenderService = renderBlueprint.split("name: DALLYLETTER-ELIDEMS-Smart-CAPS-LMS-4")[1] || "";
assert.match(productionRenderService, /key: GOOGLE_CLIENT_ID/, "Production LMS API service must declare the existing Google OAuth client ID environment variable");

assert.match(workspaceUi, /Staff verification workspace/, "CV and qualification review must share one staff verification workspace");
assert.doesNotMatch(dashboardLayout, /label: "Teacher CV Applications"|label: "Qualification Verification"/, "Dashboard navigation must not expose duplicate CV and qualification destinations");
assert.match(teacherQualifications, /api\/users\/me\/qualifications/, "Teacher self-service qualification records must remain available in the unified CV editor");
assert.match(teacherQualifications, /api\/users\/me\/teacher-cv/, "Teacher self-service CV and readiness survey must remain available in the same editor");
assert.match(workspaceUi, /Qualifications & certificates/, "The consolidated workspace must expose the full qualification verification queue");
assert.match(managerQualifications, /export function ManagerQualificationsPanel/, "Existing qualification verification must remain available as an embedded panel");
assert.match(dashboardLayout, /Staff Verification & Qualifications/, "Staff navigation must expose one consolidated verification destination");
assert.match(appRoutesSource, /<TeacherCvWorkspace initialTab="qualifications" \/>/, "Legacy qualification route must remain as a compatibility alias");
assert.match(workspaceApi, /requireManagerPermissionForRequest\(\(req\)=>req\.body\?\.action==="approve"\?"teacher_cv\.authorize":"teacher_cv\.review"\)/, "Approval and rejection must use separate explicit manager permissions");
assert.match(managerPermissions, /teacher_cv\.authorize.*seniorOnly: true/, "Teacher authorization must remain a Senior Manager/Owner-only permission");
assert.match(managerPermissions, /teacher_cv\.review.*seniorOnly: true/, "Teacher application review must remain a Senior Manager/Owner-only permission");
assert.match(workspaceApi, /role='teacher',teacher_application_status='approved',teacher_review_deadline=NULL/, "Approval must explicitly retain the teacher role and activate the application");
assert.match(workspaceApi, /teacherApplicationStatus:hasCvSubmission\?\(action==="approve"\?"approved":"rejected_pending_conversion"\)/, "CV decisions must activate or reject the teacher application only when a CV was submitted");
assert.match(workspaceApi, /dashboardPath:hasCvSubmission&&action==="approve"\?"\/teacher":"\/profile-hub"/, "Only an approved CV application may route to the full teacher dashboard");
assert.match(workspaceApi, /teacher_application_status='rejected_pending_conversion'.*teacher_review_deadline=now\(\)/, "Rejection must immediately restrict teaching and schedule learner conversion");
assert.match(workspaceApi, /teacher_profiles/, "Reviewer detail endpoint must retrieve the applicant's saved CV and survey profile");
assert.match(workspaceApi, /surveySubmittedAt/, "Reviewer queue must include independent readiness survey submissions");
assert.match(workspaceUi, /Applicant ID:/, "Web reviewer UI must visibly bind the CV and survey to the applicant user ID");
assert.match(mobileReviewUi, /Applicant ID:/, "Mobile reviewer UI must visibly bind the CV and survey to the applicant user ID");
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
assert.match(authContext, /restrictedTeacher \? 15_000 : 60_000/, "Web sessions must poll pending teacher applications promptly without increasing normal-user API traffic");
assert.match(mobileAuthContext, /isPendingTeacher \? 15_000 : 60_000/, "Mobile sessions must poll pending teacher applications promptly without increasing normal-user API traffic");


assert.match(workspaceApi, /Attachments, qualifications, and profile completeness are optional/, "CV evidence must not block formal submission");
assert.doesNotMatch(workspaceApi, /Resolve the specific items below, save your draft, then submit again/, "CV submit must not retain mandatory document-completeness rejection");
assert.doesNotMatch(workspaceApi, /Complete personal\/legal details, upload a profile photo and PDF resume/, "CV approval must not require optional evidence");
assert.match(workspaceApi, /router\.delete\("\/:teacherId\/cv"/, "Teacher and authorized reviewer must have an individual CV delete endpoint");
assert.match(workspaceApi, /router\.delete\("\/:teacherId\/survey"/, "Authorized reviewer must have an individual survey delete endpoint");
assert.ok(workspaceApi.includes('router.delete("/:teacherId/application"'), "Teacher must have one atomic full-application deletion endpoint");
assert.ok(roleAccess.includes('"/teacher-cv-workspace/" + selfId + "/application"'), "Pending teachers must be allowed to delete their own complete application");
assert.ok(workspaceApi.includes("DELETE FROM teacher_cv_chat_messages WHERE teacher_id=$1"), "Full application deletion must remove all private application chat messages");
assert.ok(workspaceApi.includes("DELETE FROM teacher_profiles WHERE user_id=$1"), "Full application deletion must remove saved CV and survey drafts");
assert.ok(workspaceApi.includes("removeStoredMedia(String(row.storage_key))") && workspaceApi.includes("teacher_application_media_cleanup"), "Full application deletion must clean external and chunked media storage");
assert.ok(emailNotificationQueue.includes("related_entity_type") && emailNotificationQueue.includes("related_entity_id") && workspaceApi.includes("related_entity_type='teacher_cv_application' AND related_entity_id=$2"), "Chat email copies must be tagged and deleted by application identity without touching other applications");

assert.ok(teacherQualifications.includes("Delete my entire survey / CV / application") && teacherQualifications.includes("deleteOwnApplication"), "Teacher self-service must expose one complete application deletion action");

assert.match(workspaceApi, /router\.delete\("\/bulk\/:scope"/, "Authorized reviewers must have a bulk delete endpoint");
assert.match(workspaceUi, /Delete entire CV/, "Reviewer workspace must expose individual CV deletion");
assert.match(workspaceUi, /Delete survey only/, "Reviewer workspace must expose individual survey deletion");
assert.match(workspaceUi, /Delete selected CVs/, "Reviewer workspace must expose selected bulk CV deletion");
assert.match(workspaceUi, /Approved/, "Reviewer workspace must support approved status filtering");
assert.match(teacherQualifications, /Delete my entire survey \/ CV \/ application/, "Teacher must be able to delete their complete application while retaining their account");
assert.match(workspaceUi, /main CV Approve \/ Reject controls below also apply the same decision/, "CV decision controls must also decide the submitted survey");
assert.match(attendanceCalendar, /bg-emerald-300 text-emerald-950 border-emerald-500 dark:bg-emerald-800 dark:text-white dark:border-emerald-500/, "Present legend swatch must match the actual calendar cell colours");
assert.match(attendanceCalendar, /bg-red-300 text-red-950 border-red-500 dark:bg-red-800 dark:text-white dark:border-red-500/, "Absent legend swatch must match the actual calendar cell colours");
console.log("TEACHER_CV_WORKFLOW_STATIC: PASS — Google sign-in wiring, CV/survey review, explicit manager authorization, teacher activation, rejection grace period, learner conversion, routes and session refresh.");


assert.ok(usersRoutes.includes('router.delete("/users/me/teacher-documents/:docId"'), "Teachers must have an authenticated self-scoped endpoint to permanently delete uploaded CV documents");
assert.ok(usersRoutes.includes('router.delete("/users/me/qualifications/:id"'), "Teachers must have an authenticated self-scoped endpoint to permanently delete their own qualifications");
assert.ok(usersRoutes.includes("DELETE FROM teacher_documents WHERE id=$1 AND user_id=$2"), "Individual uploaded-file deletion must remove the stored document row and bytes");
assert.ok(profileHub.includes("deleteOwnProfileDocument"), "Profile Hub must expose self-service delete actions beside uploaded documents");
assert.ok(profileHub.includes("deleteOwnQualification"), "Profile Hub must expose self-service delete actions beside teacher-owned qualifications");
assert.ok(profileHub.includes("Permanently delete uploaded document"), "Uploaded document deletion must be clearly identified as permanent");

assert.match(attendanceCalendar, /const isExpectedSchoolDay = isFuture && !isWeekend && !holidayName/, "future ordinary weekdays must be predicted as expected school days");
assert.match(attendanceCalendar, /holidayName\s*\n\s*\? "bg-violet-100/, "known public holidays must be violet before they arrive");
assert.ok(attendanceCalendar.includes(': isExpectedSchoolDay\n                    ? "bg-[#0f2a5a]/[0.08]'), "predicted ordinary school days must use the light transparent Dallyletter navy treatment");
assert.ok(attendanceCalendar.includes(': isWeekend\n                      ? "bg-violet-50'), "unrecorded weekends must retain the purple weekend treatment");
assert.ok(attendanceCalendar.includes(': isPastUnrecorded\n                        ? "bg-orange-50'), "past dates without saved records must use the light orange treatment");
assert.ok(attendanceCalendar.includes('${isWeekend ? "border-dashed border-violet-300 dark:border-violet-700" : ""}'), "weekend dates must use purple dashed outlines");
assert.match(attendanceCalendar, /border-2 border-\[#0f2a5a\]/, "today must retain a navy border");
assert.doesNotMatch(attendanceCalendar, /bg-orange-100|bg-slate-50|Past day not marked \(orange\)|Upcoming \/ today not yet marked \(grey\)/, "calendar must not use orange or grey blank-day fills or legends");

assert.ok(workspaceApi.includes('router.delete("/:teacherId/documents/:docId"'), "Teacher self-service and authorized CV reviewers must be able to delete one separate uploaded file");
assert.ok(workspaceApi.includes("document_deleted"), "Individual file deletion must leave a reviewer audit record");
assert.ok(workspaceUi.includes("Delete this separate uploaded file") && workspaceUi.includes("deleteDocument"), "Reviewer workspace must expose per-file deletion beside each uploaded document");
assert.ok(profileHub.includes("navigator.credentials") && profileHub.includes('otp:{transport:["sms"]}'), "Phone OTP paste action must support browser SMS OTP autofill where available");
assert.ok(profileHub.includes("navigator.clipboard.readText") && profileHub.includes("Email apps do not expose their inbox OTPs"), "OTP paste action must use clipboard and clearly explain email autofill limitations");
assert.ok(profileHub.includes("Verification code window:") && profileHub.includes("startOtpCountdown"), "OTP request must show a countdown until the code is entered or expires");
assert.ok(profileHub.includes("border-red-300 bg-red-50") && profileHub.includes("border-emerald-300 bg-emerald-50"), "Profile Hub feedback must distinguish failure in red and success in green");
assert.ok(usersRoutes.includes("delivery.sent!==1||delivery.failed!==0"), "Notification email OTP must report success only after provider acceptance");


assert.match(globalToast, /success: "border border-emerald-300 bg-emerald-50/, "Global success feedback must use an accessible green treatment");
assert.match(globalToast, /destructive:\s*"destructive group border-destructive bg-destructive text-destructive-foreground"/, "Global failure feedback must use the destructive red treatment");
assert.match(globalToast, /warning: "border border-amber-300 bg-amber-50/, "Global warning feedback must be visually distinct from success and failure");
assert.match(globalToast, /defaultVariants:\s*\{\s*variant: "success"/, "Unqualified successful action toasts must use the global success treatment");
assert.match(globalToaster, /props\.variant === "destructive" \? 9000/, "Failure feedback must remain visible longer than routine success feedback");
assert.match(globalToaster, /duration=\{props\.variant === "destructive" \? 9000 : props\.variant === "warning" \? 7000 : 5000\}/, "Global feedback must have bounded severity-aware auto-dismiss timers");

assert.match(mobileFeedback, /const palette: Record<FeedbackTone/, "Mobile feedback must share a single semantic color system");
assert.match(mobileFeedback, /resolvedTone === "error" \? 10000 : resolvedTone === "warning" \? 8000 : 6000/, "Mobile feedback must auto-dismiss by severity with longer failure visibility");
assert.match(mobileFeedback, /secondsLeft\}s · Dismiss/, "Mobile feedback must show its visible countdown and dismiss affordance");
for (const [screen, source] of [["student work", mobileStudentWork], ["teacher work", mobileTeacherWork], ["student chat", mobileStudentChat], ["teacher chat", mobileTeacherChat]]) assert.match(source, /<FeedbackMessage message=\{notice\}/, `${screen} must use the shared mobile feedback treatment`);

assert.match(globalStyles, /\[role="alert"\]:not\(\[data-feedback="unstyled"\]\)/, "All web inline alert surfaces must receive the shared failure treatment unless explicitly opted out");

for (const [screen, source] of [["login",mobileAuthLogin],["signup",mobileAuthSignup],["forgot password",mobileAuthForgot],["reset password",mobileAuthReset],["teacher reports",mobileTeacherReports],["admin tools",mobileAdminTools],["manager permissions",mobileManagerPermissions],["transfer review",mobileTransferReview],["qualification review",mobileQualificationReview],["academic report review",mobileAcademicReports],["operations workspace",mobileOperations],["manager dashboard",mobileManagerDashboard]]) assert.match(source, /<FeedbackMessage message=\{error\}/, `${screen} must use shared red error feedback with a dismiss action`);
