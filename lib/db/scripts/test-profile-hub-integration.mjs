import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";

const { Pool } = pg;
const base = (process.env.API_BASE_URL || "http://127.0.0.1:4000").replace(/\/$/, "");
const capturePath = process.env.MOCK_PROVIDER_CAPTURE || "/tmp/dallyletter-provider-capture.jsonl";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function request(path, { token, method = "GET", body, headers: extraHeaders = {} } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...extraHeaders,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data };
}

async function waitFor(fn, message, timeoutMs = 15000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const result = await fn();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error("Timed out: " + message);
}

try {
  // Keep the web and Android recovery entry points aligned with the same authenticated API.
  const webProfile = readFileSync(new URL("../../../artifacts/dallyletter/src/pages/ProfileHub.tsx", import.meta.url), "utf8");
  const androidProfile = readFileSync(new URL("../../../artifacts/dallyletter-mobile/components/ProfileDetailsEditor.tsx", import.meta.url), "utf8");
  const webForgot = readFileSync(new URL("../../../artifacts/dallyletter/src/pages/ForgotPassword.tsx", import.meta.url), "utf8");
  const androidForgot = readFileSync(new URL("../../../artifacts/dallyletter-mobile/app/forgot-password.tsx", import.meta.url), "utf8");
  const webUserLink = readFileSync(new URL("../../../artifacts/dallyletter/src/components/UserProfileLink.tsx", import.meta.url), "utf8");
  const mobileUserLink = readFileSync(new URL("../../../artifacts/dallyletter-mobile/components/UserProfileLink.tsx", import.meta.url), "utf8");
  const webRoutes = readFileSync(new URL("../../../artifacts/dallyletter/src/App.tsx", import.meta.url), "utf8");
  const mobileProfile = readFileSync(new URL("../../../artifacts/dallyletter-mobile/app/profile-hub.tsx", import.meta.url), "utf8");
  const mobileAvatarEditor = readFileSync(new URL("../../../artifacts/dallyletter-mobile/components/ProfileAvatarEditor.tsx", import.meta.url), "utf8");
  const mobileTeacherCvEditor = readFileSync(new URL("../../../artifacts/dallyletter-mobile/components/TeacherCvEditor.tsx", import.meta.url), "utf8");
  const mobileTeacherProfile = readFileSync(new URL("../../../artifacts/dallyletter-mobile/app/(teacher)/profile.tsx", import.meta.url), "utf8");
  const mobileAuth = readFileSync(new URL("../../../artifacts/dallyletter-mobile/contexts/AuthContext.tsx", import.meta.url), "utf8");
  const mobileLayout = readFileSync(new URL("../../../artifacts/dallyletter-mobile/app/_layout.tsx", import.meta.url), "utf8");
  const webAuth = readFileSync(new URL("../../../artifacts/dallyletter/src/contexts/AuthContext.tsx", import.meta.url), "utf8");
  const aiProviderHttp = readFileSync(new URL("../../../artifacts/api-server/src/lib/ai-provider-http.ts", import.meta.url), "utf8");
  const aiContentSafety = readFileSync(new URL("../../../artifacts/api-server/src/lib/ai-content-safety.ts", import.meta.url), "utf8");
  const lessonRoutes = readFileSync(new URL("../../../artifacts/api-server/src/routes/lessons.ts", import.meta.url), "utf8");
  const assignmentRoutes = readFileSync(new URL("../../../artifacts/api-server/src/routes/assignments.ts", import.meta.url), "utf8");
  const exerciseRoutes = readFileSync(new URL("../../../artifacts/api-server/src/routes/exercises.ts", import.meta.url), "utf8");
  const pollRoutes = readFileSync(new URL("../../../artifacts/api-server/src/routes/polls.ts", import.meta.url), "utf8");
  const aiRoutes = readFileSync(new URL("../../../artifacts/api-server/src/routes/ai.ts", import.meta.url), "utf8");
  const messageRoutes = readFileSync(new URL("../../../artifacts/api-server/src/routes/messages.ts", import.meta.url), "utf8");
  const managerPermissionRoutes = readFileSync(new URL("../../../artifacts/api-server/src/routes/managerPermissions.ts", import.meta.url), "utf8");
  const managerRoutes = readFileSync(new URL("../../../artifacts/api-server/src/routes/manager.ts", import.meta.url), "utf8");
  const managerPermissionPolicy = readFileSync(new URL("../../../artifacts/api-server/src/lib/manager-permission-policy.ts", import.meta.url), "utf8");
  const attendanceRoutes = readFileSync(new URL("../../../artifacts/api-server/src/routes/attendance.ts", import.meta.url), "utf8");
  const settingsRoutes = readFileSync(new URL("../../../artifacts/api-server/src/routes/settings.ts", import.meta.url), "utf8");
  const socialFeatureRoutes = readFileSync(new URL("../../../artifacts/api-server/src/routes/socialFeatures.ts", import.meta.url), "utf8");
  const managerPermissionUI = readFileSync(new URL("../../../artifacts/dallyletter/src/components/ManagerPermissionControls.tsx", import.meta.url), "utf8");
  const webProfileHubPage = readFileSync(new URL("../../../artifacts/dallyletter/src/pages/ProfileHub.tsx", import.meta.url), "utf8");
  const webStudentHome = readFileSync(new URL("../../../artifacts/dallyletter/src/pages/student/StudentHome.tsx", import.meta.url), "utf8");
  const mobileOfflineMedia = readFileSync(new URL("../../../artifacts/dallyletter-mobile/components/OfflineMediaDownload.tsx", import.meta.url), "utf8");
  const webElidemsAIChat = readFileSync(new URL("../../../artifacts/dallyletter/src/components/ElidemsAIChat.tsx", import.meta.url), "utf8");
  const userRoutes = readFileSync(new URL("../../../artifacts/api-server/src/routes/users.ts", import.meta.url), "utf8");
  const roleAccess = readFileSync(new URL("../../../artifacts/api-server/src/lib/role-access.ts", import.meta.url), "utf8");
  const protectedRoute = readFileSync(new URL("../../../artifacts/dallyletter/src/components/ProtectedRoute.tsx", import.meta.url), "utf8");
  const mobileProfileHub = readFileSync(new URL("../../../artifacts/dallyletter-mobile/app/profile-hub.tsx", import.meta.url), "utf8");
  const webChat = readFileSync(new URL("../../../artifacts/dallyletter/src/pages/student/StudentChat.tsx", import.meta.url), "utf8");
  const webGroups = readFileSync(new URL("../../../artifacts/dallyletter/src/pages/student/StudentStudyGroups.tsx", import.meta.url), "utf8");
  const webTeacherClasses = readFileSync(new URL("../../../artifacts/dallyletter/src/pages/teacher/TeacherClasses.tsx", import.meta.url), "utf8");
  const webTeacherAssignments = readFileSync(new URL("../../../artifacts/dallyletter/src/pages/teacher/TeacherAssignments.tsx", import.meta.url), "utf8");
  const webLeaderboard = readFileSync(new URL("../../../artifacts/dallyletter/src/pages/student/StudentAchievements.tsx", import.meta.url), "utf8");
  const webPrefects = readFileSync(new URL("../../../artifacts/dallyletter/src/pages/manager/ManagerPrefects.tsx", import.meta.url), "utf8");
  const mobileFeatureHub = readFileSync(new URL("../../../artifacts/dallyletter-mobile/components/FeatureHub.tsx", import.meta.url), "utf8");
  const webExerciseBuilder = readFileSync(new URL("../../../artifacts/dallyletter/src/components/exercises/ExerciseBuilderPanel.tsx", import.meta.url), "utf8");
  const mobileGroupChat = readFileSync(new URL("../../../artifacts/dallyletter-mobile/app/(student)/chat.tsx", import.meta.url), "utf8");
  const mobileTeacherChat = readFileSync(new URL("../../../artifacts/dallyletter-mobile/app/(teacher)/chat.tsx", import.meta.url), "utf8");
  const paymentRoutes = readFileSync(new URL("../../../artifacts/api-server/src/routes/payments.ts", import.meta.url), "utf8");
  const academicRecordRoutes = readFileSync(new URL("../../../artifacts/api-server/src/routes/academicRecords.ts", import.meta.url), "utf8");
  const teacherCvWorkspaceRoutes = readFileSync(new URL("../../../artifacts/api-server/src/routes/teacherCvWorkspace.ts", import.meta.url), "utf8");
  const teacherCvWorkspaceUI = readFileSync(new URL("../../../artifacts/dallyletter/src/pages/TeacherCvWorkspace.tsx", import.meta.url), "utf8");
  const apiApp = readFileSync(new URL("../../../artifacts/api-server/src/app.ts", import.meta.url), "utf8");
  const webPayments = readFileSync(new URL("../../../artifacts/dallyletter/src/pages/student/StudentPayments.tsx", import.meta.url), "utf8");
  const adminSettings = readFileSync(new URL("../../../artifacts/dallyletter/src/pages/admin/AdminSettings.tsx", import.meta.url), "utf8");

  assert(!apiApp.includes("isTrustedVercelOrigin") && !apiApp.includes("vercel.app$"), "production CORS must not trust arbitrary Vercel preview hosts");
  assert(apiApp.includes("process.env.NODE_ENV === \"production\" ? [] : defaultOrigins"), "localhost CORS origins must be disabled in production");
  assert(paymentRoutes.includes('/payments/paypal/webhook') && paymentRoutes.includes('verify-webhook-signature'), "PayPal school-fee webhook must verify signatures with PayPal");
  assert(paymentRoutes.includes('PAYPAL_WEBHOOK_ID') && paymentRoutes.includes('PAYMENT.CAPTURE.COMPLETED'), "PayPal school-fee settlement must require a configured webhook and completed capture event");
  assert(paymentRoutes.includes('/payments/paypal/status') && paymentRoutes.includes('/payments/paynow/status'), "provider readiness endpoints must exist for both payment providers");
  assert(webPayments.includes('/api/payments/paypal/create') && webPayments.includes('/api/payments/paynow/status'), "web learner checkout must use server-managed provider readiness and PayPal orders");
  assert(mobileFeatureHub.includes('/api/payments/paypal/create') && mobileFeatureHub.includes('/api/payments/paynow/status'), "Android learner checkout must use server-managed provider readiness and PayPal orders");
  assert(adminSettings.includes('PAYPAL_WEBHOOK_ID') && adminSettings.includes('PAYNOW_INTEGRATION_KEY'), "Owner settings must explain server-side provider configuration without exposing secrets");
  assert(userRoutes.includes("canUseOwnPayoutPreferences"), "payout preferences must use a shared role and teacher-eligibility guard");
  assert(userRoutes.includes("Payout preferences are unavailable until your teacher application is approved"), "pending teachers must be denied payout preferences by the route");
  assert(!roleAccess.includes('"/users/me/payout-preferences"'), "pending teacher route allowlist must not include payout preferences");
  assert(mobileProfile.includes("canManageOwnPayoutPreferences?api(\"/api/users/me/payout-preferences\")"), "Android must conditionally load payout preferences");
  assert(webProfile.includes("canManageOwnPayoutPreferences?request(\"/api/users/me/payout-preferences\")"), "web must conditionally load payout preferences");
  assert(webAuth.includes("queryClient.clear()") && webAuth.includes('window.addEventListener("storage", onStorage)'), "web auth must clear identity-scoped query data on session changes");
  assert(mobileOfflineMedia.includes("const offlineMediaDownloads = new Map") && mobileOfflineMedia.includes("offlineMediaDownloads.get(key)") && mobileOfflineMedia.includes("offlineMediaDownloads.set(key, pending)"), "concurrent offline saves for the same account/media must share one download and registry write");
  assert(webStudentHome.includes("assignmentsRequestRef") && webStudentHome.includes("assignmentsAbortRef") && webStudentHome.includes("controller.signal"), "student dashboard refreshes must coalesce overlapping assignment requests and cancel on unmount");
  assert(mobileAuth.includes("AUTH_CACHE_EPOCH_KEY") && mobileAuth.includes("AUTH_CACHE_VERIFIED_KEY") && mobileAuth.includes("AppState.addEventListener") && mobileAuth.includes('DeviceEventEmitter.emit("dallyletter-auth-changed")'), "Android auth must revalidate sessions, isolate cache namespaces and clear cache after rejected sessions");
  assert(mobileLayout.includes('"_session_" + cacheEpoch') && mobileLayout.includes("verifiedEpoch !== cacheEpoch") && !mobileLayout.includes("\n    void loadUserCache();\n"), "Android offline cache must be session-scoped and withheld until server validation completes");
  assert(webAuth.includes("refetchInterval: 60_000") && webAuth.includes("refetchOnWindowFocus: true"), "web session authority must be periodically revalidated");
  assert(webAuth.includes("sessionUser.id !== fetchedUser.id") && webAuth.includes("queryClient.clear()"), "web identity changes must clear all cached query data before adopting the new identity");
  assert(webAuth.includes('window.addEventListener("storage"') && webAuth.includes('event.key !== "dallyletter_token"') && webAuth.includes("const logout = () =>"), "web cross-tab token changes and logout must invalidate session state");
  assert(mobileAuth.includes("newAuthCacheEpoch()") && mobileAuth.includes("unregisterNativePushForAccount") && mobileAuth.includes('DeviceEventEmitter.emit("dallyletter-auth-changed")'), "mobile account switching must isolate cache namespaces and unregister prior-account push state");
  assert(webAuth.includes("/401|403|unauthorized|forbidden|authentication required/i"), "web 401 and 403 rejected sessions must clear identity and cached data");
  assert(mobileAuth.includes("response.status === 401 || response.status === 403") && mobileAuth.includes("AUTH_CACHE_VERIFIED_KEY"), "mobile cold-start and foreground checks must reject invalid sessions before private cache hydration");
  assert(mobileAuth.includes("setInterval") && mobileAuth.includes("60_000") && mobileAuth.includes("clearInterval(interval)"), "mobile must revalidate active sessions periodically and clean up the timer");
  assert(aiProviderHttp.includes("AbortController") && aiProviderHttp.includes("clearTimeout(timeout)") && aiProviderHttp.includes("AbortSignal.any") && aiProviderHttp.includes('"cancelled"'), "AI provider requests must enforce timeouts and honor caller cancellation");
  assert(aiRoutes.includes("actionsExecuted: false") && aiRoutes.includes("consequentialActionsRequireExplicitConfirmation: true") && !aiRoutes.includes("autoExecuteActions("), "AI chat must never execute consequential actions from generated text");
  assert(aiRoutes.includes("stage") && aiRoutes.includes("requestId") && aiRoutes.includes("interaction_logging"), "AI failures and persistence diagnostics must include safe correlation and stage data");
  assert(aiRoutes.includes('event: "ai_interaction_log_failed"') && aiRoutes.includes("Response generated successfully") && aiRoutes.includes("res.json({") && aiRoutes.includes("actionsExecuted: false"), "AI response must remain successful and advisory-only when best-effort database interaction logging fails");
  assert(aiRoutes.includes('req.once("aborted"') && aiRoutes.includes("providerAbort.signal") && aiRoutes.includes("res.destroyed"), "client disconnects must abort upstream AI requests without writing to a closed response");
  console.log("PAYMENT_PROVIDER_SECURITY_STATIC: PASS (verified PayPal webhook, server readiness, explicit CORS, web/mobile parity)");
  console.log("PAYOUT_AND_SESSION_SECURITY_STATIC: PASS (role gate, pending denial, web/mobile cache isolation)");
  console.log("AI_SAFETY_STATIC: PASS (provider timeout, redacted stages, no automatic actions)");
  assert(aiRoutes.includes('role === "student" || role === "learner" || role === "prefect"') && aiRoutes.includes('requestedMode === "agent"'), "learner and prefect AI access must be separated from staff agent mode");
  assert(aiRoutes.includes('"ai.agent.use"') && aiRoutes.includes("managerHasPermission"), "manager agent mode must require an individually granted AI permission");
  assert(managerPermissionRoutes.includes('key: "ai.agent.use"') && managerPermissionRoutes.includes('key: "ai.agent.approve_workflows"') && managerPermissionRoutes.includes('key: "ai.agent.read_financials"'), "Owner permission workspace must expose independent AI agent capabilities");
  assert(messageRoutes.includes('detectedBy: "ai:auto"') && messageRoutes.includes('contentType: "message"') && messageRoutes.includes("ai.moderateContent(message.content"), "new chat text must be screened into the existing human moderation queue without auto-punishment");
  assert(socialFeatureRoutes.includes('detectedBy:"ai:auto"') && socialFeatureRoutes.includes('contentType:"comment"') && socialFeatureRoutes.includes("ai.moderateContent(body.trim()"), "new content comments must also be screened into the existing human moderation queue");
  assert(managerPermissionUI.includes('activeSlide === "ai_agent"') && managerPermissionUI.includes("ELIDEMS AI Agent permissions"), "manager AI grants must have a separate slide in the existing permission workspace");
  assert(webProfileHubPage.includes("<ElidemsAIChat role={user?.role}/>") && webElidemsAIChat.includes('"/api/ai/chat"'), "own Profile Hub must expose the embedded ELIDEMS AI chat");
  assert(mobileProfile.includes("ELIDEMS AI") && mobileProfile.includes("/api/ai/chat") && mobileProfile.includes("learnerAIMode"), "mobile own Profile Hub must expose the same role-aware ELIDEMS AI chat");
  assert(webElidemsAIChat.includes('learner ? "chat" : mode') && webElidemsAIChat.includes("Agent planning is permission-gated"), "learner chat must remain separate from staff agent planning");
  assert(aiContentSafety.includes('detectedBy: "ai:auto"') && aiContentSafety.includes('status: "pending"') && aiContentSafety.includes("queueAIContentSafety"), "shared AI safety helper must create pending human-review flags only");
  assert(lessonRoutes.includes('queueAIContentSafety("lesson"') && assignmentRoutes.includes('queueAIContentSafety("assignment"') && exerciseRoutes.includes('queueAIContentSafety("exercise"') && pollRoutes.includes('queueAIContentSafety("poll"'), "new lessons, assignments, exercises and polls must be automatically screened");
  console.log("ELIDEMS_AI_ROLE_AND_SAFETY_STATIC: PASS (learner/prefect advisory mode, staff agent gate, manager permission catalogue, automatic message/comment/lesson/assignment/exercise/poll flags, own Profile Hub chat)");
  const allowedCors = await fetch(base + "/api/healthz", { method: "OPTIONS", headers: { Origin: "https://dallyletterelidemslearningplatforme-six.vercel.app", "Access-Control-Request-Method": "GET" } });
  assert.equal(allowedCors.status, 204, "known Dallyletter frontend origin should pass CORS preflight");
  assert.equal(allowedCors.headers.get("access-control-allow-origin"), "https://dallyletterelidemslearningplatforme-six.vercel.app");
  const rejectedCors = await fetch(base + "/api/healthz", { method: "OPTIONS", headers: { Origin: "https://attacker-preview.vercel.app", "Access-Control-Request-Method": "GET" } });
  assert.notEqual(rejectedCors.headers.get("access-control-allow-origin"), "https://attacker-preview.vercel.app", "unknown Vercel preview origins must not receive CORS access");
  const paypalReadiness = await request("/api/payments/paypal/status");
  assert.equal(paypalReadiness.status, 200);
  assert.equal(paypalReadiness.data.configured, true, "isolated CI PayPal credentials and public URLs should enable readiness");
  const paynowReadiness = await request("/api/payments/paynow/status");
  assert.equal(paynowReadiness.status, 200);
  assert.equal(paynowReadiness.data.configured, true, "isolated CI Paynow credentials and public URLs should enable readiness");
  assert(academicRecordRoutes.includes("r.form_data") && webProfile.includes("letter.schoolLogoDataUrl") && webProfile.includes("letter.guardianSignatureDataUrl") && webProfile.includes("letter.headmasterSignatureDataUrl") && webProfile.includes("Transfer Clearance &amp; Application") && webProfile.includes("3. Parent's / Guardian's Details"), "web transfer approval queue must reproduce the learner-submitted letter layout, including grouped details, signatures and logo");
  assert(teacherCvWorkspaceUI.includes("Readiness survey") && teacherCvWorkspaceUI.includes("surveySubmittedAt") && teacherCvWorkspaceUI.includes("Object.entries(cvPart(\"surveyAnswers\"))"), "teacher review workspace must display readiness survey answers and submission state with the CV");
  assert(teacherCvWorkspaceRoutes.includes("teacher_application_status='approved'") && roleAccess.includes('["draft", "pending_review", "rejected_pending_conversion"]'), "CV approval must transition the teacher out of the restricted application gate without bypassing teacher role controls");
  assert(webProfile.includes('managerPermissions["transfers.view"] === true') && mobileProfile.includes('managerPermissions["transfers.view"] === true'), "web and Android transfer approval queues must be hidden unless Owner or the current manager has an explicit transfers.view grant");
  assert(webProfile.includes("canApproveTransferLetters&&") && webProfile.includes("canRejectTransferLetters&&") && mobileProfile.includes("canApproveTransferLetters&&") && mobileProfile.includes("canRejectTransferLetters&&"), "web and Android transfer decision buttons must honor separate Owner-granted approve and reject permissions");
  assert(mobileProfile.includes("r.form_data") && mobileProfile.includes("guardianSignatureDataUrl") && mobileProfile.includes("headmasterSignatureDataUrl") && mobileProfile.includes("Transfer Clearance &amp; Application") && mobileProfile.includes("4. DECLARATIONS &amp; SIGNATURES"), "Android transfer approval queue must reproduce the submitted letter layout, grouped details and signatures");
  assert(webStudentHome.includes("<DailyAppAttendanceCard profileId={user?.id} />"), "learner dashboard must expose the attendance calendar and daily register without requiring a Profile Hub detour");
  assert(paymentRoutes.includes("Paynow reference ") && paymentRoutes.includes("isValidPaynowHash") && paymentRoutes.includes("status IN ('pending', 'overdue', 'partially_paid')") && paymentRoutes.includes("payment_transactions"), "Paynow must use signed callbacks, immutable checkout amounts and existing unpaid fee records, including partial balances");
  assert(paymentRoutes.includes("manual-reports") && paymentRoutes.includes("reportId !== null") && paymentRoutes.includes("status='reported'"), "manual learner reports must be persisted and linked to a reviewable transaction");
  assert(adminSettings.includes("/api/payments/manual-reports") && adminSettings.includes("Verify and apply payment") && adminSettings.includes("Reject report"), "Owner UI must expose approve/reject controls for learner payment reports");
  assert(settingsRoutes.includes("/settings/school-fees/apply") && settingsRoutes.includes("pg_advisory_xact_lock"), "Owner fee application must create idempotent invoices for a billing period");
  assert(adminSettings.includes("/api/settings/school-fees/apply") && adminSettings.includes("Apply to learners"), "Owner must be able to apply the configured fee from the UI");
  assert(!managerRoutes.includes("function requireManager(") && !managerRoutes.includes("requireManager,") && managerPermissionPolicy.includes("return false;"), "manager access must be controlled by explicit per-user grants");
  assert(!attendanceRoutes.includes("req.user") && attendanceRoutes.includes("req.currentUser"), "attendance routes must use the authenticated currentUser context");
  assert(protectedRoute.includes('location === "/teacher/qualifications"') && !protectedRoute.includes('location === "/teacher/chat"'), "pending teachers must remain limited to Profile Hub and CV settings, not teacher chat or dashboard features");
  assert(webPayments.includes("Paynow confirmation pending") && webPayments.includes("Paynow payment verified"), "web learner checkout must explain and refresh the ledger until Paynow's signed callback settles the invoice");


  assert(webUserLink.includes('"/profile/" + Number(userId)'), "web user names/avatars must open the existing /profile/:id route");
  assert(webRoutes.includes('path="/profile/:id"'), "web Profile Hub preview route must remain registered");
  assert(mobileUserLink.includes('pathname:"/profile/[id]",params:{id:String(validId)}'), "mobile user names/avatars must open the public Profile Hub preview for the selected user ID");
  assert(mobileProfile.includes("const targetId = params.userId ? Number(params.userId) : user?.id"), "mobile Profile Hub must resolve selected user IDs and default to own profile");
  assert(mobileAvatarEditor.includes('accessibilityLabel="Open your Profile Hub"') && mobileAvatarEditor.includes('router.push("/profile-hub"'), "signed-in mobile avatar must open own Profile Hub");
  console.log("PROFILE_LINK_NAVIGATION: PASS (web and mobile /profile/:id preserve selected IDs)");
  for (const [label, source] of [
    ["web chat", webChat], ["web study groups", webGroups], ["teacher hand raises", webTeacherClasses],
    ["teacher assignment submissions", webTeacherAssignments], ["learner leaderboard", webLeaderboard],
    ["manager prefect ranking", webPrefects],
  ]) assert(source.includes("UserProfileLink"), label + " must use the shared Profile Hub link component");
  assert(mobileFeatureHub.includes("userId={sub.studentId ?? sub.student?.id}"), "mobile assignment submissions must link to the correct learner ID");
  assert(mobileGroupChat.includes('userId={msg.senderId}'), "mobile group chat messages must link to the sender ID");
  assert(mobileTeacherChat.includes("UserProfileLink"), "mobile teacher chat must link other participants to Profile Hub");
  assert(mobileFeatureHub.includes('userId={person.id} name={person.name||"User"}'), "mobile private contacts must link to the contact ID");
  assert(webExerciseBuilder.includes("Record for Report Mark") && webExerciseBuilder.includes("recordForReport"), "web exercise builder must persist the report-mark choice");
  assert(mobileFeatureHub.includes("Record for Report Mark") && mobileFeatureHub.includes("recordForReport"), "Android exercise builder must persist the report-mark choice");
assert(mobileFeatureHub.includes('p.status === "pending" || p.status === "overdue"'), "Android learner balance must exclude refunded, failed and cancelled payments");
assert(mobileFeatureHub.includes('payment.status==="refunded"?"#0ea5e9"'), "Android payment history must visibly distinguish provider-confirmed refunds");

  assert(webProfile.includes("Download verified CV PDF"), "web Profile Hub must offer the verified CV PDF download");
  assert(mobileTeacherCvEditor.includes("Download verified CV PDF"), "Android teacher profile must offer the verified CV PDF download");
  assert(mobileTeacherProfile.includes('keyboardShouldPersistTaps="always"') && mobileTeacherProfile.includes('keyboardDismissMode="none"'), "Android teacher CV inputs must remain inside a keyboard-persistent scroll surface");
  assert(mobileTeacherCvEditor.includes("blurOnSubmit={false}") && mobileTeacherCvEditor.includes('testID={"teacher-cv-" + field.key}'), "Android CV text fields must retain multiline focus and expose stable field identifiers");
  assert(mobileTeacherCvEditor.includes("key={field.key}") && mobileTeacherCvEditor.includes("fields.map(field =>"), "Android CV field identity must remain stable while controlled text values change");
  assert(mobileProfileHub.includes('<TeacherCvEditor/>') && mobileProfileHub.includes('isOwn&&normalizedUserRole==="teacher"'), "Pending teachers must be able to open the CV editor inside their Android Profile Hub");
  assert(mobileTeacherCvEditor.includes("Submit CV for review") && mobileTeacherCvEditor.includes("Application review history"), "Android CV workspace must support optional submission and self review history");
  assert(mobileTeacherCvEditor.includes("Live professional CV preview") && mobileTeacherCvEditor.includes("teacher-documents/"), "Android CV preview must reflect the saved profile photograph and edited professional details");
  assert(mobileTeacherCvEditor.includes("Save readiness survey separately") && mobileTeacherCvEditor.includes("Submit readiness survey independently") && mobileTeacherCvEditor.includes("Message your CV reviewer"), "Android CV workspace must save and independently submit optional survey answers and support reviewer conversations");
  console.log("USER_IDENTITY_SURFACE_AUDIT: PASS (web chat, groups, hand raises, submissions, rankings and mobile chat/submissions/contacts)");


  for (const [label, source] of [["web Profile Hub", webProfile], ["Android Profile Hub", androidProfile]]) {
    assert(source.includes("/api/users/me/recovery-profile"), label + " must load/save the recovery profile");
    assert(source.includes("/api/users/me/recovery-email/request-verification"), label + " must request recovery email verification");
    assert(source.includes("/api/users/me/recovery-email/confirm"), label + " must confirm recovery email verification");
  }
  for (const [label, source] of [["web forgot-password", webForgot], ["Android forgot-password", androidForgot]]) {
    assert(source.includes("/api/auth/password-reset/request"), label + " must use the shared password-reset API");
    assert(source.includes("previously verified recovery email"), label + " must explain verified alternate-email recovery");
  }
  console.log("RECOVERY_UI_PARITY: PASS (web + Android use shared recovery APIs and disclose verified-email requirement)");

  const identity = await pool.query("SELECT current_database() AS database_name, current_setting('transaction_read_only') AS read_only");
  assert.equal(identity.rows[0].read_only, "off", "CI test database must be writable");
  console.log("TEST_DATABASE:", identity.rows[0].database_name);

  const required = await pool.query(
    "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name = ANY($1::text[]) ORDER BY table_name,ordinal_position",
    [["users", "classes", "enrollments", "notification_email_verifications", "email_notification_queue", "payout_history", "payout_preferences", "account_email_status", "account_email_tokens", "academic_transfer_requests", "user_courses", "course_enrollments", "class_enrollments", "student_courses", "class_students"]],
  );
  const byTable = new Map();
  for (const row of required.rows) {
    if (!byTable.has(row.table_name)) byTable.set(row.table_name, []);
    byTable.get(row.table_name).push(row.column_name);
  }
  for (const [table, columns] of Object.entries({
    users: ["id", "email", "role"],
    classes: ["id", "teacher_id", "subject"],
    enrollments: ["learner_id", "class_id", "enrolled_at", "progress_percent", "status"],
    notification_email_verifications: ["user_id", "email", "otp_hash", "expires_at"],
    email_notification_queue: ["recipient_user_id", "status", "attempts"],
    payout_history: ["teacher_id", "provider_reference", "status", "webhook_verified"],
    payout_preferences: ["user_id", "method", "paypal_email"],
    account_email_status: ["user_id", "email", "verified_at"],
    account_email_tokens: ["token_hash", "user_id", "purpose", "email", "expires_at", "used_at"],
    academic_transfer_requests: ["id", "learner_id", "requested_by", "reason", "status", "review_note", "form_data", "reviewed_by", "reviewed_at"],
  })) {
    assert(byTable.has(table), "Missing required test table " + table);
    for (const column of columns) assert(byTable.get(table).includes(column), "Missing " + table + "." + column);
  }
  const legacy = ["user_courses", "course_enrollments", "class_enrollments", "student_courses", "class_students"]
    .filter(name => byTable.has(name))
    .map(name => ({ table: name, columns: byTable.get(name) }));
  console.log("LEGACY_ENROLLMENT_SCHEMA_DISCOVERY:", JSON.stringify(legacy));
  console.log("MAPPING_RULE: only an explicitly verified user_id + class_id source can map to enrollments; course_id is never assumed to be class_id.");

  const suffix = Date.now();
  const teacher = await pool.query(
    "INSERT INTO users(email,password_hash,name,role) VALUES($1,$2,$3,'teacher') RETURNING id",
    [`profile-hub-teacher-${suffix}@example.test`, "test-only-not-a-login-hash", "PR84 Test Teacher"],
  );
  const teacherId = Number(teacher.rows[0].id);
  const ownerResult = await pool.query(
    "INSERT INTO users(email,password_hash,name,role) VALUES($1,$2,$3,'owner') RETURNING id",
    ["profile-hub-owner-" + suffix + "@example.test", "test-only-not-a-login-hash", "PR84 Test Owner"],
  );
  const ownerId = Number(ownerResult.rows[0].id);
  const managerResult = await pool.query("INSERT INTO users(email,password_hash,name,role,is_manager,manager_level) VALUES($1,$2,$3,'manager',true,'junior') RETURNING id", ["profile-hub-manager-" + suffix + "@example.test", "test-only-not-a-login-hash", "PR84 Test Manager"]);
  const managerId = Number(managerResult.rows[0].id);
  const adminResult = await pool.query("INSERT INTO users(email,password_hash,name,role) VALUES($1,$2,$3,'admin') RETURNING id", ["profile-hub-admin-" + suffix + "@example.test", "test-only-not-a-login-hash", "PR84 Test Admin"]);
  const adminId = Number(adminResult.rows[0].id);
  const seniorManagerResult = await pool.query("INSERT INTO users(email,password_hash,name,role,is_manager,manager_level) VALUES($1,$2,$3,'senior_manager',true,'senior') RETURNING id", ["profile-hub-senior-manager-" + suffix + "@example.test", "test-only-not-a-login-hash", "PR84 Test Senior Manager"]);
  const seniorManagerId = Number(seniorManagerResult.rows[0].id);
  async function makeSessionToken(userId) {
    const encoded = Buffer.from(JSON.stringify({ userId, ts: Date.now() })).toString("base64url");
    const signature = crypto.createHmac("sha256", process.env.JWT_SECRET).update(encoded).digest("hex");
    const token = encoded + "." + signature;
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    await pool.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')", [tokenHash, userId]);
    return token;
  }
  const teacherToken = await makeSessionToken(teacherId);
  const ownerToken = await makeSessionToken(ownerId);
  const managerToken = await makeSessionToken(managerId);
  const adminToken = await makeSessionToken(adminId);
  const seniorManagerToken = await makeSessionToken(seniorManagerId);
  const learnerFixture = await pool.query("INSERT INTO users(email,password_hash,name,role) VALUES($1,$2,$3,'student') RETURNING id", ["profile-hub-permission-learner-" + suffix + "@example.test", "test-only-not-a-login-hash", "PR84 Permission Learner"]);
  const permissionLearnerId = Number(learnerFixture.rows[0].id);
  const achievementFixture = await pool.query("INSERT INTO achievements(name,description) VALUES($1,$2) RETURNING id", ["PR84 Permission Achievement " + suffix, "Isolated manager-permission integration fixture"]);
  const permissionAchievementId = Number(achievementFixture.rows[0].id);
  async function createTransferFixture(label) {
    const row = await pool.query("INSERT INTO academic_transfer_requests(learner_id,requested_by,reason,form_data) VALUES($1,$2,$3,'{}'::jsonb) RETURNING id", [permissionLearnerId, permissionLearnerId, "Permission integration test " + label]);
    return Number(row.rows[0].id);
  }
  async function createReportFixture(label) {
    const row = await pool.query("INSERT INTO academic_report_drafts(learner_id,created_by,report_type,term_label,source_snapshot,draft_content) VALUES($1,$2,'attendance_register',$3,'{}'::jsonb,'{}'::jsonb) RETURNING id", [permissionLearnerId, teacherId, "Permission integration " + label]);
    return Number(row.rows[0].id);
  }
  async function createAchievementRecommendationFixture() {
    const row = await pool.query("INSERT INTO achievement_award_recommendations(learner_id,achievement_id,recommended_by,recommendation_note) VALUES($1,$2,$3,'Permission integration fixture') RETURNING id", [permissionLearnerId, permissionAchievementId, teacherId]);
    return Number(row.rows[0].id);
  }

  // Existing session tokens must resolve the current database identity after a
  // role transition; role claims from the token cannot preserve old authority.
  await pool.query("UPDATE users SET role='manager' WHERE id=$1", [teacherId]);
  const promotedIdentity = await request("/api/auth/me", { token: teacherToken });
  assert.equal(promotedIdentity.status, 200);
  assert.equal(promotedIdentity.data.role, "manager", "old teacher token must resolve the current promoted role");
  await pool.query("UPDATE users SET role='teacher' WHERE id=$1", [teacherId]);
  const demotedIdentity = await request("/api/auth/me", { token: teacherToken });
  assert.equal(demotedIdentity.status, 200);
  assert.equal(demotedIdentity.data.role, "teacher", "old token must not preserve a previous manager role");

  const pendingTeacherResult = await pool.query(
    "INSERT INTO users(email,password_hash,name,role,teacher_application_status) VALUES($1,$2,$3,'teacher','pending_review') RETURNING id",
    ["profile-hub-pending-teacher-" + suffix + "@example.test", "test-only-not-a-login-hash", "PR84 Pending Teacher"],
  );
  const pendingTeacherId = Number(pendingTeacherResult.rows[0].id);
  const pendingTeacherToken = await makeSessionToken(pendingTeacherId);

  // Manager permissions are explicit, persistent, per-user Owner decisions.
  const anonymousPermissions = await request("/api/manager-permissions/me");
  assert.equal(anonymousPermissions.status, 401, "manager permissions must require authentication");
  const ownerPermissions = await request("/api/manager-permissions/me", { token: ownerToken });
  assert.equal(ownerPermissions.status, 200);
  const managerCatalog = await request("/api/manager-permissions/catalog", { token: ownerToken });
  assert.equal(managerCatalog.status, 200);
  const managerPermissionKeys = new Set(managerCatalog.data.permissions.map(item => item.key));
  for (const key of ["classes.manage","lessons.create","lessons.edit","lessons.delete","lessons.notify","polls.manage","messages.send","content.comment","content.view_comments","groups.manage"]) {
    assert(managerPermissionKeys.has(key), "Owner permission workspace must expose " + key);
  }
  assert.equal(ownerPermissions.data.isOwner, true);
  assert(ownerPermissions.data.protectedCapabilities.includes("owner.permissions.manage"), "Owner permission controls remain outside manager grants");
  const promoteJunior = await request("/api/manager-permissions/" + managerId + "/role", { token: ownerToken, method: "PATCH", body: { role: "junior_manager" } });
  assert.equal(promoteJunior.status, 200, "Owner can assign a distinct Junior Manager role");
  const promoteSenior = await request("/api/manager-permissions/" + seniorManagerId + "/role", { token: ownerToken, method: "PATCH", body: { role: "senior_manager" } });
  assert.equal(promoteSenior.status, 200, "Owner can assign a distinct Senior Manager role");
  const seniorPermissions = await request("/api/manager-permissions/me", { token: seniorManagerToken });
  assert.equal(seniorPermissions.status, 200);
  assert.equal(seniorPermissions.data.role, "senior_manager");
  for (const key of ["manager.dashboard.view","achievements.view","achievements.approve","owner.chat","teacher_cv.chat","classes.manage","lessons.create","polls.manage","groups.manage","teacher_cv.view","transfers.approve","transfers.view"]) {
    assert.equal(seniorPermissions.data.permissions[key], false, "Senior Manager receives no implicit grant for " + key);
  }
  const seniorGrantKeys = ["manager.dashboard.view","achievements.view","achievements.approve","owner.chat","teacher_cv.chat","teacher_cv.view","classes.manage","lessons.create","polls.manage","groups.manage","transfers.approve","transfers.view","reports.review","teacher_cv.review","teacher_cv.authorize","qualifications.verify"];
  for (const key of seniorGrantKeys) {
    const seniorExplicitGrant = await request("/api/manager-permissions/" + seniorManagerId, { token: ownerToken, method: "PUT", body: { permissions: [{ key, granted: true }] } });
    assert.equal(seniorExplicitGrant.status, 200, "Owner can explicitly grant Senior Manager permission " + key + ": " + JSON.stringify(seniorExplicitGrant.data));
  }
  const seniorAfterGrant = await request("/api/manager-permissions/me", { token: seniorManagerToken });
  for (const key of ["manager.dashboard.view","achievements.view","achievements.approve","owner.chat","teacher_cv.chat","teacher_cv.view","classes.manage","lessons.create","polls.manage","groups.manage","transfers.approve","reports.review","teacher_cv.review","teacher_cv.authorize","qualifications.verify"]) {
    assert.equal(seniorAfterGrant.data.permissions[key], true, "Senior Manager receives explicit Owner grant for " + key);
  }
  const juniorPermissions = await request("/api/manager-permissions/me", { token: managerToken });
  assert.equal(juniorPermissions.status, 200);
  assert.equal(juniorPermissions.data.role, "junior_manager");
  assert.equal(juniorPermissions.data.permissions["users.view"], false, "Junior receives no automatic user-view grant");
  assert.equal(juniorPermissions.data.permissions["owner.chat"], false, "Junior receives no automatic Owner-chat grant");
  assert.equal(juniorPermissions.data.permissions["teacher_cv.view"], false, "Junior receives no automatic teacher CV queue grant");
  const juniorCvQueueBeforeGrant = await request("/api/teacher-cv-workspace/queue", { token: managerToken });
  assert.equal(juniorCvQueueBeforeGrant.status, 403, "Junior CV queue access must be denied before an individual Owner grant");
  const juniorCvViewGrant = await request("/api/manager-permissions/" + managerId, {
    token: ownerToken, method: "PUT",
    body: { permissions: [{ key: "teacher_cv.view", granted: true }] },
  });
  assert.equal(juniorCvViewGrant.status, 200, "Owner must be able to grant CV queue visibility to this individual Junior Manager");
  const juniorCvQueueAfterGrant = await request("/api/teacher-cv-workspace/queue", { token: managerToken });
  assert.equal(juniorCvQueueAfterGrant.status, 200, "Junior CV queue access must work after the explicit Owner grant");
  assert(Array.isArray(juniorCvQueueAfterGrant.data.applications), "CV queue must return an applications collection");
  const juniorSeniorOnlyCvGrant = await request("/api/manager-permissions/" + managerId, {
    token: ownerToken, method: "PUT",
    body: { permissions: [{ key: "teacher_cv.review", granted: true }] },
  });
  assert.equal(juniorSeniorOnlyCvGrant.status, 400, "Owner cannot grant Senior-only CV review authority to a Junior Manager");
  console.log("TEACHER_CV_MANAGER_QUEUE_E2E: PASS (Junior denied by default, explicit per-user view grant unlocks queue, Senior-only review remains blocked)");
  const ownerChatBeforeGrant = await request("/api/manager/owner-contact", { token: managerToken });
  assert.equal(ownerChatBeforeGrant.status, 403, "Junior cannot access Owner chat before an individual grant");
  const juniorBasicsGrant = await request("/api/manager-permissions/" + managerId, { token: ownerToken, method: "PUT", body: { permissions: [{ key: "users.view", granted: true }, { key: "owner.chat", granted: true }] } });
  assert.equal(juniorBasicsGrant.status, 200, "Owner can individually grant user viewing and Owner chat");
  const juniorAgentGrant = await request("/api/manager-permissions/" + managerId, {
    token: ownerToken, method: "PUT", body: { permissions: [{ key: "ai.agent.use", granted: true }] },
  });
  assert.equal(juniorAgentGrant.status, 200, "Owner can grant AI Agent access individually");
  const juniorAgentAfterGrant = await request("/api/ai/chat", {
    token: managerToken, method: "POST", body: { mode: "agent", messages: [{ role: "user", content: "Prepare an academic summary." }] },
  });
  assert.equal(juniorAgentAfterGrant.status, 200, "Junior Manager can use agent planning after explicit Owner grant");
  const juniorAnalyzeWithoutGrant = await request("/api/ai/analyze", {
    token: managerToken, method: "POST", body: { prompt: "Summarize this permitted data.", data: { total: 3 } },
  });
  assert.equal(juniorAnalyzeWithoutGrant.status, 403, "AI analysis must require its own independent manager permission");
  const juniorAnalyzeGrant = await request("/api/manager-permissions/" + managerId, {
    token: ownerToken, method: "PUT", body: { permissions: [{ key: "ai.agent.read_academic", granted: true }] },
  });
  assert.equal(juniorAnalyzeGrant.status, 200);
  const juniorAnalyzeAfterGrant = await request("/api/ai/analyze", {
    token: managerToken, method: "POST", body: { prompt: "Summarize this permitted data.", data: { total: 3 } },
  });
  assert.equal(juniorAnalyzeAfterGrant.status, 200, "AI analysis should work only after its separate Owner grant");
  const juniorSeniorAgentGrant = await request("/api/manager-permissions/" + managerId, {
    token: ownerToken, method: "PUT", body: { permissions: [{ key: "ai.agent.approve_workflows", granted: true }] },
  });
  assert.equal(juniorSeniorAgentGrant.status, 400, "Junior Manager cannot receive senior-only AI approval capability");
  const juniorAgentRevocation = await request("/api/manager-permissions/" + managerId, {
    token: ownerToken, method: "PUT", body: { permissions: [{ key: "ai.agent.use", granted: false }] },
  });
  assert.equal(juniorAgentRevocation.status, 200, "Owner can revoke AI Agent access");
  const juniorAgentAfterRevoke = await request("/api/ai/chat", {
    token: managerToken, method: "POST", body: { mode: "agent", messages: [{ role: "user", content: "Prepare an academic summary." }] },
  });
  assert.equal(juniorAgentAfterRevoke.status, 403, "AI Agent access must be revoked immediately");
  console.log("AI_AGENT_MANAGER_PERMISSION_E2E: PASS (default deny, explicit grant, senior-only restriction, immediate revocation)");
  const ownerChatContact = await request("/api/manager/owner-contact", { token: managerToken });
  assert.equal(ownerChatContact.status, 200, "Junior can resolve Owner chat after the individual grant");
  const primaryOwner = await pool.query("SELECT id FROM users WHERE lower(role) IN ('owner','platform_owner') ORDER BY id LIMIT 1");
  assert.equal(Number(ownerChatContact.data.id), Number(primaryOwner.rows[0]?.id), "Owner chat contact resolves the configured primary Owner account");
  const adminOwnerChatContact = await request("/api/manager/owner-contact", { token: adminToken });
  assert.equal(adminOwnerChatContact.status, 403, "Admin does not inherit manager Owner-chat permission");
  assert.equal(juniorPermissions.data.permissions["teacher_cv.chat"], false, "Junior cannot access Senior-only teacher application chat");
  assert.equal(juniorPermissions.data.permissions["achievements.approve"], false, "Junior cannot approve achievements by default");
  assert.equal(juniorPermissions.data.permissions["achievements.recommend"], false, "All other Junior capabilities are denied by default");
  assert.equal(juniorPermissions.data.permissions["classes.manage"], false, "Junior class management is denied until explicitly granted");
  assert.equal(juniorPermissions.data.permissions["lessons.create"], false, "Junior lesson authoring is denied until explicitly granted");
  assert.equal(juniorPermissions.data.permissions["polls.manage"], false, "Junior poll management is denied until explicitly granted");
  assert.equal(juniorPermissions.data.permissions["groups.manage"], false, "Junior study group management is denied until explicitly granted");
  assert.equal(juniorPermissions.data.permissions["content.view_comments"], false, "Junior teacher comment viewing is denied until explicitly granted");
  const juniorApprovalWithoutGrant = await request("/api/academic-records/transfer-requests/999/review", { token: managerToken, method: "POST", body: { status: "approved", note: "test" } });
  assert.equal(juniorApprovalWithoutGrant.status, 403, "Junior transfer approval is denied without its own explicit grant");
  const juniorRejectWithoutGrant = await request("/api/academic-records/transfer-requests/999/review", { token: managerToken, method: "POST", body: { status: "rejected", note: "test rejection reason" } });
  assert.equal(juniorRejectWithoutGrant.status, 403, "Junior rejection requires an explicit Owner grant");
  const juniorRejectGrant = await request("/api/manager-permissions/" + managerId, { token: ownerToken, method: "PUT", body: { permissions: [{ key: "transfers.reject", granted: true }] } });
  assert.equal(juniorRejectGrant.status, 200, "Owner may grant Junior rejection without approval");
  const rejectTransferId = await createTransferFixture("junior reject");
  const juniorRejectAfterGrant = await request("/api/academic-records/transfer-requests/" + rejectTransferId + "/review", { token: managerToken, method: "POST", body: { status: "rejected", note: "Junior rejection explicitly granted by Owner" } });
  assert.equal(juniorRejectAfterGrant.status, 200, "Junior can successfully reject a transfer with the separate rejection grant");
  const juniorApprovalAfterRejectGrant = await request("/api/academic-records/transfer-requests/999/review", { token: managerToken, method: "POST", body: { status: "approved", note: "test" } });
  assert.equal(juniorApprovalAfterRejectGrant.status, 403, "A rejection grant never implies approval");
  const juniorApprovalGrantAttempt = await request("/api/manager-permissions/" + managerId, { token: ownerToken, method: "PUT", body: { permissions: [{ key: "transfers.approve", granted: true }] } });
  assert.equal(juniorApprovalGrantAttempt.status, 200, "Owner may separately grant Junior transfer approval");
  const approveTransferId = await createTransferFixture("junior approve");
  const juniorApprovalAfterSeparateGrant = await request("/api/academic-records/transfer-requests/" + approveTransferId + "/review", { token: managerToken, method: "POST", body: { status: "approved", note: "Separate approval permission explicitly granted by Owner" } });
  assert.equal(juniorApprovalAfterSeparateGrant.status, 200, "Junior can approve only after a separate transfers.approve grant");
  const juniorTransferApprovalRevocation = await request("/api/manager-permissions/" + managerId, { token: ownerToken, method: "PUT", body: { permissions: [{ key: "transfers.approve", granted: false }] } });
  assert.equal(juniorTransferApprovalRevocation.status, 200);
  const juniorApprovalAfterRevocation = await request("/api/academic-records/transfer-requests/999/review", { token: managerToken, method: "POST", body: { status: "approved", note: "test" } });
  assert.equal(juniorApprovalAfterRevocation.status, 403, "Transfer approval is revoked immediately using the same live session");

  const juniorReportApprovalGrant = await request("/api/manager-permissions/" + managerId, { token: ownerToken, method: "PUT", body: { permissions: [{ key: "reports.review", granted: true }] } });
  assert.equal(juniorReportApprovalGrant.status, 200, "Owner can grant Junior report approval/rejection independently");
  const reportApproveId = await createReportFixture("junior approve");
  const juniorReportApproved = await request("/api/academic-records/reports/drafts/" + reportApproveId + "/review", { token: managerToken, method: "POST", body: { status: "approved", note: "Explicitly authorized report approval" } });
  assert.equal(juniorReportApproved.status, 200, "Junior can approve a report with its explicit Owner grant");
  const reportRejectId = await createReportFixture("junior reject");
  const juniorReportRejected = await request("/api/academic-records/reports/drafts/" + reportRejectId + "/review", { token: managerToken, method: "POST", body: { status: "rejected", note: "Explicitly authorized report rejection" } });
  assert.equal(juniorReportRejected.status, 200, "Junior can reject a report with its explicit Owner grant");
  const juniorReportRevocation = await request("/api/manager-permissions/" + managerId, { token: ownerToken, method: "PUT", body: { permissions: [{ key: "reports.review", granted: false }] } });
  assert.equal(juniorReportRevocation.status, 200);
  const reportAfterRevocationId = await createReportFixture("revoked");
  const juniorReportAfterRevocation = await request("/api/academic-records/reports/drafts/" + reportAfterRevocationId + "/review", { token: managerToken, method: "POST", body: { status: "approved", note: "test" } });
  assert.equal(juniorReportAfterRevocation.status, 403, "Report approval revocation takes effect immediately");

  const juniorAchievementGrant = await request("/api/manager-permissions/" + managerId, { token: ownerToken, method: "PUT", body: { permissions: [{ key: "achievements.approve", granted: true }] } });
  assert.equal(juniorAchievementGrant.status, 200, "Owner can individually grant Junior achievement approval");
  const recommendationId = await createAchievementRecommendationFixture();
  const juniorAchievementDecision = await request("/api/achievements/award/recommendations/" + recommendationId + "/review", { token: managerToken, method: "POST", body: { status: "approved", note: "Explicitly authorized achievement approval" } });
  assert.equal(juniorAchievementDecision.status, 200, "Junior can approve an achievement recommendation after explicit grant");
  const juniorAchievementRevocation = await request("/api/manager-permissions/" + managerId, { token: ownerToken, method: "PUT", body: { permissions: [{ key: "achievements.approve", granted: false }] } });
  assert.equal(juniorAchievementRevocation.status, 200);
  const revokedRecommendationId = await createAchievementRecommendationFixture();
  const juniorAchievementAfterRevocation = await request("/api/achievements/award/recommendations/" + revokedRecommendationId + "/review", { token: managerToken, method: "POST", body: { status: "approved", note: "test" } });
  assert.equal(juniorAchievementAfterRevocation.status, 403, "Achievement approval revocation takes effect immediately");

  const juniorCvRejectDecision = await request("/api/users/" + pendingTeacherId + "/teacher-review", { token: managerToken, method: "PATCH", body: { action: "reject", note: "not allowed" } });
  assert.equal(juniorCvRejectDecision.status, 403, "Junior cannot reject teacher CV applications");
  const juniorCvAuthorizeDecision = await request("/api/users/" + pendingTeacherId + "/teacher-review", { token: managerToken, method: "PATCH", body: { action: "approve", note: "not allowed" } });
  assert.equal(juniorCvAuthorizeDecision.status, 403, "Junior cannot authorize teacher CV applications");
  const juniorSurveyDecision = await request("/api/teacher-cv-workspace/" + pendingTeacherId + "/survey/decision", { token: managerToken, method: "POST", body: { action: "approve", note: "not allowed" } });
  assert.equal(juniorSurveyDecision.status, 403, "Junior cannot approve pending teacher readiness surveys even when operational approvals are granted");
  const juniorCvReviewGrantAttempt = await request("/api/manager-permissions/" + managerId, { token: ownerToken, method: "PUT", body: { permissions: [{ key: "teacher_cv.review", granted: true }] } });
  assert.equal(juniorCvReviewGrantAttempt.status, 400, "Owner cannot grant CV or pending survey review to a Junior Manager");
  const juniorCvAuthorizeGrantAttempt = await request("/api/manager-permissions/" + managerId, { token: ownerToken, method: "PUT", body: { permissions: [{ key: "teacher_cv.authorize", granted: true }] } });
  assert.equal(juniorCvAuthorizeGrantAttempt.status, 400, "Owner cannot grant teacher authorization to a Junior Manager");
  const juniorQualificationGrantAttempt = await request("/api/manager-permissions/" + managerId, { token: ownerToken, method: "PUT", body: { permissions: [{ key: "qualifications.verify", granted: true }] } });
  assert.equal(juniorQualificationGrantAttempt.status, 400, "Owner cannot grant qualification verification to a Junior Manager");

  const seniorTransferId = await createTransferFixture("senior approve");
  const seniorTransferApprovalGrantScenario = await request("/api/academic-records/transfer-requests/" + seniorTransferId + "/review", { token: seniorManagerToken, method: "POST", body: { status: "approved", note: "Senior explicit approval grant" } });
  assert.equal(seniorTransferApprovalGrantScenario.status, 200, "Senior Manager can approve transfer with explicit Owner grant");
  const seniorReportId = await createReportFixture("senior approve");
  const seniorReportApproval = await request("/api/academic-records/reports/drafts/" + seniorReportId + "/review", { token: seniorManagerToken, method: "POST", body: { status: "approved", note: "Senior explicit report grant" } });
  assert.equal(seniorReportApproval.status, 200, "Senior Manager can approve reports with explicit Owner grant");
  await pool.query("INSERT INTO teacher_profiles(user_id,cv) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO UPDATE SET cv=EXCLUDED.cv", [pendingTeacherId, JSON.stringify({ surveySubmittedAt: new Date().toISOString(), surveyReviewStatus: "pending" })]);
  const seniorSurveyDecision = await request("/api/teacher-cv-workspace/" + pendingTeacherId + "/survey/decision", { token: seniorManagerToken, method: "POST", body: { action: "approve", note: "Senior explicit teacher survey review grant" } });
  assert.equal(seniorSurveyDecision.status, 200, "Senior Manager can review a pending teacher survey with explicit teacher_cv.review grant");
   const adminCvQueue = await request("/api/teacher-cv-workspace/queue", { token: adminToken });
   assert.equal(adminCvQueue.status, 200, "Admin has direct protected CV workspace access");
   const adminCvDetails = await request("/api/teacher-cv-workspace/" + pendingTeacherId + "/details", { token: adminToken });
   assert.equal(adminCvDetails.status, 200, "Admin can view submitted CV details");
   await pool.query("UPDATE teacher_profiles SET cv=jsonb_set(cv,'{surveyReviewStatus}',$2::jsonb),updated_at=now() WHERE user_id=$1", [pendingTeacherId, JSON.stringify("pending")]);
   const adminSurveyDecision = await request("/api/teacher-cv-workspace/" + pendingTeacherId + "/survey/decision", { token: adminToken, method: "POST", body: { action: "approve", note: "Admin review permitted by policy" } });
   assert.equal(adminSurveyDecision.status, 200, "Admin can review a pending teacher survey without a manager grant");
  const ownerGrantAttemptByJunior = await request("/api/manager-permissions/" + managerId, { token: managerToken, method: "PUT", body: { permissions: [{ key: "attendance.view", granted: true }] } });
  assert.equal(ownerGrantAttemptByJunior.status, 403, "Only Owner can grant or revoke manager permissions");
  const ownerGrantAttemptBySenior = await request("/api/manager-permissions/" + seniorManagerId, { token: seniorManagerToken, method: "PUT", body: { permissions: [{ key: "attendance.view", granted: false }] } });
  assert.equal(ownerGrantAttemptBySenior.status, 403, "Senior Manager cannot grant or revoke manager permissions");

  const juniorAttendanceGrant = await request("/api/manager-permissions/" + managerId, { token: ownerToken, method: "PUT", body: { permissions: [{ key: "attendance.view", granted: true }] } });
  assert.equal(juniorAttendanceGrant.status, 200, "Owner can grant one permission to one manager");
  const reaffirmJuniorRole = await request("/api/manager-permissions/" + managerId + "/role", { token: ownerToken, method: "PATCH", body: { role: "junior_manager" } });
  assert.equal(reaffirmJuniorRole.status, 200, "Owner can reaffirm an existing Junior Manager role");
  const reaffirmedJuniorPermissions = await request("/api/manager-permissions/me", { token: managerToken });
  assert.equal(reaffirmedJuniorPermissions.data.permissions["attendance.view"], true, "Reaffirming Junior role must preserve its individually granted permissions");
  const ownerDailyRegister = await request("/api/daily-attendance/user/" + ownerId, { token: managerToken });
  assert.equal(ownerDailyRegister.status, 404, "Managers must not retrieve Owner daily attendance history");
  const ownerAttendance = await request("/api/attendance/student/" + ownerId, { token: managerToken });
  assert.equal(ownerAttendance.status, 404, "Managers must not retrieve Owner class attendance history");
  const seniorAttendanceGrant = await request("/api/manager-permissions/" + seniorManagerId, { token: ownerToken, method: "PUT", body: { permissions: [{ key: "attendance.view", granted: true }] } });
  assert.equal(seniorAttendanceGrant.status, 200, "Owner must explicitly grant Senior attendance access too");
  const savedJunior = await request("/api/manager-permissions/" + managerId, { token: ownerToken });
  const savedSenior = await request("/api/manager-permissions/" + seniorManagerId, { token: ownerToken });
  assert.equal(savedJunior.data.permissions.find(p => p.key === "attendance.view")?.granted, true);
  assert.equal(savedSenior.data.permissions.find(p => p.key === "attendance.view")?.granted, true, "Senior's explicit grant is independent from Junior's grant");
  const juniorAttendanceDeny = await request("/api/manager-permissions/" + managerId, { token: ownerToken, method: "PUT", body: { permissions: [{ key: "attendance.view", granted: false }] } });
  assert.equal(juniorAttendanceDeny.status, 200, "Owner can explicitly deny a previously granted capability");
  const finalJunior = await request("/api/manager-permissions/" + managerId, { token: ownerToken });
  const finalSenior = await request("/api/manager-permissions/" + seniorManagerId, { token: ownerToken });
  assert.equal(finalJunior.data.permissions.find(p => p.key === "attendance.view")?.granted, false);
  assert.equal(finalSenior.data.permissions.find(p => p.key === "attendance.view")?.granted, true, "Changing Junior permissions must not affect Senior's separately granted permission");
  const history = await request("/api/manager-permissions/" + managerId + "/history", { token: ownerToken });
  assert.equal(history.status, 200);
  assert(history.data.history.some(item => item.permission_key === "attendance.view"), "Permission changes must be auditable");
  const decisionHistory = await pool.query("SELECT permission_key,previous_granted,granted,changed_by FROM manager_permission_history WHERE manager_user_id=$1 AND permission_key=ANY($2::text[])", [managerId, ["transfers.reject","transfers.approve","reports.review","achievements.approve"]]);
  for (const key of ["transfers.reject","transfers.approve","reports.review","achievements.approve"]) {
    assert(decisionHistory.rows.some(item => item.permission_key === key && item.changed_by === ownerId), "Owner grant/revocation history must be preserved for " + key);
  }
  assert(decisionHistory.rows.some(item => item.permission_key === "transfers.approve" && item.previous_granted === true && item.granted === false), "Transfer approval revocation must have a true-to-false history event");
  assert(decisionHistory.rows.some(item => item.permission_key === "reports.review" && item.previous_granted === true && item.granted === false), "Report review revocation must have a true-to-false history event");
  assert(decisionHistory.rows.some(item => item.permission_key === "achievements.approve" && item.previous_granted === true && item.granted === false), "Achievement approval revocation must have a true-to-false history event");

  const managerDirectory = await request("/api/users", { token: managerToken });
  assert.equal(managerDirectory.status, 200);
  assert.equal(managerDirectory.data.some(item => item.id === ownerId), false, "Owner must be absent from every non-Owner user directory");
  assert.equal(managerDirectory.data.some(item => item.role === "admin" || item.role === "senior_manager"), false, "Junior directory must contain only subordinate accounts and self");
  assert.equal(managerDirectory.data.some(item => item.id === managerId), true, "Junior may view their own account");
  const seniorDirectoryBeforeGrant = await request("/api/users", { token: seniorManagerToken });
  assert.equal(seniorDirectoryBeforeGrant.status, 403, "Senior directory access also requires an individual users.view grant");
  const seniorUsersViewGrant = await request("/api/manager-permissions/" + seniorManagerId, {
    token: ownerToken, method: "PUT", body: { permissions: [{ key: "users.view", granted: true }] },
  });
  assert.equal(seniorUsersViewGrant.status, 200, "Owner can individually grant directory visibility to this Senior Manager");
  const seniorDirectory = await request("/api/users", { token: seniorManagerToken });
  assert.equal(seniorDirectory.status, 200);
  assert.equal(seniorDirectory.data.some(item => item.id === managerId), true, "Senior may view Junior Manager accounts after explicit grant");
  assert.equal(seniorDirectory.data.some(item => item.role === "admin" || item.role === "owner"), false, "Senior directory must hide Admin and Owner accounts");
  const juniorDashboardDenied = await request("/api/manager/dashboard", { token: managerToken });
  assert.equal(juniorDashboardDenied.status, 403, "Junior dashboard access is denied until Owner grants it");
  const seniorDashboard = await request("/api/manager/dashboard", { token: seniorManagerToken });
  assert.equal(seniorDashboard.status, 200, "Senior dashboard access requires the explicit Owner grant above");
  const adminDirectory = await request("/api/users", { token: adminToken });
  assert.equal(adminDirectory.status, 200);
  assert.equal(adminDirectory.data.some(item => item.id === ownerId), false, "Admin must not enumerate Owner accounts");
  const ownerDirectory = await request("/api/users", { token: ownerToken });
  assert.equal(ownerDirectory.status, 200);
  assert.equal(ownerDirectory.data.some(item => item.id === ownerId), true, "Owner retains complete user directory visibility");
  const ownerPrivateProfile = await request("/api/users/" + ownerId, { token: managerToken });
  assert.equal(ownerPrivateProfile.status, 404, "Managers must not retrieve Owner account details");
  const ownerPublicProfile = await request("/api/users/" + ownerId + "/public-profile", { token: managerToken });
  assert.equal(ownerPublicProfile.status, 404, "Managers must not retrieve Owner public Profile Hub data");
  const ownerSocialProfile = await request("/api/profile/" + ownerId + "/social", { token: managerToken });
  assert.equal(ownerSocialProfile.status, 404, "Managers must not retrieve Owner social/chat metadata");
  const ownerProfileSection = await request("/api/profile/" + ownerId + "/section/attendance", { token: managerToken });
  assert.equal(ownerProfileSection.status, 403, "Managers must not retrieve Owner Profile Hub sections");
  const ownerConnectionAttempt = await request("/api/profile/" + ownerId + "/connect", { token: managerToken, method: "POST" });
  assert.equal(ownerConnectionAttempt.status, 404, "Managers must not create profile connections to Owner accounts");
  const seniorProfileForJunior = await request("/api/users/" + seniorManagerId + "/public-profile", { token: managerToken });
  assert.equal(seniorProfileForJunior.status, 404, "Junior Managers must not retrieve Senior Manager public profiles");
  const seniorSocialForJunior = await request("/api/profile/" + seniorManagerId + "/social", { token: managerToken });
  assert.equal(seniorSocialForJunior.status, 404, "Junior Managers must not retrieve Senior Manager social metadata");
  const seniorConnectionAttempt = await request("/api/profile/" + seniorManagerId + "/connect", { token: managerToken, method: "POST" });
  assert.equal(seniorConnectionAttempt.status, 404, "Junior Managers must not create connection requests to Senior Managers");
  const adminOwnerProfile = await request("/api/users/" + ownerId + "/public-profile", { token: adminToken });
  assert.equal(adminOwnerProfile.status, 404, "Admin must not retrieve Owner profile data");

  await pool.query("INSERT INTO audit_logs(action,category,performed_by,target_type,target_id,details) VALUES($1,'academic',$2,'owner_test',$3,$4)", ["owner-private-audit-" + suffix, ownerId, ownerId, "private Owner activity"]);
  const grantAudit = await request("/api/manager-permissions/" + managerId, { token: ownerToken, method: "PUT", body: { permissions: [{ key: "audit.view_subordinate", granted: true }] } });
  assert.equal(grantAudit.status, 200);
  const managerAudit = await request("/api/audit-logs", { token: managerToken });
  assert.equal(managerAudit.status, 200);
  assert.equal(managerAudit.data.some(item => item.performerRole === "owner" || item.action === "owner-private-audit-" + suffix), false, "Manager audit feed must never expose Owner activity");
  const ownerAudit = await request("/api/audit-logs", { token: ownerToken });
  assert.equal(ownerAudit.status, 200);
  assert.equal(ownerAudit.data.some(item => item.action === "owner-private-audit-" + suffix), true, "Owner retains access to their own audit history");
  const adminPermissionEdit = await request("/api/manager-permissions/" + adminId, { token: ownerToken, method: "PUT", body: { permissions: [] } });
  assert.equal(adminPermissionEdit.status, 404, "Admin must not be assignable as a manager");
  const teacherPermissions = await request("/api/manager-permissions/me", { token: teacherToken });
  assert.equal(teacherPermissions.status, 403, "Ordinary teachers cannot read manager permission state or gain manager tools");
  console.log("MANAGER_PERMISSIONS_HIERARCHY_E2E: PASS (auth required, owner-only permissions, senior approval, junior recommendation only, teacher denied manager access)");
  const legacyAcademicYear = await request("/api/config/currentYear", { token: ownerToken });
  const canonicalAcademicYear = await request("/api/academic-records/current-year", { token: teacherToken });
  assert.equal(legacyAcademicYear.status, 200, "legacy config current-year route must remain available");
  assert.equal(canonicalAcademicYear.status, 200, "canonical academic-record current-year route must remain available");
  assert.deepEqual(legacyAcademicYear.data, canonicalAcademicYear.data, "both current-year paths must return the same authoritative contract");
  assert.match(String(legacyAcademicYear.data.academicYear), /^\d{4}$/);
  assert.equal(Number(legacyAcademicYear.data.currentYear), Number(legacyAcademicYear.data.academicYear));
  assert.equal(legacyAcademicYear.data.timeZone, "Africa/Harare");
  assert.equal(legacyAcademicYear.data.timeZone, "Africa/Harare");
  console.log("CURRENT_ACADEMIC_YEAR_ROUTE_PARITY_E2E: PASS (legacy + canonical paths share Harare academic-year source)");
  const classResult = await pool.query(
    "INSERT INTO classes(title,subject,meet_link,teacher_id,teacher_name) VALUES($1,$2,$3,$4,$5) RETURNING id",
    ["PR84 Integration Maths", "Maths", "https://example.test/meeting", teacherId, "PR84 Test Teacher"],
  );
  const classId = Number(classResult.rows[0].id);
  const payout = await pool.query(
    "INSERT INTO payout_preferences(user_id,method,paypal_email) VALUES($1,'paypal',$2) RETURNING user_id",
    [teacherId, `teacher-${suffix}@example.test`],
  );
  assert.equal(Number(payout.rows[0].user_id), teacherId);
  const payoutRow = await pool.query(
    "INSERT INTO payout_history(teacher_id,amount,currency,method,provider_reference,status,webhook_verified) VALUES($1,12.50,'USD','paypal',$2,'pending',false) RETURNING id",
    [teacherId, "PR84-MOCK-PAYOUT-" + suffix],
  );
  const payoutId = Number(payoutRow.rows[0].id);

  async function register(email) {
    const result = await request("/api/auth/register", {
      method: "POST",
      body: { name: "PR84 Integration Learner", email, password: "Test-only-Password-482!", role: "student" },
    });
    assert.equal(result.status, 201, "Test learner registration should succeed: " + JSON.stringify(result.data));
    assert.equal(typeof result.data.token, "string");
    return { id: Number(result.data.user.id), token: result.data.token };
  }
  const learner = await register(`pr84-learner-${suffix}@example.test`);
  const otherLearner = await register(`pr84-other-learner-${suffix}@example.test`);
  const moderationTarget = await register(`pr84-moderation-target-${suffix}@example.test`);
  // End-to-end manual payment report lifecycle: reports do not settle until Owner approval.
  const rejectInvoiceResult = await pool.query("INSERT INTO payments(student_id,student_name,amount,month,year,status,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [learner.id, "PR84 Learner", "100.00", "January", 2097, "pending", ownerId]);
  const rejectInvoiceId = Number(rejectInvoiceResult.rows[0].id);
  const rejectReportResult = await request("/api/payments/notify-admin", { token: learner.token, method: "POST", body: { paymentId: rejectInvoiceId, amount: 25, method: "ecocash", providerReference: "PR84-REJECT-" + suffix } });
  assert.equal(rejectReportResult.status, 201);
  const reportQueueForReject = await request("/api/payments/manual-reports", { token: ownerToken });
  const reportToReject = reportQueueForReject.data.find(item => item.reference === rejectReportResult.data.reference);
  assert(reportToReject, "Owner queue must contain learner report");
  const rejectedReportResult = await request("/api/payments/manual-reports/" + reportToReject.report_id + "/reject", { token: ownerToken, method: "POST", body: {} });
  assert.equal(rejectedReportResult.status, 200);
  const rejectedInvoiceLedger = await pool.query("SELECT amount_paid,status FROM payments WHERE id=$1", [rejectInvoiceId]);
  assert.equal(Number(rejectedInvoiceLedger.rows[0].amount_paid), 0);
  assert.equal(rejectedInvoiceLedger.rows[0].status, "pending");

  const approveInvoiceResult = await pool.query("INSERT INTO payments(student_id,student_name,amount,month,year,status,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [learner.id, "PR84 Learner", "100.00", "February", 2097, "pending", ownerId]);
  const approveInvoiceId = Number(approveInvoiceResult.rows[0].id);
  const approveReportResult = await request("/api/payments/notify-admin", { token: learner.token, method: "POST", body: { paymentId: approveInvoiceId, amount: 40, method: "bank_transfer", providerReference: "PR84-APPROVE-" + suffix } });
  assert.equal(approveReportResult.status, 201);
  const reportQueueForApprove = await request("/api/payments/manual-reports", { token: ownerToken });
  const reportToApprove = reportQueueForApprove.data.find(item => item.reference === approveReportResult.data.reference);
  assert(reportToApprove, "Owner queue must contain approval candidate");
  const approvedReportResult = await request("/api/payments/" + approveInvoiceId + "/manual-settlement", { token: ownerToken, method: "POST", body: { reportId: reportToApprove.report_id, amount: 40, method: "bank_transfer", providerReference: "PR84-APPROVE-" + suffix } });
  assert.equal(approvedReportResult.status, 200);
  assert.equal(approvedReportResult.data.status, "partially_paid");
  assert.equal(Number(approvedReportResult.data.amountPaid), 40);
  const approvedInvoiceLedger = await pool.query("SELECT amount_paid,status FROM payments WHERE id=$1", [approveInvoiceId]);
  assert.equal(Number(approvedInvoiceLedger.rows[0].amount_paid), 40);
  assert.equal(approvedInvoiceLedger.rows[0].status, "partially_paid");
  console.log("MANUAL_PAYMENT_REPORT_E2E: PASS");

  const savedFee = await request("/api/settings", { token: ownerToken, method: "PATCH", body: { school_fee_amount: "55.00" } });
  assert.equal(savedFee.status, 200);
  const feeApply = await request("/api/settings/school-fees/apply", { token: ownerToken, method: "POST", body: { month: "March", year: 2097 } });
  assert.equal(feeApply.status, 200);
  assert(feeApply.data.created >= 1);
  assert.equal(Number(feeApply.data.amount), 55);
  const feeApplyRetry = await request("/api/settings/school-fees/apply", { token: ownerToken, method: "POST", body: { month: "March", year: 2097 } });
  assert.equal(feeApplyRetry.status, 200);
  assert.equal(feeApplyRetry.data.created, 0);
  console.log("OWNER_FEE_APPLICATION_E2E: PASS");

  // Attendance routes use the authenticated identity and enforce class-teacher / self-service boundaries.
  const attendanceClassResult = await pool.query("INSERT INTO classes(title,subject,meet_link,teacher_id,teacher_name,status) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", ["PR84 Attendance Class", "Mathematics", "https://meet.google.com/abc-defg-hij", teacherId, "PR84 Test Teacher", "live"]);
  const attendanceClassId = Number(attendanceClassResult.rows[0].id);
  const attendanceRowResult = await pool.query("INSERT INTO attendance(class_id,student_id,student_name,status) VALUES($1,$2,$3,$4) RETURNING id", [attendanceClassId, learner.id, "PR84 Integration Learner", "present"]);
  const attendanceRowId = Number(attendanceRowResult.rows[0].id);
  const teacherAttendanceEdit = await request("/api/attendance/" + attendanceRowId + "/status", { token: teacherToken, method: "PUT", body: { status: "absent" } });
  assert.equal(teacherAttendanceEdit.status, 200, "assigned teacher may edit attendance in their own class");
  const learnerAttendanceEdit = await request("/api/attendance/" + attendanceRowId + "/status", { token: learner.token, method: "PUT", body: { status: "present" } });
  assert.equal(learnerAttendanceEdit.status, 403, "learner cannot edit another class attendance record");
  const otherLearnerClose = await request("/api/attendance/" + attendanceRowId + "/leave", { token: otherLearner.token, method: "PUT", body: {} });
  assert.equal(otherLearnerClose.status, 403, "learner cannot close another learner attendance session");
  const missingClassJoin = await request("/api/attendance/join/99999999", { token: learner.token, method: "POST", body: {} });
  assert.equal(missingClassJoin.status, 404, "learner cannot create attendance against a nonexistent class");
  console.log("ATTENDANCE_AUTHORIZATION_E2E: PASS");



  // Profile Hub social privacy must use the existing private-message store and
  // must not unlock a private conversation before an explicit recipient approval.
  const profilePrivacySave = await request("/api/profile/me/privacy", {
    token: learner.token, method: "PUT",
    body: { chatPrivacy: "approval_required", sectionSettings: {
      overview: { mode: "me_only_authorized", selectedUserIds: [] },
      achievements: { mode: "selected_friends", selectedUserIds: [otherLearner.id] },
      attendance: { mode: "me_only_authorized", selectedUserIds: [] },
    } },
  });
  assert.equal(profilePrivacySave.status, 200, "learner should save independent Profile Hub section privacy");
  // Direct legacy routes must enforce the same independent privacy rules as Profile Hub sections.
  const teacherQualification = await pool.query(
    "INSERT INTO teacher_qualifications(user_id,title,institution,year,verification_status,source) VALUES($1,'Private CI Qualification','CI Test Institute',2020,'verified','test') RETURNING id",
    [teacherId],
  );
  const teacherDocument = await pool.query(
    "INSERT INTO teacher_documents(user_id,document_type,file_name,mime_type,size_bytes,data) VALUES($1,'certificate','private-ci-certificate.pdf','application/pdf',16,$2) RETURNING id",
    [teacherId, Buffer.from("private-test-doc")],
  );
  const teacherPrivacySave = await request("/api/profile/me/privacy", {
    token: teacherToken, method: "PUT",
    body: { sectionSettings: {
      qualifications: { mode: "me_only_authorized", selectedUserIds: [] },
      teacher_documents: { mode: "me_only_authorized", selectedUserIds: [] },
    } },
  });
  assert.equal(teacherPrivacySave.status, 200, "teacher should save independent qualification and document privacy");
  const privateQualificationDirect = await request("/api/qualifications/" + teacherId, { token: otherLearner.token });
  assert.equal(privateQualificationDirect.status, 403, "legacy verified-qualification endpoint must obey section privacy");
  const privateDocumentListDirect = await request("/api/users/" + teacherId + "/teacher-documents", { token: otherLearner.token });
  assert.ok([403, 404].includes(privateDocumentListDirect.status), "teacher document listing must deny access when section privacy is private (403) or conceal the resource (404)");
  const privateDocumentDownloadDirect = await request("/api/users/" + teacherId + "/teacher-documents/" + teacherDocument.rows[0].id, { token: otherLearner.token });
  assert.ok([403, 404].includes(privateDocumentDownloadDirect.status), "direct teacher certificate download must deny access when section privacy is private (403) or conceal the resource (404)");
  // Revoke the earlier queue grant so this fixture proves document access is independent.
  await pool.query(
    "UPDATE manager_permission_grants SET granted=false,changed_by=$2,changed_at=now() WHERE manager_user_id=$1 AND permission_key='teacher_cv.view'",
    [managerId, ownerId],
  );
  // Qualification document visibility is separate from CV review-queue visibility.
  await pool.query(
    "INSERT INTO manager_permission_grants(manager_user_id,permission_key,granted,changed_by) VALUES($1,'qualifications.view',true,$2) ON CONFLICT(manager_user_id,permission_key) DO UPDATE SET granted=true,changed_by=EXCLUDED.changed_by,changed_at=now()",
    [managerId, ownerId],
  );
  const authorizedManagerDocumentList = await request("/api/users/" + teacherId + "/teacher-documents", { token: managerToken });
  if (authorizedManagerDocumentList.status !== 200) {
    const diagnosticPermissions = await request("/api/manager-permissions/me", { token: managerToken });
    const diagnosticPrivacy = await pool.query("SELECT section_settings FROM profile_privacy_settings WHERE user_id=$1", [teacherId]);
    const diagnosticManager = await pool.query("SELECT role,is_manager,manager_level FROM users WHERE id=$1", [managerId]);
    console.error("MANAGER_DOCUMENT_ACCESS_DIAGNOSTIC:", JSON.stringify({
      response: authorizedManagerDocumentList,
      permissions: diagnosticPermissions,
      privacy: diagnosticPrivacy.rows[0] ?? null,
      manager: diagnosticManager.rows[0] ?? null,
      teacher: await pool.query("SELECT role,is_manager,manager_level FROM users WHERE id=$1", [teacherId]).then(r => r.rows[0] ?? null),
    }));
  }
  assert.equal(authorizedManagerDocumentList.status, 200, "authorized managers must retain protected teacher document access; response=" + JSON.stringify(authorizedManagerDocumentList));

  // The CV review queue is a separate protected endpoint. A manager must receive
  // teacher_cv.view explicitly; the route must not inherit access from manager role.
  const ownerCvQueueWarmup = await request("/api/teacher-cv-workspace/queue", { token: ownerToken });
  assert.equal(ownerCvQueueWarmup.status, 200, "Owner can open the CV queue and initialize its workflow schema");
  await pool.query(
    "INSERT INTO teacher_cv_review_history(teacher_id,reviewer_id,action,previous_status,new_status,note) VALUES($1,NULL,'submitted','pending_review','pending_review','CI queue access fixture')",
    [teacherId],
  );
  const managerCvQueueDeniedAfterExplicitDocGrant = await request("/api/teacher-cv-workspace/queue", { token: managerToken });
  assert.equal(managerCvQueueDeniedAfterExplicitDocGrant.status, 403, "document visibility alone must not grant CV queue visibility");
  await pool.query(
    "INSERT INTO manager_permission_grants(manager_user_id,permission_key,granted,changed_by) VALUES($1,'teacher_cv.view',true,$2) ON CONFLICT(manager_user_id,permission_key) DO UPDATE SET granted=true,changed_by=EXCLUDED.changed_by,changed_at=now()",
    [managerId, ownerId],
  );
  const authorizedManagerCvQueue = await request("/api/teacher-cv-workspace/queue", { token: managerToken });
  assert.equal(authorizedManagerCvQueue.status, 200, "Junior Manager with explicit teacher_cv.view grant can open CV queue");
  assert(authorizedManagerCvQueue.data.applications.some(item => Number(item.id) === teacherId), "authorized CV queue includes the submitted teacher application");
  const authorizedManagerCvDetails = await request("/api/teacher-cv-workspace/" + teacherId + "/details", { token: managerToken });
  assert.equal(authorizedManagerCvDetails.status, 200, "authorized Junior Manager can open subordinate teacher CV details");
  await pool.query(
    "UPDATE manager_permission_grants SET granted=false,changed_by=$2,changed_at=now() WHERE manager_user_id=$1 AND permission_key='teacher_cv.view'",
    [managerId, ownerId],
  );
  const revokedManagerCvQueue = await request("/api/teacher-cv-workspace/queue", { token: managerToken });
  assert.equal(revokedManagerCvQueue.status, 403, "revoking teacher_cv.view immediately removes CV queue access");
  await pool.query(
    "UPDATE manager_permission_grants SET granted=true,changed_by=$2,changed_at=now() WHERE manager_user_id=$1 AND permission_key='teacher_cv.view'",
    [managerId, ownerId],
  );
  console.log("TEACHER_CV_MANAGER_QUEUE_E2E: PASS (explicit grant, subordinate scope, independent document grant, immediate revocation)");
  const restoreTeacherProfilePrivacy = await request("/api/profile/me/privacy", {
    token: teacherToken, method: "PUT",
    body: { sectionSettings: {
      qualifications: { mode: "everyone", selectedUserIds: [] },
      teacher_documents: { mode: "everyone", selectedUserIds: [] },
    } },
  });
  assert.equal(restoreTeacherProfilePrivacy.status, 200, "restore fixture defaults so later public qualification tests remain independent");

  console.log("PROFILE_SECTION_DIRECT_ENDPOINT_PRIVACY: PASS", JSON.stringify({
    qualification: privateQualificationDirect.status,
    documentList: privateDocumentListDirect.status,
    documentDownload: privateDocumentDownloadDirect.status,
    authorizedManager: authorizedManagerDocumentList.status,
  }));

  const requireConnectionApproval = await request("/api/profile/me/privacy", {
    token: learner.token, method: "PUT",
    body: { chatPrivacy: "approval_required", sectionSettings: {} },
  });
  assert.equal(requireConnectionApproval.status, 200, "recipient should be able to require approval before private chat");
  const beforeConnection = await request("/api/profile/" + learner.id + "/social", { token: otherLearner.token });
  assert.equal(beforeConnection.status, 200);
  assert.equal(beforeConnection.data.canChat, false, "chat must remain locked before recipient approval");
  const blockedPrivateMessage = await request("/api/messages", { token: otherLearner.token, method: "POST", body: { content: "This must remain blocked until approval.", type: "text", groupId: null, recipientId: learner.id } });
  assert.equal(blockedPrivateMessage.status, 403, "direct message sends must remain blocked before connection acceptance");
  const connectionRequest = await request("/api/profile/" + learner.id + "/connect", { token: otherLearner.token, method: "POST", body: {} });
  assert.equal(connectionRequest.status, 201, "unconnected user should be able to request a connection");
  const pendingRequests = await request("/api/profile/connections/requests", { token: learner.token });
  assert(pendingRequests.data.some(item => Number(item.id) === Number(connectionRequest.data.connectionId)), "recipient must see the pending connection request");
  const requestNotices = await pool.query(
    "SELECT recipient_id,title FROM notifications WHERE type='connection_request' AND recipient_id = ANY($1::int[]) ORDER BY id DESC LIMIT 4",
    [[learner.id,otherLearner.id]],
  );
  assert(requestNotices.rows.some(row => Number(row.recipient_id) === learner.id && row.title === "New connection request"), "recipient must receive a connection notification");
  assert(requestNotices.rows.some(row => Number(row.recipient_id) === otherLearner.id && row.title === "Connection request sent"), "requester must receive a sent confirmation notification");
  const acceptConnection = await request("/api/profile/connections/" + connectionRequest.data.connectionId, { token: learner.token, method: "PATCH", body: { status: "accepted" } });
  assert.equal(acceptConnection.status, 200, "recipient should be able to accept the connection");
  const afterConnection = await request("/api/profile/" + learner.id + "/social", { token: otherLearner.token });
  assert.equal(afterConnection.data.canChat, true, "accepted connection should unlock chat when target requires approval");
  const acceptedPrivateMessage = await request("/api/messages", { token: otherLearner.token, method: "POST", body: { content: "Approved private connection works.", type: "text", groupId: null, recipientId: learner.id } });
  assert.equal(acceptedPrivateMessage.status, 201, "accepted connections should send through the existing private-message endpoint");
  const privateMessageReport = await request("/api/messages/" + acceptedPrivateMessage.data.id + "/report", {
    token: otherLearner.token, method: "POST", body: { reason: "This private message needs a safety review." },
  });
  assert.equal(privateMessageReport.status, 201, "participants must be able to report private messages through the existing safety workflow");
  const autoModeratedMessage = await request("/api/messages", {
    token: otherLearner.token, method: "POST",
    body: { content: "Please send money to claim your prize and share your otp.", type: "text", groupId: null, recipientId: learner.id },
  });
  assert.equal(autoModeratedMessage.status, 201, "AI screening must not block ordinary message delivery");
  const autoSafetyFlag = await waitFor(async () => {
    const result = await pool.query("SELECT detected_by,status,severity FROM content_flags WHERE content_type='message' AND content_id=$1 ORDER BY id DESC LIMIT 1", [autoModeratedMessage.data.id]);
    return result.rows[0] || null;
  }, "automatic AI moderation flag for a suspicious private message");
  assert.equal(autoSafetyFlag.detected_by, "ai:auto", "AI findings must appear in the existing Content Safety queue");
  assert.equal(autoSafetyFlag.status, "pending", "AI flags must remain pending for human review");
  console.log("AI_MESSAGE_MODERATION_E2E: PASS (automatic suspicious-message flag, no automatic punishment)");
  const privateHistory = await request("/api/messages?recipientId=" + learner.id, { token: otherLearner.token });
  assert.equal(privateHistory.status, 200, "accepted connection must use the existing private-message history endpoint");
  const selectedAchievementAccess = await request("/api/achievements/user/" + learner.id, { token: otherLearner.token });
  assert.equal(selectedAchievementAccess.status, 200, "selected approved friends should see a section they were explicitly selected for");
  const privateAchievementSave = await request("/api/profile/me/privacy", {
    token: learner.token, method: "PUT",
    body: { chatPrivacy: "approval_required", sectionSettings: {
      achievements: { mode: "me_only_authorized", selectedUserIds: [] },
    } },
  });
  assert.equal(privateAchievementSave.status, 200);
  const blockedAchievementAccess = await request("/api/achievements/user/" + learner.id, { token: otherLearner.token });
  assert.ok([403, 404].includes(blockedAchievementAccess.status), "direct achievement API access must deny or conceal private sections");
  const privateOverview = await request("/api/users/" + learner.id + "/public-profile", { token: otherLearner.token });
  assert.equal(privateOverview.status, 200);
  assert.equal(privateOverview.data.display_name, "Private profile", "private overview must not disclose the learner name");
  assert.equal(privateOverview.data.section_visibility.overview, false);
  const blockedAttendanceAccess = await request("/api/attendance/student/" + learner.id, { token: otherLearner.token });
  assert.ok([403, 404].includes(blockedAttendanceAccess.status), "direct attendance API access must deny or conceal private attendance");
  const blockedRegisterAccess = await request("/api/daily-attendance/user/" + learner.id, { token: otherLearner.token });
  assert.ok([403, 404].includes(blockedRegisterAccess.status), "direct daily register API access must deny or conceal private registers");
  const shareReportsOnly = await request("/api/profile/me/privacy", {
    token: learner.token, method: "PUT",
    body: { sectionSettings: {
      reports: { mode: "everyone", selectedUserIds: [] },
      transfers: { mode: "me_only_authorized", selectedUserIds: [] },
    } },
  });
  assert.equal(shareReportsOnly.status, 200);
  const sharedReports = await request("/api/profile/" + learner.id + "/section/reports", { token: otherLearner.token });
  const privateTransfers = await request("/api/profile/" + learner.id + "/section/transfers", { token: otherLearner.token });
  assert.equal(sharedReports.status, 200, "Everyone setting should expose approved reports");
  assert.equal(privateTransfers.status, 403, "Transfers must remain private when reports are shared");
  const shareTransfersOnly = await request("/api/profile/me/privacy", {
    token: learner.token, method: "PUT",
    body: { sectionSettings: {
      reports: { mode: "me_only_authorized", selectedUserIds: [] },
      transfers: { mode: "selected_friends", selectedUserIds: [otherLearner.id] },
    } },
  });
  assert.equal(shareTransfersOnly.status, 200);
  const privateReports = await request("/api/profile/" + learner.id + "/section/reports", { token: otherLearner.token });
  const selectedFriendTransfers = await request("/api/profile/" + learner.id + "/section/transfers", { token: otherLearner.token });
  assert.ok([403, 404].includes(privateReports.status), "changing transfer visibility must not expose private reports");
  assert.equal(selectedFriendTransfers.status, 200, "selected approved friends should see only the selected transfer section");
  console.log("PROFILE_CONNECTIONS_AND_PRIVACY_E2E: PASS", JSON.stringify({
    request: connectionRequest.status, recipientNotified: true, requesterNotified: true,
    accepted: acceptConnection.status, blockedBeforeApproval: blockedPrivateMessage.status, acceptedSend: acceptedPrivateMessage.status, existingPrivateHistory: privateHistory.status,
    selectedFriendSection: selectedAchievementAccess.status, privateSectionBlocked: blockedAchievementAccess.status,
    privateOverviewMasked: privateOverview.data.display_name, attendanceDirectUrlBlocked: blockedAttendanceAccess.status, registerDirectUrlBlocked: blockedRegisterAccess.status, reportsSharedIndependently: sharedReports.status, transfersRemainPrivate: privateTransfers.status, reportsRemainPrivate: privateReports.status, selectedFriendTransfers: selectedFriendTransfers.status,
  }));

  // Moderation queue visibility is denied until the Owner explicitly grants it.
  const safetyQueueBeforeGrant = await request("/api/content-flags", { token: managerToken });
  assert.equal(safetyQueueBeforeGrant.status, 403, "Junior Manager cannot view the safety queue without an individual moderation.view grant");

  // Owner explicitly grants this Junior Manager only the moderation capabilities
  // needed by this test. No role-based defaults are implied.
  const moderationGrant = await request("/api/manager-permissions/" + managerId, {
    token: ownerToken, method: "PUT",
    body: { permissions: [
      { key: "moderation.view", granted: true },
      { key: "users.block", granted: true },
      { key: "users.suspend", granted: true },
      { key: "users.restore", granted: true },
    ] },
  });
  assert.equal(moderationGrant.status, 200, "Owner must explicitly grant moderation and restore permissions to this test Junior Manager");

  // Destructive moderation actions require a recorded reason and remain auditable.
  const missingBlockReason = await request("/api/manager/users/" + moderationTarget.id + "/action", { token: managerToken, method: "POST", body: { action: "block" } });
  assert.equal(missingBlockReason.status, 400, "blocking without a reason must be rejected");
  const missingSuspendReason = await request("/api/manager/users/" + moderationTarget.id + "/action", { token: managerToken, method: "POST", body: { action: "suspend" } });
  assert.equal(missingSuspendReason.status, 400, "suspending without a reason must be rejected");
  const blockedModerationTarget = await request("/api/manager/users/" + moderationTarget.id + "/action", { token: managerToken, method: "POST", body: { action: "block", note: "CI policy test reason" } });
  assert.equal(blockedModerationTarget.status, 200, "authorized manager can block with a reason");
  const blockedState = await pool.query("SELECT is_blocked FROM users WHERE id=$1", [moderationTarget.id]);
  assert.equal(blockedState.rows[0].is_blocked, true);
  const moderationAudit = await pool.query("SELECT details FROM audit_logs WHERE target_type='user' AND target_id=$1 AND category='moderation' ORDER BY created_at DESC LIMIT 1", [moderationTarget.id]);
  assert.match(String(moderationAudit.rows[0]?.details), /CI policy test reason/);
  const restoredModerationTarget = await request("/api/manager/users/" + moderationTarget.id + "/unblock", { token: managerToken, method: "POST", body: {} });
  assert.equal(restoredModerationTarget.status, 200, "authorized manager can restore access after review");
  const restoredState = await pool.query("SELECT is_blocked,is_suspended FROM users WHERE id=$1", [moderationTarget.id]);
  assert.equal(restoredState.rows[0].is_blocked, false);
  assert.equal(restoredState.rows[0].is_suspended, false);
  console.log("MODERATION_REASON_E2E: PASS (reason required, block persisted, audit recorded, restore access)");
  const managerSafetyQueue = await request("/api/content-flags", { token: managerToken });
  assert.equal(managerSafetyQueue.status, 200, "Junior Manager can view safety moderation after the explicit Owner grant above");
  const seniorModerationGrant = await request("/api/manager-permissions/" + seniorManagerId, {
    token: ownerToken, method: "PUT",
    body: { permissions: [{ key: "moderation.view", granted: true }] },
  });
  assert.equal(seniorModerationGrant.status, 200, "Owner must explicitly grant Senior Manager moderation visibility");
  const seniorSafetyQueue = await request("/api/content-flags", { token: seniorManagerToken });
  assert.equal(seniorSafetyQueue.status, 200, "Senior Manager can view safety moderation after the explicit Owner grant");
  const learnerSafetyQueue = await request("/api/content-flags", { token: learner.token });
  assert.equal(learnerSafetyQueue.status, 403, "learners must not access moderation queues");
  console.log("SAFETY_ROLE_MATRIX_E2E: PASS (manager/senior allowed, learner denied)");

  // Push endpoints/tokens are account-bound and cannot be reassigned by another signed-in user.
  const expoPushToken = "ExpoPushToken[PR84-Test-Token-123456]";
  const learnerPushSave = await request("/api/push/expo-subscriptions", { token: learner.token, method: "POST", body: { token: expoPushToken } });
  assert.equal(learnerPushSave.status, 201);
  const pushOwner = await pool.query("SELECT user_id FROM push_subscriptions WHERE endpoint=$1", [expoPushToken]);
  assert.equal(Number(pushOwner.rows[0].user_id), learner.id);
  const pushTakeover = await request("/api/push/expo-subscriptions", { token: otherLearner.token, method: "POST", body: { token: expoPushToken } });
  assert.equal(pushTakeover.status, 409, "another account must not claim an existing Expo token");
  const pushOwnerAfterTakeover = await pool.query("SELECT user_id FROM push_subscriptions WHERE endpoint=$1", [expoPushToken]);
  assert.equal(Number(pushOwnerAfterTakeover.rows[0].user_id), learner.id, "push ownership must remain unchanged after takeover attempt");
  const learnerPushDelete = await request("/api/push/subscriptions", { token: learner.token, method: "DELETE", body: { endpoint: expoPushToken } });
  assert.equal(learnerPushDelete.status, 200);
  console.log("PUSH_SUBSCRIPTION_OWNERSHIP_E2E: PASS (register, cross-account takeover denied, owner retained, owner delete)");

  // Broadcast notification reads are private per user; one learner cannot clear another learner's unread state.
  const broadcastNotification = await pool.query("INSERT INTO notifications (title,message,type,recipient_id,is_read) VALUES ($1,$2,$3,NULL,false) RETURNING id", ["PR84 Broadcast Read Isolation", "CI-only broadcast", "system"]);
  const broadcastId = Number(broadcastNotification.rows[0].id);
  const learnerBroadcastRead = await request("/api/notifications/" + broadcastId + "/read", { token: learner.token, method: "PATCH", body: {} });
  assert.equal(learnerBroadcastRead.status, 200);
  assert.equal(learnerBroadcastRead.data.isRead, true);
  const learnerNotificationList = await request("/api/notifications", { token: learner.token });
  assert.equal(learnerNotificationList.data.find(item => Number(item.id) === broadcastId).isRead, true);
  const otherNotificationList = await request("/api/notifications", { token: otherLearner.token });
  assert.equal(otherNotificationList.data.find(item => Number(item.id) === broadcastId).isRead, false, "broadcast read receipts must not leak across accounts");
  const broadcastReceiptCount = await pool.query("SELECT count(*)::int AS count FROM notification_reads WHERE notification_id=$1", [broadcastId]);
  assert.equal(broadcastReceiptCount.rows[0].count, 1);
  console.log("BROADCAST_NOTIFICATION_READ_ISOLATION_E2E: PASS (per-user read receipt and independent unread state)");

  // Admin is not an Owner alias: catalogue creation and direct award authority stay Owner-only.
  const adminAchievementAttempt = await request("/api/achievements", { token: adminToken, method: "POST", body: { name: "PR84 Admin Award " + suffix, description: "CI admin privilege-boundary test", pointsValue: 5 } });
  assert.equal(adminAchievementAttempt.status, 403, "Admin must not inherit Owner achievement creation authority");
  const ownerAchievement = await request("/api/achievements", { token: ownerToken, method: "POST", body: { name: "PR84 Owner Award " + suffix, description: "CI-only Owner achievement", pointsValue: 5 } });
  assert.equal(ownerAchievement.status, 201, "Owner retains achievement creation access");
  const seniorAchievement = await request("/api/achievements", { token: ownerToken, method: "POST", body: { name: "PR84 Senior Award " + suffix, description: "CI-only manager-tier achievement", pointsValue: 7 } });
  assert.equal(seniorAchievement.status, 201, "Owner creates the isolated test achievement for Senior Manager review");
  const adminDirectAwardAttempt = await request("/api/achievements/award", { token: adminToken, method: "POST", body: { userId: learner.id, achievementId: ownerAchievement.data.id, note: "CI admin must not directly award" } });
  assert.equal(adminDirectAwardAttempt.status, 403, "Admin must not inherit Owner direct-award authority");
  const ownerAward = await request("/api/achievements/award", { token: ownerToken, method: "POST", body: { userId: learner.id, achievementId: ownerAchievement.data.id, note: "CI Owner award" } });
  assert.equal(ownerAward.status, 201, "Owner retains direct award authority");

  const concurrentAchievement = await request("/api/achievements", { token: ownerToken, method: "POST", body: { name: "PR84 Concurrent Award " + suffix, description: "CI-only concurrent award test", pointsValue: 11 } });
  assert.equal(concurrentAchievement.status, 201);
  const beforeConcurrentAward = await pool.query("SELECT badge_count,performance_score FROM users WHERE id=$1", [learner.id]);
  const concurrentDirectAwards = await Promise.all([1,2].map(() => request("/api/achievements/award", { token: ownerToken, method: "POST", body: { userId: learner.id, achievementId: concurrentAchievement.data.id, note: "CI concurrent direct award" } })));
  assert.deepEqual(concurrentDirectAwards.map(row => row.status).sort(), [201,409], "concurrent owner awards must create exactly one award");
  const concurrentAwardRows = await pool.query("SELECT count(*)::int AS count FROM user_achievements WHERE user_id=$1 AND achievement_id=$2", [learner.id, concurrentAchievement.data.id]);
  assert.equal(concurrentAwardRows.rows[0].count, 1, "concurrent direct award must not duplicate the award row");
  const afterConcurrentAward = await pool.query("SELECT badge_count,performance_score FROM users WHERE id=$1", [learner.id]);
  assert.equal(Number(afterConcurrentAward.rows[0].badge_count), Number(beforeConcurrentAward.rows[0].badge_count) + 1, "concurrent award increments badge count once");
  assert.equal(Number(afterConcurrentAward.rows[0].performance_score), Number(beforeConcurrentAward.rows[0].performance_score) + 11, "concurrent award increments points once");

  const adminAwardNonLearner = await request("/api/achievements/award", { token: ownerToken, method: "POST", body: { userId: managerId, achievementId: ownerAchievement.data.id } });
  assert.equal(adminAwardNonLearner.status, 404, "owner direct awards must target active learners only");
  const adminAwardInactiveBadge = await request("/api/achievements/award", { token: ownerToken, method: "POST", body: { userId: learner.id, achievementId: 999999 } });
  assert.equal(adminAwardInactiveBadge.status, 404, "owner direct awards must use an active achievement");

  const juniorDirectAward = await request("/api/achievements/award", { token: managerToken, method: "POST", body: { userId: otherLearner.id, achievementId: seniorAchievement.data.id, note: "CI direct junior award must be blocked" } });
  assert.equal(juniorDirectAward.status, 403, "junior managers must not bypass senior approval");
  const juniorRecommendationDeniedBeforeGrant = await request("/api/achievements/award/recommendations", { token: managerToken, method: "POST", body: { userId: otherLearner.id, achievementId: seniorAchievement.data.id, note: "CI ungranted junior recommendation" } });
  assert.equal(juniorRecommendationDeniedBeforeGrant.status, 403, "Junior award recommendation is denied until individually granted");
  const juniorRecommendationGrant = await request("/api/manager-permissions/" + managerId, { token: ownerToken, method: "PUT", body: { permissions: [{ key: "achievements.recommend", granted: true }] } });
  assert.equal(juniorRecommendationGrant.status, 200, "Owner must explicitly grant Junior award recommendation access");
  const juniorRecommendation = await request("/api/achievements/award/recommendations", { token: managerToken, method: "POST", body: { userId: otherLearner.id, achievementId: seniorAchievement.data.id, note: "CI junior recommendation" } });
  assert.equal(juniorRecommendation.status, 201, "junior manager should be able to recommend an award");
  assert.equal(juniorRecommendation.data.status, "pending_senior_review");
  const duplicateRecommendation = await request("/api/achievements/award/recommendations", { token: managerToken, method: "POST", body: { userId: otherLearner.id, achievementId: seniorAchievement.data.id, note: "Duplicate recommendation" } });
  assert.equal(duplicateRecommendation.status, 409, "duplicate pending recommendations must be rejected");
  const juniorSelfApproval = await request("/api/achievements/award/recommendations/" + juniorRecommendation.data.id + "/review", { token: managerToken, method: "POST", body: { status: "approved" } });
  assert.equal(juniorSelfApproval.status, 403, "junior managers cannot approve recommendations");
  const seniorRecommendationViewGrant = await request("/api/manager-permissions/" + seniorManagerId, {
    token: ownerToken, method: "PUT", body: { permissions: [{ key: "achievements.view", granted: true }] },
  });
  assert.equal(seniorRecommendationViewGrant.status, 200, "Owner must explicitly grant this Senior Manager recommendation visibility");
  const pendingForSenior = await request("/api/achievements/award/recommendations", { token: seniorManagerToken });
  assert.equal(pendingForSenior.status, 200, "explicitly authorized Senior Manager can view pending achievement recommendations: " + JSON.stringify(pendingForSenior.data));
  assert(Array.isArray(pendingForSenior.data.items), "recommendation queue returns an items array");
  assert(pendingForSenior.data.items.some(row => Number(row.id) === Number(juniorRecommendation.data.id)), "senior manager must see pending recommendations");
  const seniorManagerAward = await request("/api/achievements/award/recommendations/" + juniorRecommendation.data.id + "/review", { token: seniorManagerToken, method: "POST", body: { status: "approved", note: "CI senior approval" } });
  assert.equal(seniorManagerAward.status, 200, "senior manager should approve a junior recommendation");
  assert.equal(seniorManagerAward.data.recommendation.status, "approved");
  assert.equal(Number(seniorManagerAward.data.award.awarded_by), seniorManagerId, "final award attribution must identify the senior approver");
  const repeatSeniorApproval = await request("/api/achievements/award/recommendations/" + juniorRecommendation.data.id + "/review", { token: seniorManagerToken, method: "POST", body: { status: "approved" } });
  assert.equal(repeatSeniorApproval.status, 404, "approved recommendations cannot be approved twice");
  const learnerAwards = await request("/api/achievements/user/" + learner.id, { token: learner.token });
  assert(learnerAwards.data.some(row => Number(row.achievementId) === Number(ownerAchievement.data.id)));
  const otherLearnerAwards = await request("/api/achievements/user/" + otherLearner.id, { token: otherLearner.token });
  assert(otherLearnerAwards.data.some(row => Number(row.achievementId) === Number(seniorAchievement.data.id)), "approved recommendation must publish the learner award");
  const awardedScore = await pool.query("SELECT badge_count,performance_score FROM users WHERE id=$1", [otherLearner.id]);
  assert.equal(Number(awardedScore.rows[0].badge_count), 1, "badge count increments only after senior approval");
  assert.equal(Number(awardedScore.rows[0].performance_score), 7, "points increment only after senior approval");
  console.log("ACHIEVEMENT_APPROVAL_HIERARCHY_E2E: PASS (junior recommendation, no direct award, duplicate protection, senior-only approval, attribution, idempotency, learner publication, points)");

  // Daily app-access attendance: authenticated open creates one row; repeated opens increment
  // activity without duplicating the per-user/per-local-date record. Use an explicit IANA zone.
  const attendanceOpen1 = await request("/api/daily-attendance/open", {
    token: learner.token, method: "POST", body: { timeZone: "Africa/Harare", source: "web" },
  });
  assert.equal(attendanceOpen1.status, 200, "authenticated app open should record daily attendance");
  assert.equal(attendanceOpen1.data.status, "present");
  assert.equal(Number(attendanceOpen1.data.open_count), 1);
  const attendanceOpen2 = await request("/api/daily-attendance/open", {
    token: learner.token, method: "POST", body: { timeZone: "Africa/Harare", source: "android" },
  });
  assert.equal(attendanceOpen2.status, 200, "repeated app open should update daily activity");
  assert.equal(Number(attendanceOpen2.data.open_count), 2);
  assert.equal(attendanceOpen2.data.time_zone, "Africa/Harare");
  const attendanceRows = await pool.query(
    "SELECT count(*)::int AS row_count, max(open_count)::int AS open_count FROM daily_app_attendance WHERE user_id=$1 AND attendance_date=$2::date",
    [learner.id, attendanceOpen2.data.attendance_date],
  );
  assert.equal(attendanceRows.rows[0].row_count, 1, "repeated opens must not create duplicate daily records");
  assert.equal(attendanceRows.rows[0].open_count, 2);
  const attendanceMe = await request("/api/daily-attendance/me", { token: learner.token });
  assert.equal(attendanceMe.status, 200);
  assert(attendanceMe.data.records.some(record => String(record.attendance_date).slice(0, 10) === attendanceOpen2.data.attendance_date));
  const classAttendanceMe = await request("/api/attendance/my", { token: learner.token });
  assert.equal(classAttendanceMe.status, 200, "class attendance history must read the authenticated currentUser identity");
  assert(Array.isArray(classAttendanceMe.data), "class attendance history must return the learner's saved rows");
  const attendanceUnauthenticated = await request("/api/daily-attendance/me");
  assert.equal(attendanceUnauthenticated.status, 401, "daily attendance history must require authentication");
  const attendanceStaffToday = await request("/api/daily-attendance/today", { token: ownerToken });
  assert.equal(attendanceStaffToday.status, 200, "authorized staff should see today's access register");
  assert(attendanceStaffToday.data.records.some(record => Number(record.user_id) === learner.id && record.status === "present" && Number(record.open_count) === 2));
  const invalidAttendanceZone = await request("/api/daily-attendance/open", {
    token: learner.token, method: "POST", body: { timeZone: "Not/A_Real_Zone", source: "web" },
  });
  assert.equal(invalidAttendanceZone.status, 400, "invalid time zones must be rejected");
  console.log("DAILY_APP_ATTENDANCE_E2E: PASS (timezone, present status, duplicate prevention, repeated-open count, authenticated history, staff register, invalid-zone rejection)");

  // Transfer approval must receive the exact document preview the learner submitted, including validated image attachments.
  const transferImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/j+UAAAAASUVORK5CYII=";
  const transferSubmission = await request("/api/academic-records/transfer-requests", {
    token: learner.token, method: "POST",
    body: { reason: "Family relocation: learner is moving to a new district.", formData: {
      learnerName: "PR84 Transfer Preview Learner", currentSchool: "Test Primary School",
      receivingSchool: "New District School", grade: "Form 3", academicYear: "2026",
      guardianName: "PR84 Test Guardian", guardianPhone: "+263700000000",
      reasonDetail: "The family is relocating to a different district.",
      schoolLogoDataUrl: transferImage, guardianSignatureDataUrl: transferImage,
      headmasterSignatureDataUrl: transferImage,
    } },
  });
  assert.equal(transferSubmission.status, 201, "learner transfer letter with compressed images must save");
  const ownerTransferQueue = await request("/api/academic-records/transfer-requests", { token: ownerToken });
  assert.equal(ownerTransferQueue.status, 200, "Owner can open the transfer approval queue");
  const submittedTransferLetter = ownerTransferQueue.data.find(item => Number(item.id) === Number(transferSubmission.data.id));
  assert(submittedTransferLetter, "Owner queue must contain the submitted transfer letter");
  assert.equal(submittedTransferLetter.form_data.schoolLogoDataUrl, transferImage, "approval queue must return the exact submitted school logo");
  assert.equal(submittedTransferLetter.form_data.guardianSignatureDataUrl, transferImage, "approval queue must return the exact submitted guardian signature");
  assert.equal(submittedTransferLetter.form_data.headmasterSignatureDataUrl, transferImage, "approval queue must return the exact submitted headmaster signature");

  // Earlier hierarchy tests deliberately granted this same fixture a reject capability;
  // reset both transfer grants so this isolated matrix starts from explicit deny.
  await pool.query(
    "INSERT INTO manager_permission_grants(manager_user_id,permission_key,granted,changed_by) VALUES($1,'transfers.view',false,$2),($1,'transfers.reject',false,$2),($1,'transfers.approve',false,$2) ON CONFLICT(manager_user_id,permission_key) DO UPDATE SET granted=false,changed_by=EXCLUDED.changed_by,changed_at=now()",
    [managerId, ownerId],
  );
  const juniorTransferQueueBeforeGrant = await request("/api/academic-records/transfer-requests", { token: managerToken });
  assert.equal(juniorTransferQueueBeforeGrant.status, 403, "Junior Manager cannot see transfer letters without an explicit view grant");
  const juniorTransferViewGrant = await request("/api/manager-permissions/" + managerId, { token: ownerToken, method: "PUT", body: { permissions: [{ key: "transfers.view", granted: true }] } });
  assert.equal(juniorTransferViewGrant.status, 200, "Owner can grant transfer viewing to a Junior Manager independently");
  const juniorTransferQueue = await request("/api/academic-records/transfer-requests", { token: managerToken });
  assert.equal(juniorTransferQueue.status, 200, "Junior Manager can view transfer letters after explicit grant");
  assert(juniorTransferQueue.data.some(item => Number(item.id) === Number(transferSubmission.data.id)), "granted Junior Manager sees the complete learner transfer request");
  const juniorTransferApprovalGrant = await request("/api/manager-permissions/" + managerId, { token: ownerToken, method: "PUT", body: { permissions: [{ key: "transfers.approve", granted: true }] } });
  assert.equal(juniorTransferApprovalGrant.status, 200, "Owner can separately grant transfer approval to a Junior Manager");
  const juniorApprovalTransferFixture = await createTransferFixture("separate junior approve grant");
  const juniorTransferApproveAttempt = await request("/api/academic-records/transfer-requests/" + juniorApprovalTransferFixture + "/review", { token: managerToken, method: "POST", body: { status: "approved", note: "Approval explicitly granted separately from rejection." } });
  assert.equal(juniorTransferApproveAttempt.status, 200, "Junior Manager can approve only with the separate transfers.approve grant");
  const juniorTransferApproveRevocation = await request("/api/manager-permissions/" + managerId, { token: ownerToken, method: "PUT", body: { permissions: [{ key: "transfers.approve", granted: false }] } });
  assert.equal(juniorTransferApproveRevocation.status, 200, "Owner can revoke Junior transfer approval independently");
  const juniorTransferRejectWithoutGrant = await request("/api/academic-records/transfer-requests/" + transferSubmission.data.id + "/review", { token: managerToken, method: "POST", body: { status: "rejected", note: "Reject permission is not granted yet." } });
  assert.equal(juniorTransferRejectWithoutGrant.status, 403, "View permission does not implicitly grant transfer rejection");
  const juniorTransferRejectGrant = await request("/api/manager-permissions/" + managerId, { token: ownerToken, method: "PUT", body: { permissions: [{ key: "transfers.reject", granted: true }] } });
  assert.equal(juniorTransferRejectGrant.status, 200, "Owner can grant transfer rejection separately to a Junior Manager");
  const juniorTransferReject = await request("/api/academic-records/transfer-requests/" + transferSubmission.data.id + "/review", { token: managerToken, method: "POST", body: { status: "rejected", note: "Transfer documents require correction before resubmission." } });
  assert.equal(juniorTransferReject.status, 200, "Junior Manager with explicit reject permission can reject with a recorded reason");

  const seniorTransferSubmission = await request("/api/academic-records/transfer-requests", {
    token: otherLearner.token, method: "POST",
    body: { reason: "Family relocation: senior approval test.", formData: {
      learnerName: "PR84 Senior Transfer Learner", currentSchool: "Old School",
      receivingSchool: "New School", grade: "Form 2",
      guardianName: "Senior Test Guardian", guardianPhone: "+263700000002",
      reasonDetail: "Relocation verified for senior approval test.",
    } },
  });
  assert.equal(seniorTransferSubmission.status, 201, "second learner can submit an independent transfer request");
  // The earlier senior capability catalogue test granted this same fixture transfer visibility.
  // Reset it here so the following assertion genuinely checks default deny.
  await pool.query(
    "INSERT INTO manager_permission_grants(manager_user_id,permission_key,granted,changed_by) VALUES($1,'transfers.view',false,$2),($1,'transfers.approve',false,$2) ON CONFLICT(manager_user_id,permission_key) DO UPDATE SET granted=false,changed_by=EXCLUDED.changed_by,changed_at=now()",
    [seniorManagerId, ownerId],
  );
  const seniorTransferQueueWithoutGrant = await request("/api/academic-records/transfer-requests", { token: seniorManagerToken });
  assert.equal(seniorTransferQueueWithoutGrant.status, 403, "Senior Manager cannot see transfer letters without an explicit view grant");
  const seniorTransferViewGrant = await request("/api/manager-permissions/" + seniorManagerId, { token: ownerToken, method: "PUT", body: { permissions: [{ key: "transfers.view", granted: true }] } });
  assert.equal(seniorTransferViewGrant.status, 200, "Owner can grant Senior Manager transfer visibility independently");
  const seniorTransferApproveGrant = await request("/api/manager-permissions/" + seniorManagerId, { token: ownerToken, method: "PUT", body: { permissions: [{ key: "transfers.approve", granted: true }] } });
  assert.equal(seniorTransferApproveGrant.status, 200, "Owner can grant Senior Manager transfer approval independently");
  const seniorTransferApproval = await request("/api/academic-records/transfer-requests/" + seniorTransferSubmission.data.id + "/review", { token: seniorManagerToken, method: "POST", body: { status: "approved" } });
  assert.equal(seniorTransferApproval.status, 200, "Senior Manager with explicit view and approve grants can approve a transfer letter");
  const transferredLearnerRole = await pool.query("SELECT role,teacher_application_status FROM users WHERE id=$1", [otherLearner.id]);
  assert.equal(transferredLearnerRole.rows[0].role, "student", "approving a learner school-transfer letter must not silently convert the learner into a teacher");
  assert.notEqual(transferredLearnerRole.rows[0].teacher_application_status, "approved", "teacher authorization remains exclusive to the teacher CV approval workflow");
  console.log("TRANSFER_REVIEW_ROLE_MATRIX_E2E: PASS (Junior and Senior approve/reject only with separate explicit grants, Owner authority, learner role remains learner)");

  const invalidTransferImage = await request("/api/academic-records/transfer-requests", {
    token: otherLearner.token, method: "POST",
    body: { reason: "Other: image validation check.", formData: {
      learnerName: "Invalid Image Learner", receivingSchool: "Test School",
      guardianName: "Test Guardian", guardianPhone: "+263700000001",
      reasonDetail: "Image type must be restricted.", schoolLogoDataUrl: "data:image/svg+xml;base64,PHN2Zz4=",
    } },
  });
  assert.equal(invalidTransferImage.status, 400, "transfer letters must reject unsupported image data types");

  // Payment ledger reads must remain separate from payout preferences and scoped to the authenticated learner.
  const paymentSeed = await pool.query(
    "INSERT INTO payments (student_id,student_name,amount,month,year,status,notes,recorded_by) VALUES ($1,$2,'25.00','October',2026,'pending',$3,$4) RETURNING id",
    [learner.id, "PR84 Integration Learner", "CI-only payment ledger row " + suffix, learner.id],
  );
  const paymentId = Number(paymentSeed.rows[0].id);
  const ownPayments = await request("/api/payments", { token: learner.token });
  assert.equal(ownPayments.status, 200);
  assert(ownPayments.data.some(item => Number(item.id) === paymentId), "learner should see their saved payment ledger row");
  assert(ownPayments.data.every(item => Number(item.studentId ?? item.student_id) === learner.id), "payment list must never include another learner's rows");
  const otherPayments = await request("/api/payments", { token: otherLearner.token });
  assert.equal(otherPayments.status, 200);
  assert.equal(otherPayments.data.some(item => Number(item.id) === paymentId), false, "another learner must not see this payment in their list");
  const ownPaymentById = await request("/api/payments/" + paymentId, { token: learner.token });
  assert.equal(ownPaymentById.status, 200, "learner should be able to read their own payment record");
  const otherPaymentById = await request("/api/payments/" + paymentId, { token: otherLearner.token });
  assert.equal(otherPaymentById.status, 404, "learner must not read another learner's payment by ID");
  const ownerPaymentById = await request("/api/payments/" + paymentId, { token: ownerToken });
  assert.equal(ownerPaymentById.status, 200, "authorized staff should retain payment review access");
  const paypalStatus = await request("/api/payments/paypal/status");
  assert.equal(paypalStatus.status, 200);
  assert.equal(paypalStatus.data.configured, true, "PayPal readiness must use configured API credentials, webhook ID and public URLs");
  const paypalCountBefore = await pool.query("SELECT count(*)::int AS count FROM payments WHERE student_id=$1", [learner.id]);
  const paypalCrossLearnerCreate = await request("/api/payments/paypal/create", { token: otherLearner.token, method: "POST", body: { paymentId } });
  assert.equal(paypalCrossLearnerCreate.status, 409, "a learner cannot create a PayPal order against another learner's invoice");
  const paypalCreate = await request("/api/payments/paypal/create", { token: learner.token, method: "POST", body: { paymentId } });
  assert.equal(paypalCreate.status, 201, "PayPal checkout must create an order for the explicitly selected unpaid fee record");
  assert.equal(Number(paypalCreate.data.paymentId), paymentId, "PayPal must bind checkout to the selected invoice rather than an older unpaid invoice");
  assert.match(paypalCreate.data.checkoutUrl, /^https:\/\/paypal\.test\/approve\//);
  const paypalOrderId = new URL(paypalCreate.data.checkoutUrl).pathname.split("/").pop();
  const paypalCountAfter = await pool.query("SELECT count(*)::int AS count FROM payments WHERE student_id=$1", [learner.id]);
  assert.equal(paypalCountAfter.rows[0].count, paypalCountBefore.rows[0].count, "PayPal checkout must attach to an existing fee row, not create a duplicate invoice");
  const paypalCapture = await request("/api/payments/paypal/capture", { token: learner.token, method: "POST", body: { orderId: paypalOrderId } });
  assert.equal(paypalCapture.status, 200, "authenticated learner must be able to capture their approved PayPal order");
  assert.equal(paypalCapture.data.captured, true);
  const paypalWebhookHeaders = {
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-cert-url": "https://api-m.paypal.com/test-cert",
    "paypal-transmission-id": "pr84-paypal-fee-transmission",
    "paypal-transmission-sig": "mock-signature",
    "paypal-transmission-time": new Date().toISOString(),
  };
  const paypalWrongAmountWebhook = await request("/api/payments/paypal/webhook", {
    method: "POST", headers: paypalWebhookHeaders,
    body: {
      id: "mock-valid-signature",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        id: "MOCKCAPTURE" + paypalOrderId,
        amount: { currency_code: "USD", value: "24.99" },
        supplementary_data: { related_ids: { order_id: paypalOrderId } },
      },
    },
  });
  assert.equal(paypalWrongAmountWebhook.status, 400, "validly signed but wrong-amount PayPal events must be rejected");
  const paypalBeforeValidSettlement = await pool.query("SELECT status FROM payments WHERE id=$1", [paymentId]);
  assert.equal(paypalBeforeValidSettlement.rows[0].status, "pending", "a wrong-amount PayPal event must not settle the fee");
  const paypalWebhook = await request("/api/payments/paypal/webhook", {
    method: "POST", headers: paypalWebhookHeaders,
    body: {
      id: "mock-valid-signature",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        id: "MOCKCAPTURE" + paypalOrderId,
        amount: { currency_code: "USD", value: "25.00" },
        supplementary_data: { related_ids: { order_id: paypalOrderId } },
      },
    },
  });
  assert.equal(paypalWebhook.status, 200, "valid PayPal capture webhook should be accepted; response=" + JSON.stringify(paypalWebhook.data));
  assert.equal(paypalWebhook.data.updated, true, "verified PayPal capture must settle the exact linked fee row");
  const paypalSettled = await pool.query("SELECT status,notes FROM payments WHERE id=$1", [paymentId]);
  assert.equal(paypalSettled.rows[0].status, "paid");
  assert.match(paypalSettled.rows[0].notes, /PayPal verified capture/);
  const paypalTransactionLink = await pool.query("SELECT payment_id,provider_order_id,provider_capture_id,status FROM payment_transactions WHERE provider='paypal' AND provider_order_id=$1", [paypalOrderId]);
  assert.equal(Number(paypalTransactionLink.rows[0].payment_id), paymentId, "stored PayPal order must reference the exact invoice");
  assert.equal(paypalTransactionLink.rows[0].provider_capture_id, "MOCKCAPTURE" + paypalOrderId);
  assert.equal(paypalTransactionLink.rows[0].status, "paid");
  const paypalDuplicateWebhook = await request("/api/payments/paypal/webhook", {
    method: "POST", headers: paypalWebhookHeaders,
    body: {
      id: "mock-valid-signature",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        id: "MOCKCAPTURE" + paypalOrderId,
        amount: { currency_code: "USD", value: "25.00" },
        supplementary_data: { related_ids: { order_id: paypalOrderId } },
      },
    },
  });
  assert.equal(paypalDuplicateWebhook.status, 200);
  assert.equal(paypalDuplicateWebhook.data.updated, false, "duplicate PayPal webhook must not re-settle a fee row");
  const paypalInvalidWebhook = await request("/api/payments/paypal/webhook", {
    method: "POST", headers: paypalWebhookHeaders,
    body: {
      id: "mock-invalid-signature",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        id: "MOCKCAPTURE" + paypalOrderId,
        amount: { currency_code: "USD", value: "25.00" },
        supplementary_data: { related_ids: { order_id: paypalOrderId } },
      },
    },
  });
  assert.equal(paypalInvalidWebhook.status, 401, "invalid PayPal webhook signatures must be rejected");
  const paypalAudit = await pool.query("SELECT outcome,signature_verified FROM payment_provider_webhook_audit WHERE provider='paypal' AND order_id=$1 ORDER BY id", [paypalOrderId]);
  assert(paypalAudit.rows.some(row => row.outcome === "rejected" && row.signature_verified), "signed amount mismatches must be audited as rejected");
  assert(paypalAudit.rows.some(row => row.outcome === "accepted" && row.signature_verified), "accepted PayPal captures must be audited");
  assert(paypalAudit.rows.some(row => row.outcome === "duplicate" && row.signature_verified), "duplicate PayPal captures must be audited without a second settlement");
  assert(paypalAudit.rows.some(row => row.outcome === "signature_invalid" && !row.signature_verified), "invalid webhook signatures must be audited");
  console.log("PAYPAL_SCHOOL_FEE_E2E_MOCK_PROVIDER:", JSON.stringify({
    configured: paypalStatus.data.configured,
    checkout: paypalCreate.status,
    captured: paypalCapture.data.captured,
    webhookUpdated: paypalWebhook.data.updated,
    duplicateWebhookUpdated: paypalDuplicateWebhook.data.updated,
    invalidSignature: paypalInvalidWebhook.status,
    existingFeeRowSettled: paypalSettled.rows[0].status,
    provider: "isolated CI mock; not a real PayPal payment",
  }));

  // Owner publishes a reference fee and issues the actual learner-specific invoice.
  const publishFee = await request("/api/settings", { token: ownerToken, method: "PATCH", body: { school_fee_amount: "18.75" } });
  assert.equal(publishFee.status, 200, "Owner must be able to publish the standard school fee");
  const learnerFeeSettings = await request("/api/settings", { token: learner.token });
  assert.equal(learnerFeeSettings.data.school_fee_amount, "18.75", "learners must see the published school fee");
  const invalidFeeSetting = await request("/api/settings", { token: ownerToken, method: "PATCH", body: { school_fee_amount: "-5" } });
  assert.equal(invalidFeeSetting.status, 400, "Owner fee setting must reject negative amounts");
  const ownerFeeInvoice = await request("/api/payments", {
    token: ownerToken, method: "POST",
    body: { studentId: learner.id, amount: 18.75, month: "November", year: 2026, status: "pending", notes: "CI-only Owner-issued fee invoice " + suffix },
  });
  assert.equal(ownerFeeInvoice.status, 201, "Owner must be able to issue a fee invoice to an individual learner");
  const paynowPaymentId = Number(ownerFeeInvoice.data.id);
  const paypalPartialCreate = await request("/api/payments/paypal/create", { token: learner.token, method: "POST", body: { paymentId: Number(ownerFeeInvoice.data.id), amount: 0.02 } });
  assert.equal(paypalPartialCreate.status, 201, "PayPal must support learner-selected partial fee payments");
  assert.equal(paypalPartialCreate.data.amount, 0.02);
  const paypalPartialOrderId = new URL(paypalPartialCreate.data.checkoutUrl).pathname.split("/").pop();
  const paypalPartialCapture = await request("/api/payments/paypal/capture", { token: learner.token, method: "POST", body: { orderId: paypalPartialOrderId } });
  assert.equal(paypalPartialCapture.status, 200);
  const paypalPartialWebhook = await request("/api/payments/paypal/webhook", {
    method: "POST", headers: { ...paypalWebhookHeaders, "paypal-transmission-id": "pr84-paypal-partial-" + suffix },
    body: { id:"mock-valid-signature", event_type:"PAYMENT.CAPTURE.COMPLETED", resource:{
      id:"MOCKCAPTURE"+paypalPartialOrderId, amount:{currency_code:"USD",value:"0.02"},
      supplementary_data:{related_ids:{order_id:paypalPartialOrderId}}
    }},
  });
  assert.equal(paypalPartialWebhook.status, 200);
  assert.equal(paypalPartialWebhook.data.updated, true, "verified PayPal installment must update the invoice");
  const paypalPartialLedger = await pool.query("SELECT status,amount_paid FROM payments WHERE id=$1", [Number(ownerFeeInvoice.data.id)]);
  assert.equal(paypalPartialLedger.rows[0].status, "partially_paid");
  assert.equal(Number(paypalPartialLedger.rows[0].amount_paid), 0.02);
  const paypalPartialDuplicate = await request("/api/payments/paypal/webhook", {
    method: "POST", headers: { ...paypalWebhookHeaders, "paypal-transmission-id": "pr84-paypal-partial-duplicate-" + suffix },
    body: { id:"mock-valid-signature", event_type:"PAYMENT.CAPTURE.COMPLETED", resource:{
      id:"MOCKCAPTURE"+paypalPartialOrderId, amount:{currency_code:"USD",value:"0.02"},
      supplementary_data:{related_ids:{order_id:paypalPartialOrderId}}
    }},
  });
  assert.equal(paypalPartialDuplicate.status, 200);
  assert.equal(paypalPartialDuplicate.data.updated, false, "duplicate PayPal installment callbacks must not double-credit the invoice");
  const paypalSecondInstallmentCreate = await request("/api/payments/paypal/create", { token: learner.token, method: "POST", body: { paymentId: Number(ownerFeeInvoice.data.id), amount: 0.01 } });
  assert.equal(paypalSecondInstallmentCreate.status, 201, "a successfully settled PayPal installment must release the same invoice for a later installment");
  const paypalSecondInstallmentOrderId = new URL(paypalSecondInstallmentCreate.data.checkoutUrl).pathname.split("/").pop();
  const paypalSecondInstallmentCapture = await request("/api/payments/paypal/capture", { token: learner.token, method: "POST", body: { orderId: paypalSecondInstallmentOrderId } });
  assert.equal(paypalSecondInstallmentCapture.status, 200);
  const paypalSecondInstallmentWebhook = await request("/api/payments/paypal/webhook", {
    method: "POST", headers: { ...paypalWebhookHeaders, "paypal-transmission-id": "pr84-paypal-second-installment-" + suffix },
    body: { id:"mock-valid-signature", event_type:"PAYMENT.CAPTURE.COMPLETED", resource:{
      id:"MOCKCAPTURE"+paypalSecondInstallmentOrderId, amount:{currency_code:"USD",value:"0.01"},
      supplementary_data:{related_ids:{order_id:paypalSecondInstallmentOrderId}}
    }},
  });
  assert.equal(paypalSecondInstallmentWebhook.status, 200);
  assert.equal(paypalSecondInstallmentWebhook.data.updated, true, "second PayPal installment must be credited to the same invoice");
  const manualFeeInvoice = await request("/api/payments", { token: ownerToken, method: "POST", body: { studentId: otherLearner.id, amount: 10, month: "November", year: 2026, status: "pending", notes: "CI-only manual payment invoice " + suffix } });
  assert.equal(manualFeeInvoice.status, 201);
  const manualPaymentId = Number(manualFeeInvoice.data.id);
  const learnerManualVerifyDenied = await request("/api/payments/" + manualPaymentId + "/manual-settlement", { token: learner.token, method: "POST", body: { amount: 2.5, method: "ecocash", providerReference: "ECO-" + suffix } });
  assert.equal(learnerManualVerifyDenied.status, 403, "learners cannot self-verify manual payment reports");
  const manualPartial = await request("/api/payments/" + manualPaymentId + "/manual-settlement", { token: ownerToken, method: "POST", body: { amount: 2.5, method: "ecocash", providerReference: "ECO-" + suffix } });
  assert.equal(manualPartial.status, 200, "Owner can verify an EcoCash/Econet installment against the existing invoice");
  assert.equal(manualPartial.data.status, "partially_paid");
  assert.equal(manualPartial.data.balance, 7.5);
  const manualDuplicate = await request("/api/payments/" + manualPaymentId + "/manual-settlement", { token: ownerToken, method: "POST", body: { amount: 2.5, method: "ecocash", providerReference: "ECO-" + suffix } });
  assert.equal(manualDuplicate.status, 409, "duplicate manual receipt references must not double-credit an invoice");
  const manualCashRemainder = await request("/api/payments/" + manualPaymentId + "/manual-settlement", { token: ownerToken, method: "POST", body: { amount: 8, method: "cash" } });
  assert.equal(manualCashRemainder.status, 200);
  assert.equal(manualCashRemainder.data.status, "paid");
  assert.equal(manualCashRemainder.data.credit, 0.5, "verified manual overpayment must remain visible as learner credit");
  const manualPaymentLedger = await request("/api/payments", { token: otherLearner.token });
  const manualLedgerRow = manualPaymentLedger.data.find(row => Number(row.id) === manualPaymentId);
  assert.equal(Number(manualLedgerRow.amountPaid), 10.5);
  assert.equal(Number(manualLedgerRow.credit), 0.5);
  const paynowCountBefore = await pool.query("SELECT count(*)::int AS count FROM payments WHERE student_id=$1", [learner.id]);
  const invalidPaynowAmount = await request("/api/payments/paynow/create", { token: learner.token, method: "POST", body: { amount: 0 } });
  assert.equal(invalidPaynowAmount.status, 400, "Paynow must reject zero-value checkout attempts");
  const paynowCreate = await request("/api/payments/paynow/create", { token: learner.token, method: "POST", body: { paymentId: paynowPaymentId, amount: 0.01 } });
  assert.equal(paynowCreate.status, 201, "Paynow checkout must initialize against an existing unpaid fee row");
  assert.match(paynowCreate.data.checkoutUrl, /^https:\/\/paynow\.test\/checkout\//);
  assert.match(paynowCreate.data.reference, /^DL-\d+-\d+-[a-f0-9]{8}$/i);
  const providerCaptureRows = readFileSync(process.env.MOCK_PROVIDER_CAPTURE || "/tmp/dallyletter-provider-capture.jsonl", "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
  const paynowProviderCall = providerCaptureRows.find(item => item.provider === "paynow" && item.fields?.reference === paynowCreate.data.reference);
  assert(paynowProviderCall, "Paynow checkout request must reach the isolated provider mock");
  assert.equal(paynowProviderCall.fields.amount, "0.01", "Paynow provider request must use the learner's explicitly selected partial amount");
  const paynowCountAfter = await pool.query("SELECT count(*)::int AS count FROM payments WHERE student_id=$1", [learner.id]);
  assert.equal(paynowCountAfter.rows[0].count, paynowCountBefore.rows[0].count, "Paynow must not create a duplicate invoice");
  const paynowFeeBeforeCallback = await pool.query("SELECT amount,status,notes FROM payments WHERE id=$1", [paynowPaymentId]);
  assert.equal(Number(paynowFeeBeforeCallback.rows[0].amount), 18.75, "The learner-selected checkout amount must not alter the authoritative invoice total");
  assert.equal(paynowFeeBeforeCallback.rows[0].status, "pending");
  const makePaynowHash = (values) => crypto.createHash("sha512")
    .update(Object.entries(values).filter(([key]) => key.toLowerCase() !== "hash").map(([, value]) => value ?? "").join("") + "pr84-ci-paynow-integration-key", "utf8")
    .digest("hex").toUpperCase();
  const paynowCallback = { reference: paynowCreate.data.reference, amount: "0.01", status: "Paid" };
  const invalidPaynowCallback = await request("/api/payments/paynow/result", { method: "POST", body: { ...paynowCallback, hash: "0".repeat(128) } });
  assert.equal(invalidPaynowCallback.status, 400, "Paynow must reject an invalid callback hash");
  const wrongAmountPaynow = { ...paynowCallback, amount: "18.76" };
  const wrongAmountPaynowResult = await request("/api/payments/paynow/result", { method: "POST", body: { ...wrongAmountPaynow, hash: makePaynowHash(wrongAmountPaynow) } });
  assert.equal(wrongAmountPaynowResult.status, 400, "Paynow must reject a signed callback with the wrong amount");
  const feeAfterWrongCallback = await pool.query("SELECT status,notes FROM payments WHERE id=$1", [paynowPaymentId]);
  assert.equal(feeAfterWrongCallback.rows[0].status, "pending", "a signed callback with the wrong amount must not settle the invoice");
  assert.doesNotMatch(feeAfterWrongCallback.rows[0].notes, /Paynow callback: paid/i, "a mismatched callback must not append a paid event");
  const validPaynowResult = await request("/api/payments/paynow/result", { method: "POST", body: { ...paynowCallback, hash: makePaynowHash(paynowCallback) } });
  assert.equal(validPaynowResult.status, 200, "Paynow must accept a correctly signed, amount-matched callback");
  const paynowSettled = await pool.query("SELECT status,amount_paid,notes FROM payments WHERE id=$1", [paynowPaymentId]);
  assert.equal(paynowSettled.rows[0].status, "partially_paid", "a verified partial Paynow payment must leave the remaining invoice balance open");
  assert.equal(Number(paynowSettled.rows[0].amount_paid), 0.04, "two PayPal installments and one Paynow installment must accumulate against the same invoice");
  assert.match(paynowSettled.rows[0].notes, /Paynow verified payment/);
  const learnerLedgerAfterPartial = await request("/api/payments", { token: learner.token });
  const partialLedgerRow = learnerLedgerAfterPartial.data.find(row => Number(row.id) === paynowPaymentId);
  assert.equal(Number(partialLedgerRow.amountPaid), 0.04, "learner ledger must expose all verified partial installments");
  assert.equal(Number(partialLedgerRow.balance), 18.71, "learner ledger must expose the remaining fee balance after both providers settle");
  const duplicatePaynowResult = await request("/api/payments/paynow/result", { method: "POST", body: { ...paynowCallback, hash: makePaynowHash(paynowCallback) } });
  assert.equal(duplicatePaynowResult.status, 200, "duplicate signed Paynow callbacks must be idempotent");
  const paynowAfterDuplicate = await pool.query("SELECT status,amount_paid FROM payments WHERE id=$1", [paynowPaymentId]);
  assert.equal(paynowAfterDuplicate.rows[0].status, "partially_paid");
  assert.equal(Number(paynowAfterDuplicate.rows[0].amount_paid), 0.03, "duplicate callbacks must not add the same partial payment twice");
  const overpayCreate = await request("/api/payments/paynow/create", { token: learner.token, method: "POST", body: { paymentId: paynowPaymentId, amount: 20 } });
  assert.equal(overpayCreate.status, 201, "learner may intentionally pay more than the remaining invoice balance");
  assert.equal(overpayCreate.data.amount, 20);
  const overpayCallback = { reference: overpayCreate.data.reference, amount: "20.00", status: "Paid" };
  const overpayResult = await request("/api/payments/paynow/result", { method: "POST", body: { ...overpayCallback, hash: makePaynowHash(overpayCallback) } });
  assert.equal(overpayResult.status, 200);
  const overpaidInvoice = await pool.query("SELECT status,amount,amount_paid FROM payments WHERE id=$1", [paynowPaymentId]);
  assert.equal(overpaidInvoice.rows[0].status, "paid");
  assert.equal(Number(overpaidInvoice.rows[0].amount_paid), 20.03, "excess verified funds must remain recorded as learner credit");
  assert.equal(Number(overpaidInvoice.rows[0].amount_paid)-Number(overpaidInvoice.rows[0].amount), 1.28);
  const learnerLedgerAfterOverpay = await request("/api/payments", { token: learner.token });
  const creditLedgerRow = learnerLedgerAfterOverpay.data.find(row => Number(row.id) === paynowPaymentId);
  assert.equal(Number(creditLedgerRow.credit), 1.28, "learner ledger must show excess verified funds as credit");
  const cancelledPaynowSeed = await pool.query(
    "INSERT INTO payments (student_id,student_name,amount,month,year,status,notes,recorded_by) VALUES ($1,$2,'7.50','December',2026,'overdue',$3,$4) RETURNING id",
    [learner.id, "PR84 Integration Learner", "CI-only retryable Paynow fee row " + suffix, learner.id],
  );
  const cancelledPaynowCreate = await request("/api/payments/paynow/create", { token: learner.token, method: "POST", body: {} });
  assert.equal(cancelledPaynowCreate.status, 201, "Paynow must allow checkout for an overdue fee row");
  const cancelledCallback = { reference: cancelledPaynowCreate.data.reference, amount: "7.50", status: "Cancelled" };
  const cancelledPaynowResult = await request("/api/payments/paynow/result", { method: "POST", body: { ...cancelledCallback, hash: makePaynowHash(cancelledCallback) } });
  assert.equal(cancelledPaynowResult.status, 200);
  const cancelledPaynowFee = await pool.query("SELECT status,notes FROM payments WHERE id=$1", [Number(cancelledPaynowSeed.rows[0].id)]);
  assert.equal(cancelledPaynowFee.rows[0].status, "overdue", "a cancelled checkout must not cancel the underlying unpaid fee");
  assert.doesNotMatch(cancelledPaynowFee.rows[0].notes, /Paynow reference DL-/, "cancelled checkout must release its reference so the learner can retry");
  const retryPaynowCreate = await request("/api/payments/paynow/create", { token: learner.token, method: "POST", body: {} });
  assert.equal(retryPaynowCreate.status, 201, "learner must be able to retry a cancelled Paynow checkout without a duplicate fee row");
  console.log("PAYNOW_SCHOOL_FEE_E2E_MOCK_PROVIDER:", JSON.stringify({
    configured: paynowReadiness.data.configured,
    checkout: paynowCreate.status,
    invalidSignature: invalidPaynowCallback.status,
    wrongAmount: wrongAmountPaynowResult.status,
    partialPayment: paynowSettled.rows[0].status,
    overpaymentCredit: Number(overpaidInvoice.rows[0].amount_paid)-Number(overpaidInvoice.rows[0].amount),
    duplicateCallback: duplicatePaynowResult.status,
    cancelledFeeStatus: cancelledPaynowFee.rows[0].status,
    retryCheckout: retryPaynowCreate.status,
    provider: "isolated CI mock; not a real Paynow payment",
  }));

  const teacherPayoutPreferences = await request("/api/users/me/payout-preferences", { token: teacherToken });
  assert.equal(teacherPayoutPreferences.status, 200, "eligible teachers should retain payout preference access");
  const learnerPayoutSave = await request("/api/users/me/payout-preferences", {
    token: learner.token, method: "PUT", body: { method: "paypal", paypal_email: "learner-payout@example.test" },
  });
  assert.equal(learnerPayoutSave.status, 200, "students may manage their own payout preference record");
  const learnerPayoutRead = await request("/api/users/me/payout-preferences", { token: learner.token });
  assert.equal(learnerPayoutRead.status, 200);
  assert.equal(learnerPayoutRead.data.method, "paypal");
  assert.match(learnerPayoutRead.data.destination_masked, /@example\.test$/);
  const ownerPayoutSave = await request("/api/users/me/payout-preferences", {
    token: ownerToken, method: "PUT", body: { method: "bank", bank_name: "CI Test Bank", account_name_holder: "PR84 Test Owner" },
  });
  assert.equal(ownerPayoutSave.status, 200, "Owner may manage their own payout preferences");
  assert.equal((await request("/api/users/me/payout-preferences", { token: ownerToken })).status, 200);
  assert.equal((await request("/api/users/me/payout-preferences", { token: pendingTeacherToken })).status, 403, "pending teachers must be denied payout preference reads");
  const pendingPayoutWrite = await request("/api/users/me/payout-preferences", {
    token: pendingTeacherToken, method: "PUT", body: { method: "paypal", paypal_email: "pending@example.test" },
  });
  assert.equal(pendingPayoutWrite.status, 403, "pending teachers must be denied payout preference writes");
  assert.equal(Array.isArray(teacherPayoutPreferences.data), false, "payout preferences must not be treated as a payment ledger");
  console.log("PAYOUT_PREFERENCES_E2E: PASS (student and Owner allowed, eligible teacher preserved, pending teacher denied, fee records separate)");
  // AI chat must remain useful when its optional interaction log is unavailable,
  // and model-generated text must never execute an administrative side effect.
  const previousAiSettings = await pool.query(
    "SELECT key,value FROM platform_settings WHERE key = ANY($1::text[])",
    [["ai_provider","gemini_api_key","openai_api_key","anthropic_api_key"]],
  );
  const previousAiSettingsByKey = new Map(previousAiSettings.rows.map(row => [row.key, row.value]));
  const mockProviderConfigured = await request("/api/ai/settings", {
    token: ownerToken, method: "POST", body: { provider: "mock" },
  });
  assert.equal(mockProviderConfigured.status, 200, "Owner can configure the isolated mock provider for AI safety tests");
  for (const [provider, key] of [
    ["gemini", "gemini_api_key"],
    ["openai", "openai_api_key"],
    ["anthropic", "anthropic_api_key"],
  ]) {
    const configured = await request("/api/ai/settings", {
      token: ownerToken, method: "POST", body: { provider, [key]: "mock-" + provider + "-key" },
    });
    assert.equal(configured.status, 200, "Owner can configure the isolated " + provider + " provider");
    const response = await request("/api/ai/chat", {
      token: ownerToken, method: "POST", body: { messages: [{ role: "user", content: "Say hello." }] },
    });
    assert.equal(response.status, 200, provider + " adapter must complete a mocked chat request: " + JSON.stringify(response.data));
    assert.equal(response.data.provider, provider);
    assert.equal(response.data.actionsExecuted, false);
  }

  const missingCredentialConfig = await request("/api/ai/settings", {
    token: ownerToken, method: "POST", body: { provider: "gemini", gemini_api_key: "" },
  });
  assert.equal(missingCredentialConfig.status, 200);
  const missingCredentialChat = await request("/api/ai/chat", {
    token: ownerToken, method: "POST", body: { messages: [{ role: "user", content: "Say hello." }] },
  });
  assert.equal(missingCredentialChat.status, 502);
  assert.equal(missingCredentialChat.data.code, "invalid_credentials");
  const missingCredentialStatus = await request("/api/ai/status", { token: ownerToken });
  assert.equal(missingCredentialStatus.status, 502, "AI status should safely classify missing configured credentials");

  const rateLimitedConfig = await request("/api/ai/settings", {
    token: ownerToken, method: "POST", body: { provider: "gemini", gemini_api_key: "mock-fail-429" },
  });
  assert.equal(rateLimitedConfig.status, 200);
  const rateLimitedChat = await request("/api/ai/chat", {
    token: ownerToken, method: "POST", body: { messages: [{ role: "user", content: "Say hello." }] },
  });
  assert.equal(rateLimitedChat.status, 429);
  assert.equal(rateLimitedChat.data.code, "rate_limited");
  assert(!JSON.stringify(rateLimitedChat.data).includes("SECRET_PROVIDER_BODY_AND_KEY"), "provider response body and key must never reach the client");

  const invalidCredentialConfig = await request("/api/ai/settings", {
    token: ownerToken, method: "POST", body: { provider: "openai", openai_api_key: "mock-fail-401" },
  });
  assert.equal(invalidCredentialConfig.status, 200);
  const invalidCredentialChat = await request("/api/ai/chat", {
    token: ownerToken, method: "POST", body: { messages: [{ role: "user", content: "Say hello." }] },
  });
  assert.equal(invalidCredentialChat.status, 502);
  assert.equal(invalidCredentialChat.data.code, "invalid_credentials");
  assert(!JSON.stringify(invalidCredentialChat.data).includes("SECRET_PROVIDER_BODY_AND_KEY"));
  const invalidCredentialModeration = await request("/api/content-flags/moderate", {
    token: ownerToken, method: "POST", body: { text: "Please review this suspicious message." },
  });
  assert.equal(invalidCredentialModeration.status, 502, "moderation endpoint must classify provider credential failures safely");
  assert.equal(invalidCredentialModeration.data.code, "invalid_credentials");
  assert(!JSON.stringify(invalidCredentialModeration.data).includes("SECRET_PROVIDER_BODY_AND_KEY"), "moderation endpoint must not expose provider response bodies or credentials");

  const timeoutConfig = await request("/api/ai/settings", {
    token: ownerToken, method: "POST", body: { provider: "anthropic", anthropic_api_key: "mock-timeout" },
  });
  assert.equal(timeoutConfig.status, 200);
  const timeoutChat = await request("/api/ai/chat", {
    token: ownerToken, method: "POST", body: { messages: [{ role: "user", content: "Say hello." }] },
  });
  assert.equal(timeoutChat.status, 504);
  assert.equal(timeoutChat.data.code, "timeout");

  const resetMockProvider = await request("/api/ai/settings", {
    token: ownerToken, method: "POST", body: { provider: "mock" },
  });
  assert.equal(resetMockProvider.status, 200);
  console.log("AI_PROVIDER_ADAPTERS_E2E: PASS (Gemini, OpenAI, Anthropic, 429, invalid credentials, timeout, safe response redaction)");

  const reminderCountBefore = await pool.query("SELECT count(*)::int AS count FROM notifications WHERE recipient_id IS NULL AND type='reminder'");
  const learnerAIChat = await request("/api/ai/chat", {
    token: learner.token, method: "POST",
    body: { messages: [{ role: "user", content: "Help me understand fractions." }] },
  });
  assert.equal(learnerAIChat.status, 200, "learners must be able to use friendly educational AI chat");
  assert.equal(learnerAIChat.data.mode, "learning");
  assert.equal(learnerAIChat.data.actionsExecuted, false);
  const learnerAgentDenied = await request("/api/ai/chat", {
    token: learner.token, method: "POST", body: { mode: "agent", messages: [{ role: "user", content: "Change another learner's account." }] },
  });
  assert.equal(learnerAgentDenied.status, 403, "learners must never access staff agent mode");
  const managerAgentDenied = await request("/api/ai/chat", {
    token: managerToken, method: "POST", body: { mode: "agent", messages: [{ role: "user", content: "Prepare a staff report." }] },
  });
  assert.equal(managerAgentDenied.status, 403, "managers must receive no AI agent capability without an individual Owner grant");
  const teacherAgentPlan = await request("/api/ai/chat", {
    token: teacherToken, method: "POST", body: { mode: "agent", messages: [{ role: "user", content: "Help me plan next week's lessons." }] },
  });
  assert.equal(teacherAgentPlan.status, 200, "active teachers may use role-scoped AI agent planning");
  assert.equal(teacherAgentPlan.data.mode, "agent");
  assert.equal(teacherAgentPlan.data.actionsExecuted, false, "agent planning must not bypass existing workflow confirmations");
  const ownerAgentPlan = await request("/api/ai/chat", {
    token: ownerToken, method: "POST",
    body: { mode: "agent", messages: [{ role: "user", content: "Prepare a platform-wide operational plan." }] },
  });
  assert.equal(ownerAgentPlan.status, 200, "Owner must have full ELIDEMS AI Agent access");
  assert.equal(ownerAgentPlan.data.mode, "agent");
  const aiChat = await request("/api/ai/chat", {
    token: ownerToken, method: "POST",
    body: { messages: [{ role: "user", content: "Send reminder to all learners now." }] },
  });
  assert.equal(aiChat.status, 200, "mock AI chat should return a successful response");
  assert.equal(aiChat.data.provider, "mock");
  assert.equal(aiChat.data.actionsExecuted, false, "AI output must not execute a consequential action");
  assert.equal(aiChat.data.consequentialActionsRequireExplicitConfirmation, true);
  assert.equal(typeof aiChat.data.requestId, "string", "AI chat response must include a correlation ID");
  const safeAiLog = await pool.query(
    "SELECT command,result FROM ai_actions WHERE performed_by=$1 AND action='ai_chat_response' ORDER BY id DESC LIMIT 1",
    [ownerId],
  );
  assert.equal(safeAiLog.rowCount, 1, "AI chat metadata should be recorded");
  assert.equal(safeAiLog.rows[0].command, "AI chat request", "raw user prompts must not be persisted in AI diagnostics");
  assert.equal(safeAiLog.rows[0].result, "Response generated successfully", "raw model responses must not be persisted in AI diagnostics");
  const reminderCountAfter = await pool.query("SELECT count(*)::int AS count FROM notifications WHERE recipient_id IS NULL AND type='reminder'");
  assert.equal(reminderCountAfter.rows[0].count, reminderCountBefore.rows[0].count, "AI-generated reminder wording must not create a broadcast notification");

  const triggerName = "ci_fail_ai_action_log_" + suffix;
  const functionName = "ci_fail_ai_action_log_fn_" + suffix;
  await pool.query(`CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN
    IF NEW.action = ''ai_chat_response'' THEN RAISE EXCEPTION ''CI injected AI interaction log failure''; END IF;
    RETURN NEW;
  END;'`);
  await pool.query(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON ai_actions FOR EACH ROW EXECUTE FUNCTION ${functionName}()`);
  try {
    const aiChatWithLogFailure = await request("/api/ai/chat", {
      token: ownerToken, method: "POST",
      body: { messages: [{ role: "user", content: "Explain how fractions work." }] },
    });
    assert.equal(aiChatWithLogFailure.status, 200, "database interaction-log failure must not turn a successful AI response into HTTP 500");
    assert.equal(aiChatWithLogFailure.data.actionsExecuted, false);
  } finally {
    await pool.query(`DROP TRIGGER IF EXISTS ${triggerName} ON ai_actions`);
    await pool.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
  }
  const restoreBody = {
    provider: previousAiSettingsByKey.get("ai_provider") ?? "mock",
    gemini_api_key: previousAiSettingsByKey.get("gemini_api_key") ?? "",
    openai_api_key: previousAiSettingsByKey.get("openai_api_key") ?? "",
    anthropic_api_key: previousAiSettingsByKey.get("anthropic_api_key") ?? "",
  };
  const restoreAiSettings = await request("/api/ai/settings", { token: ownerToken, method: "POST", body: restoreBody });
  assert.equal(restoreAiSettings.status, 200, "restore previous test database AI provider settings");
  for (const key of ["ai_provider","gemini_api_key","openai_api_key","anthropic_api_key"]) {
    if (!previousAiSettingsByKey.has(key)) await pool.query("DELETE FROM platform_settings WHERE key=$1", [key]);
  }
  await request("/api/ai/settings", { token: ownerToken, method: "POST", body: {} });
  console.log("AI_CHAT_SAFETY_E2E: PASS (mock provider, no AI side effects, explicit confirmation contract, database log failure is non-fatal)");

  const invalidPaymentReport = await request("/api/payments/notify-admin", {
    token: learner.token, method: "POST", body: { amount: -10 },
  });
  assert.equal(invalidPaymentReport.status, 400, "learner cannot report a negative payment amount");
  const validPaymentReport = await request("/api/payments/notify-admin", {
    token: learner.token, method: "POST", body: { amount: 25.5, method: "ecocash", providerReference: "ECO-REPORT-" + suffix },
  });
  assert.equal(validPaymentReport.status, 200, "learner can submit a valid payment report for Owner verification");
  assert(validPaymentReport.data.notifiedOwners >= 1);
  const ownerPaymentNotice = await pool.query(
    "SELECT id,message FROM notifications WHERE recipient_id=$1 AND title=$2 AND message LIKE $3 ORDER BY id DESC LIMIT 1",
    [ownerId, "💳 Payment Reported by Learner", "%$25.50%"],
  );
  assert.equal(ownerPaymentNotice.rowCount, 1, "payment report notification must persist for the Owner");
  assert.match(ownerPaymentNotice.rows[0].message, /not been independently verified/);
  assert.match(ownerPaymentNotice.rows[0].message, /ecocash/i, "Owner notice must include the learner-reported payment method");
  assert.match(ownerPaymentNotice.rows[0].message, new RegExp("ECO-REPORT-" + suffix), "Owner notice must include the receipt reference for manual verification");
  const invalidPaynowCheckout = await request("/api/payments/paynow/create", {
    token: learner.token, method: "POST", body: { amount: -5 },
  });
  assert.equal(invalidPaynowCheckout.status, 400, "Paynow checkout rejects invalid amounts before provider access");
  const paynowStatus = await request("/api/payments/paynow/status");
  assert.equal(paynowStatus.status, 200);
  assert.equal(paynowStatus.data.configured, true, "isolated CI provider credentials and public URLs should enable Paynow readiness");
  const paynowKey = process.env.PAYNOW_INTEGRATION_KEY;
  assert(paynowKey, "isolated CI must configure a non-production Paynow callback key");
  async function sendPaynowCallback(fields) {
    const hash = crypto.createHash("sha512").update(Object.values(fields).join("") + paynowKey, "utf8").digest("hex").toUpperCase();
    const response = await fetch(base + "/api/payments/paynow/result", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...fields, hash }),
    });
    return { status: response.status, body: await response.text() };
  }
  const paynowReference = "DL-" + learner.id + "-1760000000000-a1b2c3d4";
  await pool.query(
    "INSERT INTO payments (student_id,student_name,amount,month,year,status,notes,recorded_by) VALUES ($1,$2,'25.00','October',2026,'pending',$3,$4)",
    [learner.id, "PR84 Integration Learner", "Paynow reference " + paynowReference, learner.id],
  );
  const paidCallback = await sendPaynowCallback({ reference: paynowReference, amount: "25.00", status: "Paid" });
  assert.equal(paidCallback.status, 200, "valid signed Paynow settlement callback must be accepted");
  const settledPaynow = await pool.query("SELECT status FROM payments WHERE notes LIKE $1", ["%Paynow reference " + paynowReference + "%"]);
  assert.equal(settledPaynow.rows[0].status, "paid", "Paynow callback must persist paid status");
  const pendingReference = "DL-" + learner.id + "-1760000000002-c1d2e3f4";
  await pool.query(
    "INSERT INTO payments (student_id,student_name,amount,month,year,status,notes,recorded_by) VALUES ($1,$2,'12.00','October',2026,'pending',$3,$4)",
    [learner.id, "PR84 Integration Learner", "Paynow reference " + pendingReference, learner.id],
  );
  assert.equal((await sendPaynowCallback({ reference: pendingReference, amount: "12.00", status: "Awaiting Delivery" })).status, 200, "signed Awaiting Delivery callback should be accepted without marking the payment paid");
  const awaitingDelivery = await pool.query("SELECT status FROM payments WHERE notes LIKE $1", ["%Paynow reference " + pendingReference + "%"]);
  assert.equal(awaitingDelivery.rows[0]?.status, "pending", "Awaiting Delivery must not be treated as final settlement");
  assert.equal((await sendPaynowCallback({ reference: pendingReference, amount: "12.00", status: "Delivered" })).status, 200, "signed Delivered callback should be accepted while funds remain in suspense");
  const deliveredPending = await pool.query("SELECT status FROM payments WHERE notes LIKE $1", ["%Paynow reference " + pendingReference + "%"]);
  assert.equal(deliveredPending.rows[0]?.status, "pending", "Delivered must not be treated as final settlement");
  assert.equal((await sendPaynowCallback({ reference: pendingReference, amount: "12.00", status: "Paid" })).status, 200, "a later signed paid callback must settle a payment after earlier intermediate callbacks");
  const pendingThenPaid = await pool.query("SELECT status FROM payments WHERE notes LIKE $1", ["%Paynow reference " + pendingReference + "%"]);
  assert.equal(pendingThenPaid.rows[0]?.status, "paid", "pending-to-paid Paynow transition must persist");
  const paidCallbackDuplicate = await sendPaynowCallback({ reference: paynowReference, amount: "25.00", status: "Paid" });
  assert.equal(paidCallbackDuplicate.status, 200, "duplicate Paynow paid callback must be idempotently acknowledged");
  const refundedCallback = await sendPaynowCallback({ reference: paynowReference, amount: "25.00", status: "Refunded" });
  assert.equal(refundedCallback.status, 200, "valid signed Paynow refund status must be accepted");
  const refundedPaynow = await pool.query("SELECT status FROM payments WHERE notes LIKE $1", ["%Paynow reference " + paynowReference + "%"]);
  assert.equal(refundedPaynow.rows[0]?.status, "refunded", "Paynow refund notification must persist refunded status");
  assert.equal((await sendPaynowCallback({ reference: paynowReference, amount: "25.00", status: "Refunded" })).status, 200, "duplicate refund callback must be idempotently acknowledged");
  assert.equal((await sendPaynowCallback({ reference: paynowReference, amount: "25.00", status: "Paid" })).status, 200, "late paid callback after refund must be safely acknowledged");
  const noRefundReopen = await pool.query("SELECT status FROM payments WHERE notes LIKE $1", ["%Paynow reference " + paynowReference + "%"]);
  assert.equal(noRefundReopen.rows[0]?.status, "refunded", "late paid callback must never reopen a refunded payment");
  const mismatchCallback = await sendPaynowCallback({ reference: paynowReference, amount: "24.00", status: "Paid" });
  assert.equal(mismatchCallback.status, 400, "Paynow callback amount must match the stored payment reference");
  const failedReference = "DL-" + learner.id + "-1760000000001-b1c2d3e4";
  await pool.query(
    "INSERT INTO payments (student_id,student_name,amount,month,year,status,notes,recorded_by) VALUES ($1,$2,'10.00','October',2026,'pending',$3,$4)",
    [learner.id, "PR84 Integration Learner", "Paynow reference " + failedReference, learner.id],
  );
  assert.equal((await sendPaynowCallback({ reference: failedReference, amount: "10.00", status: "Failed" })).status, 200);
  assert.equal((await sendPaynowCallback({ reference: failedReference, amount: "10.00", status: "Pending" })).status, 200);
  const terminalPaynow = await pool.query("SELECT status FROM payments WHERE notes LIKE $1", ["%Paynow reference " + failedReference + "%"]);
  assert.equal(terminalPaynow.rows[0].status, "failed", "out-of-order pending callback must not reopen a failed payment");
  const invalidPaynowHash = await fetch(base + "/api/payments/paynow/result", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ reference: paynowReference, amount: "25.00", status: "Paid", hash: "invalid" }),
  });
  assert.equal(invalidPaynowHash.status, 400, "invalid Paynow signatures must be rejected");
  console.log("PAYNOW_CALLBACK_E2E: PASS (signature, amount binding, settlement persistence, duplicate callback, terminal-state protection)");
  console.log("PAYMENT_LEDGER_OWNERSHIP_E2E: PASS (isolated CI row, list isolation, ID isolation, staff access, payout preference separation)");

  // Poll lifecycle: teacher creates and publishes; learner answers; scores persist and private results stay private.
  const createdPoll = await request("/api/polls", {
    token: teacherToken, method: "POST", body: {
      title: "PR84 Poll Lifecycle " + suffix, topic: "Fractions", subject: "Mathematics",
      grade: "Form 3", mode: "practice",
      questions: [{ question: "What is one half as a decimal?", difficulty: "easy",
        options: [{ text: "0.5", isCorrect: true }, { text: "0.25", isCorrect: false }] }],
    },
  });
  assert.equal(createdPoll.status, 201, "authorized teacher can create a poll with validated options");
  const publishedPoll = await request("/api/polls/" + createdPoll.data.id, {
    token: teacherToken, method: "PATCH", body: { status: "active" },
  });
  assert.equal(publishedPoll.status, 200, "poll creator can publish the draft");
  const learnerPollList = await request("/api/polls", { token: learner.token });
  assert.equal(learnerPollList.status, 200);
  assert(learnerPollList.data.some(item => Number(item.id) === Number(createdPoll.data.id)), "learner can discover the published poll");
  const pollDetail = await request("/api/polls/" + createdPoll.data.id, { token: learner.token });
  assert.equal(pollDetail.status, 200, "learner can open an active poll");
  assert.equal(pollDetail.data.questions[0].options.some(option => option.isCorrect === true), false, "active poll must not leak correct answers to learners");
  const pollCreatorDetail = await request("/api/polls/" + createdPoll.data.id, { token: teacherToken });
  const pollQuestion = pollCreatorDetail.data.questions[0];
  const correctPollOption = pollQuestion.options.find(option => option.isCorrect);
  assert(correctPollOption, "poll creator can verify the configured correct option");
  const instantFeedback = await request("/api/polls/" + createdPoll.data.id + "/check-answer", {
    token: learner.token, method: "POST", body: { questionId: pollQuestion.id, optionId: correctPollOption.id },
  });
  assert.equal(instantFeedback.status, 200);
  assert.equal(instantFeedback.data.isCorrect, true, "practice answer feedback is verified server-side");
  const pollSubmission = await request("/api/polls/" + createdPoll.data.id + "/submit", {
    token: learner.token, method: "POST", body: {
      answers: [{ questionId: pollQuestion.id, optionId: correctPollOption.id }],
      resultPrivacy: "private",
    },
  });
  assert.equal(pollSubmission.status, 200, "learner can submit a complete poll attempt");
  assert.equal(pollSubmission.data.score, 1);
  const persistedPoll = await pool.query("SELECT score,total_questions FROM poll_submissions WHERE id=$1 AND student_id=$2", [pollSubmission.data.submission.id, learner.id]);
  assert.equal(persistedPoll.rowCount, 1, "poll attempt must persist in PostgreSQL");
  assert.equal(Number(persistedPoll.rows[0].score), 1);
  const learnerPollResults = await request("/api/polls/" + createdPoll.data.id + "/results", { token: learner.token });
  assert.equal(learnerPollResults.status, 200);
  assert(learnerPollResults.data.submissions.some(item => Number(item.id) === Number(pollSubmission.data.submission.id)), "learner can view own private result");
  const otherLearnerPollResults = await request("/api/polls/" + createdPoll.data.id + "/results", { token: otherLearner.token });
  assert.equal(otherLearnerPollResults.status, 200);
  assert.equal(otherLearnerPollResults.data.submissions.some(item => Number(item.id) === Number(pollSubmission.data.submission.id)), false, "private poll result is not exposed to another learner");
  const teacherPollResults = await request("/api/polls/" + createdPoll.data.id + "/results", { token: teacherToken });
  assert.equal(teacherPollResults.status, 200, "poll creator can review learner results");
  assert(teacherPollResults.data.submissions.some(item => Number(item.id) === Number(pollSubmission.data.submission.id)));
  console.log("POLL_LIFECYCLE_E2E: PASS (create, publish, discover, answer, server scoring, persistence, privacy, teacher results)");

  // Assignment lifecycle: teacher creates, learner submits, teacher grades, and the saved result survives a fresh API read.
  const assignmentCreated = await request("/api/assignments", {
    token: teacherToken, method: "POST", body: {
      title: "PR84 Assignment Lifecycle " + suffix,
      description: "Complete the integration-test assignment.",
      subject: "Mathematics", grade: "Form 3", dueDate: "2099-12-31", totalMarks: 10,
    },
  });
  assert.equal(assignmentCreated.status, 201, "teacher can create an assignment");
  const learnerAssignments = await request("/api/assignments", { token: learner.token });
  assert.equal(learnerAssignments.status, 200, "learner can list active assignments");
  assert(learnerAssignments.data.some(item => Number(item.id) === Number(assignmentCreated.data.id)), "learner can discover the assignment for their grade");
  const assignmentDetail = await request("/api/assignments/" + assignmentCreated.data.id, { token: learner.token });
  assert.equal(assignmentDetail.status, 200, "learner can open the assignment");
  const assignmentSubmission = await request("/api/assignments/" + assignmentCreated.data.id + "/submit", {
    token: learner.token, method: "POST", body: { content: "The answer is 0.5." },
  });
  assert.equal(assignmentSubmission.status, 201, "learner can submit assignment work");
  const teacherAssignmentSubmissions = await request("/api/assignments/" + assignmentCreated.data.id + "/submissions", { token: teacherToken });
  assert.equal(teacherAssignmentSubmissions.status, 200, "assignment owner can retrieve submissions");
  assert(teacherAssignmentSubmissions.data.some(item => Number(item.id) === Number(assignmentSubmission.data.id)), "teacher can see the learner's submitted work");
  const gradedAssignment = await request("/api/assignments/submissions/" + assignmentSubmission.data.id + "/grade", {
    token: teacherToken, method: "PUT", body: { marks: 8, feedback: "Good work." },
  });
  assert.equal(gradedAssignment.status, 200, "teacher can grade the learner's assignment");
  assert.equal(Number(gradedAssignment.data.marks), 8);
  const persistedAssignment = await pool.query("SELECT status,marks,feedback FROM assignment_submissions WHERE id=$1 AND student_id=$2", [assignmentSubmission.data.id, learner.id]);
  assert.equal(persistedAssignment.rowCount, 1, "assignment submission must persist in PostgreSQL");
  assert.equal(persistedAssignment.rows[0].status, "graded");
  assert.equal(Number(persistedAssignment.rows[0].marks), 8);
  const learnerAssignmentAfterGrade = await request("/api/assignments/" + assignmentCreated.data.id, { token: learner.token });
  assert.equal(learnerAssignmentAfterGrade.status, 200);
  assert.equal(Number(learnerAssignmentAfterGrade.data.submissions[0].marks), 8, "learner can read the returned grade and feedback");
  const otherLearnerAssignment = await request("/api/assignments/" + assignmentCreated.data.id, { token: otherLearner.token });
  assert.equal(otherLearnerAssignment.status, 200);
  assert.equal(otherLearnerAssignment.data.submissions.length, 0, "another learner cannot read the first learner's submission");
  await pool.query("DELETE FROM assignment_submissions WHERE assignment_id=$1", [assignmentCreated.data.id]);
  const deletedLifecycleAssignment = await request("/api/assignments/" + assignmentCreated.data.id, { token: teacherToken, method: "DELETE" });
  assert.equal(deletedLifecycleAssignment.status, 200, "assignment lifecycle fixture cleanup must succeed after persistence assertions");
  console.log("ASSIGNMENT_LIFECYCLE_E2E: PASS (create, discover, submit, teacher review, grading, PostgreSQL persistence, learner privacy)");

  // Exercise lifecycle: teacher builds and publishes; learner submits; teacher marks/returns; learner retries.
  const exerciseLesson = await pool.query(
    "INSERT INTO lessons(title,subject,teacher_id,teacher_name) VALUES($1,$2,$3,$4) RETURNING id",
    ["PR84 Exercise Lifecycle Lesson", "Mathematics", teacherId, "PR84 Test Teacher"],
  );
  const lifecycleExercise = await request("/api/exercises/lessons/" + exerciseLesson.rows[0].id + "/exercises", {
    token: teacherToken, method: "POST", body: { title: "PR84 Exercise Lifecycle", instructions: "Answer the question.", layout: { version: 1, page: "book" } },
  });
  assert.equal(lifecycleExercise.status, 201, "teacher can create an exercise draft");
  const lifecycleQuestion = await request("/api/exercises/" + lifecycleExercise.data.id + "/questions", {
    token: teacherToken, method: "POST", body: { prompt: "Explain one half as a decimal.", type: "input", marksAllocated: 2, position: 0 },
  });
  assert.equal(lifecycleQuestion.status, 201, "teacher can add a question to the exercise");
  const lifecyclePublish = await request("/api/exercises/" + lifecycleExercise.data.id + "/publish", {
    token: teacherToken, method: "POST", body: {},
  });
  assert.equal(lifecyclePublish.status, 200, "teacher can publish a complete exercise");
  assert.equal(lifecyclePublish.data.status, "published");
  const learnerExerciseList = await request("/api/exercises/lessons/" + exerciseLesson.rows[0].id + "/exercises", { token: learner.token });
  assert.equal(learnerExerciseList.status, 200);
  assert(learnerExerciseList.data.some(item => Number(item.id) === Number(lifecycleExercise.data.id)), "learner can discover the published exercise");
  const exerciseSubmission = await request("/api/exercises/" + lifecycleExercise.data.id + "/submit", {
    token: learner.token, method: "POST", body: { answers: [{ questionId: lifecycleQuestion.data.id, textAnswer: "0.5" }] },
  });
  assert.equal(exerciseSubmission.status, 201, "learner can submit the first exercise attempt");
  const duplicateExerciseSubmit = await request("/api/exercises/" + lifecycleExercise.data.id + "/submit", {
    token: learner.token, method: "POST", body: { answers: [{ questionId: lifecycleQuestion.data.id, textAnswer: "0.5" }] },
  });
  assert.equal(duplicateExerciseSubmit.status, 409, "duplicate submission is blocked while marking is pending");
  const teacherSubmissions = await request("/api/exercises/" + lifecycleExercise.data.id + "/submissions", { token: teacherToken });
  assert.equal(teacherSubmissions.status, 200);
  assert(teacherSubmissions.data.some(item => Number(item.id) === Number(exerciseSubmission.data.submissionId)), "teacher can see the learner submission");
  const submissionDetail = await request("/api/exercises/" + lifecycleExercise.data.id + "/submissions/" + exerciseSubmission.data.submissionId, { token: teacherToken });
  assert.equal(submissionDetail.status, 200);
  assert.equal(submissionDetail.data.answers.length, 1);
  const markedExercise = await request("/api/exercises/" + lifecycleExercise.data.id + "/submissions/" + exerciseSubmission.data.submissionId + "/mark", {
    token: teacherToken, method: "POST", body: { marks: [{ answerId: submissionDetail.data.answers[0].id, awardedMarks: 2, correctionNotes: "Correct." }], overallComment: "Well done." },
  });
  assert.equal(markedExercise.status, 200, "teacher can mark and return the submitted attempt");
  assert.equal(markedExercise.data.submission.status, "marked");
  assert.equal(Number(markedExercise.data.submission.totalScore), 2);
  const learnerExerciseResult = await request("/api/exercises/" + lifecycleExercise.data.id + "/result", { token: learner.token });
  assert.equal(learnerExerciseResult.status, 200, "learner can read the returned exercise result");
  assert.equal(Number(learnerExerciseResult.data.submission.totalScore), 2);
  const retryWithoutFlag = await request("/api/exercises/" + lifecycleExercise.data.id + "/submit", {
    token: learner.token, method: "POST", body: { answers: [{ questionId: lifecycleQuestion.data.id, textAnswer: "0.5" }] },
  });
  assert.equal(retryWithoutFlag.status, 409, "a returned attempt cannot be silently overwritten");
  const retryExercise = await request("/api/exercises/" + lifecycleExercise.data.id + "/submit", {
    token: learner.token, method: "POST", body: { newAttempt: true, answers: [{ questionId: lifecycleQuestion.data.id, textAnswer: "0.5" }] },
  });
  assert.equal(retryExercise.status, 201, "learner can start a distinct retry after return");
  const exerciseAttempts = await pool.query("SELECT attempt_number,status FROM exercise_submissions WHERE exercise_id=$1 AND learner_id=$2 ORDER BY attempt_number", [lifecycleExercise.data.id, learner.id]);
  assert.equal(exerciseAttempts.rowCount, 2, "original and retry attempts must persist separately");
  assert.equal(exerciseAttempts.rows[0].status, "marked");
  assert.equal(Number(exerciseAttempts.rows[1].attempt_number), 2);
  await pool.query("DELETE FROM exercises WHERE id=$1", [lifecycleExercise.data.id]);
  console.log("EXERCISE_LIFECYCLE_E2E: PASS (build, question, publish, discover, submit, duplicate guard, marking, return, result, retry persistence)");

  // Seed real marked, unmarked and exempt assignment/exercise records in isolated CI PostgreSQL.
  const reportLesson = await pool.query("INSERT INTO lessons(title,subject,teacher_id,teacher_name) VALUES($1,$2,$3,$4) RETURNING id", ["PR84 Report Lesson", "Mathematics", teacherId, "PR84 Test Teacher"]);
  const reportAssignment = await pool.query("INSERT INTO assignments(title,subject,due_date,total_marks,teacher_id,teacher_name,status) VALUES($1,$2,$3,100,$4,$5,'active') RETURNING id", ["PR84 Marked Assignment", "Mathematics", "2099-12-31", teacherId, "PR84 Test Teacher"]);
  const unmarkedAssignment = await pool.query("INSERT INTO assignments(title,subject,due_date,total_marks,teacher_id,teacher_name,status) VALUES($1,$2,$3,50,$4,$5,'active') RETURNING id", ["PR84 Unmarked Assignment", "Mathematics", "2099-12-31", teacherId, "PR84 Test Teacher"]);
  const exemptAssignment = await pool.query("INSERT INTO assignments(title,subject,due_date,total_marks,teacher_id,teacher_name,status) VALUES($1,$2,$3,40,$4,$5,'active') RETURNING id", ["PR84 Exempt Assignment", "Mathematics", "2099-12-31", teacherId, "PR84 Test Teacher"]);
  await pool.query("INSERT INTO assignment_submissions(assignment_id,student_id,student_name,status,marks,submitted_at,graded_at) VALUES($1,$2,$3,'graded',75,'2026-10-15T12:00:00Z','2026-10-15T12:00:00Z')", [reportAssignment.rows[0].id, learner.id, "PR84 Integration Learner"]);
  await pool.query("INSERT INTO assignment_submissions(assignment_id,student_id,student_name,status,marks,submitted_at) VALUES($1,$2,$3,'submitted',NULL,'2026-10-15T12:00:00Z')", [unmarkedAssignment.rows[0].id, learner.id, "PR84 Integration Learner"]);
  await pool.query("INSERT INTO assignment_submissions(assignment_id,student_id,student_name,status,marks,submitted_at) VALUES($1,$2,$3,'exempt',NULL,'2026-10-15T12:00:00Z')", [exemptAssignment.rows[0].id, learner.id, "PR84 Integration Learner"]);
  await pool.query("INSERT INTO assignment_submissions(assignment_id,student_id,student_name,status,marks,submitted_at) VALUES($1,$2,$3,'graded',99,'2026-09-30T12:00:00Z')", [reportAssignment.rows[0].id, learner.id, "PR84 Integration Learner"]);
  const reportExercise = await pool.query("INSERT INTO exercises(lesson_id,created_by,title,total_marks,status) VALUES($1,$2,$3,20,'published') RETURNING id", [reportLesson.rows[0].id, teacherId, "PR84 Marked Exercise"]);
  const unmarkedExercise = await pool.query("INSERT INTO exercises(lesson_id,created_by,title,total_marks,status) VALUES($1,$2,$3,10,'published') RETURNING id", [reportLesson.rows[0].id, teacherId, "PR84 Unmarked Exercise"]);
  const exemptExercise = await pool.query("INSERT INTO exercises(lesson_id,created_by,title,total_marks,status) VALUES($1,$2,$3,15,'published') RETURNING id", [reportLesson.rows[0].id, teacherId, "PR84 Exempt Exercise"]);
  await pool.query("INSERT INTO exercise_submissions(exercise_id,learner_id,attempt_number,status,total_score,percentage,submitted_at,marked_at,returned_at) VALUES($1,$2,1,'returned',18,90,'2026-10-15T12:00:00Z','2026-10-15T12:00:00Z','2026-10-15T12:00:00Z')", [reportExercise.rows[0].id, learner.id]);
  await pool.query("INSERT INTO exercise_submissions(exercise_id,learner_id,attempt_number,status,total_score,submitted_at) VALUES($1,$2,1,'submitted',0,'2026-10-15T12:00:00Z')", [unmarkedExercise.rows[0].id, learner.id]);
  await pool.query("INSERT INTO exercise_submissions(exercise_id,learner_id,attempt_number,status,total_score,submitted_at) VALUES($1,$2,1,'exempt',0,'2026-10-15T12:00:00Z')", [exemptExercise.rows[0].id, learner.id]);
  await pool.query("INSERT INTO exercise_submissions(exercise_id,learner_id,attempt_number,status,total_score,submitted_at) VALUES($1,$2,2,'returned',20,'2026-09-30T12:00:00Z')", [reportExercise.rows[0].id, learner.id]);

  const reportMarkLimitExercises = [];
  for (let index = 0; index < 17; index++) {
    const created = await request("/api/exercises/lessons/" + reportLesson.rows[0].id + "/exercises", {
      token: teacherToken,
      method: "POST",
      body: { title: "PR84 Limit Exercise " + (index + 1), layout: { version: 1, page: "book", recordForReport: index !== 0 } },
    });
    assert.equal(created.status, 201, "each of the first 20 exercises should be accepted for its lesson");
    reportMarkLimitExercises.push(created.data);
  }
  await pool.query("INSERT INTO exercise_submissions(exercise_id,learner_id,attempt_number,status,total_score,percentage,submitted_at,marked_at,returned_at) VALUES($1,$2,1,'returned',30,100,now(),now(),now())", [reportMarkLimitExercises[0].id, learner.id]);
  const exerciseCountForLesson = await pool.query("SELECT COUNT(*)::int AS count FROM exercises WHERE lesson_id=$1 AND status<>'archived'", [reportLesson.rows[0].id]);
  assert.equal(Number(exerciseCountForLesson.rows[0].count), 20, "the lesson limit must count exercise records, not learner submissions");
  const twentyFirstExercise = await request("/api/exercises/lessons/" + reportLesson.rows[0].id + "/exercises", { token: teacherToken, method: "POST", body: { title: "PR84 Exercise 21" } });
  assert.equal(twentyFirstExercise.status, 409, "the twenty-first exercise for a lesson must be rejected");
  const reportMarkFlag = await pool.query("SELECT layout->>'recordForReport' AS value FROM exercises WHERE id=$1", [reportMarkLimitExercises[0].id]);
  assert.equal(reportMarkFlag.rows[0].value, "false", "the report-mark setting must persist in the exercise record");
  const updatedReportMark = await request("/api/exercises/" + reportMarkLimitExercises[1].id + "/reporting", { token: teacherToken, method: "PATCH", body: { recordForReport: false } });
  assert.equal(updatedReportMark.status, 200, "exercise report-mark setting can be changed after draft creation");
  const updatedReportMarkRow = await pool.query("SELECT layout->>'recordForReport' AS value FROM exercises WHERE id=$1", [reportMarkLimitExercises[1].id]);
  assert.equal(updatedReportMarkRow.rows[0].value, "false");
  const archivedReportMarkExercise = await request("/api/exercises/" + reportMarkLimitExercises[0].id + "/archive", { token: teacherToken, method: "POST" });
  assert.equal(archivedReportMarkExercise.status, 200, "teachers can archive their own exercises");
  const preservedArchivedSubmission = await pool.query("SELECT id FROM exercise_submissions WHERE exercise_id=$1", [reportMarkLimitExercises[0].id]);
  assert.equal(preservedArchivedSubmission.rowCount, 1, "archiving must preserve learner submissions and historical report data");
  const archivedExerciseAudit = await pool.query("SELECT id FROM audit_logs WHERE action=$1 AND target_id=$2", ["exercise.archived", reportMarkLimitExercises[0].id]);
  assert.equal(archivedExerciseAudit.rowCount, 1, "exercise archival must create an audit record");
  const replacementExercise = await request("/api/exercises/lessons/" + reportLesson.rows[0].id + "/exercises", { token: teacherToken, method: "POST", body: { title: "PR84 Replacement Exercise" } });
  assert.equal(replacementExercise.status, 201, "archiving an exercise should free one active slot without deleting its history");
  const activeExerciseCount = await pool.query("SELECT COUNT(*)::int AS count FROM exercises WHERE lesson_id=$1 AND status<>'archived'", [reportLesson.rows[0].id]);
  assert.equal(Number(activeExerciseCount.rows[0].count), 20, "a lesson can have no more than 20 active exercises after archival");

  // Concurrent requests must serialize on the lesson row and never exceed the active limit.
  const concurrentArchive = await request("/api/exercises/" + reportMarkLimitExercises[1].id + "/archive", { token: teacherToken, method: "POST" });
  assert.equal(concurrentArchive.status, 200, "archiving a second owned exercise should open one slot for the concurrency test");
  const concurrentExerciseCreates = await Promise.all([1, 2].map(index =>
    request("/api/exercises/lessons/" + reportLesson.rows[0].id + "/exercises", {
      token: teacherToken, method: "POST", body: { title: "PR89 Concurrent Exercise " + index },
    })
  ));
  assert.deepEqual(concurrentExerciseCreates.map(result => result.status).sort(), [201, 409], "simultaneous requests for one remaining slot must create exactly one exercise");
  const countAfterConcurrentCreates = await pool.query("SELECT COUNT(*)::int AS count FROM exercises WHERE lesson_id=$1 AND status<>'archived'", [reportLesson.rows[0].id]);
  assert.equal(Number(countAfterConcurrentCreates.rows[0].count), 20, "concurrent creation must never exceed 20 active exercises");
  const unauthorizedExerciseCreate = await request("/api/exercises/lessons/" + reportLesson.rows[0].id + "/exercises", { token: learner.token, method: "POST", body: { title: "Unauthorized limit bypass attempt" } });
  assert.equal(unauthorizedExerciseCreate.status, 403, "learners must not bypass exercise creation permissions");

  // Academic records and approval-gated documents are exercised only against isolated CI PostgreSQL.
  const ownAcademicRecords = await request("/api/academic-records/me", { token: learner.token });
  assert.equal(ownAcademicRecords.status, 200, "learner must be able to view own authoritative academic records");
  assert(Array.isArray(ownAcademicRecords.data.enrollments) && Array.isArray(ownAcademicRecords.data.awards) && Array.isArray(ownAcademicRecords.data.attendance));
  assert.equal(ownAcademicRecords.data.assignmentMarks.length, 4, "learner academic records include all-time marked, unmarked, exempt and out-of-term assignment submissions");
  assert.equal(ownAcademicRecords.data.exerciseMarks.length, 5, "learner academic records include marked, unmarked, exempt, out-of-term and non-report-mark exercise submissions");
  assert.equal(ownAcademicRecords.data.markSummary.assignments.markedCount, 2);
  assert.equal(ownAcademicRecords.data.markSummary.assignments.unmarkedCount, 1);
  assert.equal(ownAcademicRecords.data.markSummary.assignments.exemptCount, 1);
  assert.equal(ownAcademicRecords.data.markSummary.exercises.markedCount, 2);
  assert.equal(ownAcademicRecords.data.markSummary.exercises.unmarkedCount, 1);
  assert.equal(ownAcademicRecords.data.markSummary.exercises.exemptCount, 1);
  assert.equal(ownAcademicRecords.data.markSummary.overall.percentage, 88.33, "all-time percentage must use only known earned and possible marks");
  assert(ownAcademicRecords.data.exerciseMarks.some(row => Number(row.exercise_id) === Number(reportMarkLimitExercises[0].id)), "non-report-mark submissions remain visible in learner academic history");
  assert.equal(ownAcademicRecords.data.markSummary.exercises.markedCount, 2, "non-report-mark exercise scores must not enter report totals");
  const currentAcademicYear = await request("/api/academic-records/current-year", { token: learner.token });
  assert.equal(currentAcademicYear.status, 200, "authenticated users can resolve the current school academic year");
  assert.match(String(currentAcademicYear.data.academicYear), /^\d{4}$/);
  assert.equal(currentAcademicYear.data.startDate, String(currentAcademicYear.data.academicYear) + "-01-01");
  assert.equal(currentAcademicYear.data.endDate, String(currentAcademicYear.data.academicYear) + "-12-31");
  assert.equal(currentAcademicYear.data.timeZone, "Africa/Harare");
  const transferFormData = { learnerName: "PR84 Transfer Learner", receivingSchool: "Test Receiving School", academicYear: currentAcademicYear.data.academicYear, dob: "2010-11-01", effectiveDate: "2026-10-31", guardianName: "Test Guardian", guardianPhone: "+263771234567", reasonDetail: "Family relocation", schoolLogoDataUrl: "data:image/png;base64,iVBORw0KGgo=", guardianSignatureDataUrl: "data:image/png;base64,QUJD", headmasterSignatureDataUrl: "data:image/jpeg;base64,REVG" };
  const invalidTransferDob = await request("/api/academic-records/transfer-requests", { token: learner.token, method: "POST", body: { reason: "Invalid birth date test", formData: { ...transferFormData, dob: "2099-01-01" } } });
  assert.equal(invalidTransferDob.status, 400, "future learner dates of birth must be rejected");
  const transferRequest = await request("/api/academic-records/transfer-requests", { token: learner.token, method: "POST", body: { reason: "Family relocation for integration test", formData: transferFormData } });
  assert.equal(transferRequest.status, 201, "learner should be able to request a transfer letter");
  const reviewerQueueRows = await pool.query("SELECT recipient_user_id,subject FROM email_notification_queue WHERE subject='Transfer letter request awaiting review' AND recipient_user_id=ANY($1::int[])", [[ownerId, managerId, seniorManagerId]]);
  assert.deepEqual(new Set(reviewerQueueRows.rows.map(row => Number(row.recipient_user_id))), new Set([ownerId, managerId, seniorManagerId]), "new transfer request must notify Owner and only managers with explicit view plus action grants");

  const savedTransfer = await pool.query("SELECT form_data FROM academic_transfer_requests WHERE id=$1", [transferRequest.data.id]);
  assert.deepEqual(savedTransfer.rows[0].form_data, transferFormData, "migration must persist the complete form_data JSONB payload");
  const reviewerTransferQueue = await request("/api/academic-records/transfer-requests", { token: ownerToken });
  const reviewerTransferRow = reviewerTransferQueue.data.find(row => Number(row.id) === Number(transferRequest.data.id));
  assert.deepEqual(reviewerTransferRow.form_data, transferFormData, "reviewer queue must return the exact submitted form and image data");
  assert.match(reviewerTransferRow.form_data.guardianSignatureDataUrl, /^data:image\/png;base64,/);
  assert.match(reviewerTransferRow.form_data.schoolLogoDataUrl, /^data:image\/png;base64,/);
  const duplicateAttempts = await Promise.all([1, 2].map(() => request("/api/academic-records/transfer-requests", { token: learner.token, method: "POST", body: { reason: "Duplicate transfer attempt", formData: transferFormData } })));
  assert(duplicateAttempts.every(result => result.status === 409), "concurrent duplicate pending requests must be rejected");
  const teacherTransferReview = await request("/api/academic-records/transfer-requests/" + transferRequest.data.id + "/review", { token: teacherToken, method: "POST", body: { status: "approved" } });
  assert.equal(teacherTransferReview.status, 403, "teacher role must not review transfer requests");
  const adminTransferQueue = await request("/api/academic-records/transfer-requests", { token: adminToken });
  assert.equal(adminTransferQueue.status, 200, "owner-class admin must retain access to the transfer review queue");
  assert.equal(adminTransferQueue.data.some(item => Number(item.id) === Number(transferRequest.data.id)), false, "Admin must not inherit the Manager/Owner transfer review queue or approval authority");
  const blockedTransferDownload = await request("/api/academic-records/transfer-requests/" + transferRequest.data.id + "/download", { token: learner.token });
  assert.equal(blockedTransferDownload.status, 403, "transfer letter must be blocked until manager approval");
  const otherLearnerTransferDownload = await request("/api/academic-records/transfer-requests/" + transferRequest.data.id + "/download", { token: otherLearner.token });
  assert.equal(otherLearnerTransferDownload.status, 404, "a different learner must not access another learner's transfer letter");
  const learnerTransferReview = await request("/api/academic-records/transfer-requests/" + transferRequest.data.id + "/review", { token: learner.token, method: "POST", body: { status: "approved" } });
  assert.equal(learnerTransferReview.status, 403, "learners must not review transfer letters");
   const seniorTransferApprovalGrant = await request("/api/manager-permissions/" + seniorManagerId, { token: ownerToken, method: "PUT", body: { permissions: [{ key: "transfers.approve", granted: true }] } });
  assert.equal(seniorTransferApprovalGrant.status, 200, "Owner must explicitly grant Senior transfer approval to this individual Senior Manager");
  const approveTransfer = await request("/api/academic-records/transfer-requests/" + transferRequest.data.id + "/review", { token: seniorManagerToken, method: "POST", body: { status: "approved", note: "CI-only Senior Manager approval" } });
  assert.equal(approveTransfer.status, 200, "Senior Manager should be able to approve transfer request");
  const transferReviewAudit = await pool.query("SELECT id FROM audit_logs WHERE action=$1 AND target_type=$2 AND target_id=$3 AND performed_by=$4", ["transfer_letter.reviewed", "transfer_request", transferRequest.data.id, seniorManagerId]);
  assert.equal(transferReviewAudit.rowCount, 1, "transfer decision and its audit record must be committed together");
  const verificationUrl = String(approveTransfer.data.verificationUrl || "");
  const verificationToken = verificationUrl.split("/").filter(Boolean).pop() || "";
  assert.match(verificationToken, /^[A-Za-z0-9_-]{43}$/, "approved transfer must issue a high-entropy verification token");
  const publicVerification = await request("/api/academic-records/transfer-verification/" + verificationToken);
  assert.equal(publicVerification.status, 200, "a valid unexpired verification token must confirm the approved transfer; got HTTP " + publicVerification.status + " body=" + JSON.stringify(publicVerification.data) + " tokenLength=" + verificationToken.length);
  assert.equal(publicVerification.data.verified, true);
  assert.equal(publicVerification.data.reference, "DL-TR-" + transferRequest.data.id);
  assert.equal(publicVerification.data.learnerName, transferFormData.learnerName);
  assert.equal(publicVerification.data.guardianPhone, undefined, "public verification must not expose guardian contact details");
  const transferInAppNotice = await pool.query("SELECT link,type FROM notifications WHERE recipient_id=$1 AND type='transfer_approved' ORDER BY id DESC LIMIT 1", [learner.id]);
  assert.equal(transferInAppNotice.rowCount, 1, "approval must create an in-app notification");
  assert.equal(transferInAppNotice.rows[0].link, "/verify/transfer/" + verificationToken, "in-app notification must link to the protected verification page");
  const verificationStamp = await pool.query("SELECT verification_verified_at FROM academic_transfer_requests WHERE id=$1", [transferRequest.data.id]);
  assert(verificationStamp.rows[0].verification_verified_at, "successful public verification must be recorded");
  const duplicateTransferReview = await request("/api/academic-records/transfer-requests/" + transferRequest.data.id + "/review", { token: seniorManagerToken, method: "POST", body: { status: "approved", note: "Duplicate approval attempt" } });
  assert.equal(duplicateTransferReview.status, 404, "a reviewed transfer request must not accept a second decision");
  const approvalNotice = await pool.query("SELECT subject,body_text FROM email_notification_queue WHERE recipient_user_id=$1 AND subject='Your transfer letter request was approved' ORDER BY id DESC LIMIT 1", [learner.id]);
  assert.equal(approvalNotice.rowCount, 1, "approval must enqueue an applicant notification");
  assert(approvalNotice.rows[0].body_text.includes(verificationToken), "approval email must contain the protected verification link");
  const managerApprovedDownload = await request("/api/academic-records/transfer-requests/" + transferRequest.data.id + "/download", { token: seniorManagerToken });
  assert.equal(managerApprovedDownload.status, 200, "authorized senior managers must be able to download approved letters");
  await pool.query("UPDATE academic_transfer_requests SET verification_token_expires_at=now()-interval '1 second' WHERE id=$1", [transferRequest.data.id]);
  const expiredVerification = await request("/api/academic-records/transfer-verification/" + verificationToken);
  assert.equal(expiredVerification.status, 404, "expired verification tokens must no longer disclose transfer details");
  const adminApprovedDownload = await request("/api/academic-records/transfer-requests/" + transferRequest.data.id + "/download", { token: adminToken });
  assert.equal(adminApprovedDownload.status, 404, "Admin must not access reviewer-only approved transfer letters");
  const adminReviewRequest = await request("/api/academic-records/transfer-requests", { token: learner.token, method: "POST", body: { reason: "Admin review authorization integration test", formData: { ...transferFormData, learnerName: "PR84 Admin Review Learner" } } });
  assert.equal(adminReviewRequest.status, 201, "learner should be able to submit a separate request");
  const adminTransferReview = await request("/api/academic-records/transfer-requests/" + adminReviewRequest.data.id + "/review", { token: adminToken, method: "POST", body: { status: "approved", note: "CI Admin approval must be denied" } });
  assert.equal(adminTransferReview.status, 403, "Admin must not approve or reject transfer requests");
  const adminReviewRow = await pool.query("SELECT status FROM academic_transfer_requests WHERE id=$1", [adminReviewRequest.data.id]);
  assert.equal(adminReviewRow.rows[0].status, "pending", "Admin denial must leave the transfer request unchanged");
  const adminReviewedDownload = await request("/api/academic-records/transfer-requests/" + adminReviewRequest.data.id + "/download", { token: adminToken });
  assert.equal(adminReviewedDownload.status, 404, "Admin must not access transfer documents as a reviewer");
  const repeatTransferReview = await request("/api/academic-records/transfer-requests/" + transferRequest.data.id + "/review", { token: ownerToken, method: "POST", body: { status: "approved" } });
  assert.equal(repeatTransferReview.status, 404, "a reviewed request must not be reviewed twice");
  const rejectedRequest = await request("/api/academic-records/transfer-requests", { token: otherLearner.token, method: "POST", body: { reason: "Relocation for rejection test", formData: { ...transferFormData, learnerName: "PR84 Other Learner" } } });
  assert.equal(rejectedRequest.status, 201);
  const missingRejectionReason = await request("/api/academic-records/transfer-requests/" + rejectedRequest.data.id + "/review", { token: ownerToken, method: "POST", body: { status: "rejected" } });
  assert.equal(missingRejectionReason.status, 400, "rejection must require a reason");
  const rejectTransfer = await request("/api/academic-records/transfer-requests/" + rejectedRequest.data.id + "/review", { token: ownerToken, method: "POST", body: { status: "rejected", note: "Please correct the receiving school details." } });
  assert.equal(rejectTransfer.status, 200);
  assert.equal(rejectTransfer.data.status, "rejected");
  assert.equal(rejectTransfer.data.review_note, "Please correct the receiving school details.", "rejection reason must persist");
  const applicantDecisionNotice = await pool.query("SELECT subject,body_text FROM email_notification_queue WHERE recipient_user_id=$1 AND subject='Your transfer letter request was declined' ORDER BY id DESC LIMIT 1", [otherLearner.id]);
  assert.equal(applicantDecisionNotice.rowCount, 1, "rejection must enqueue an applicant notification");
  assert.match(applicantDecisionNotice.rows[0].body_text, /correct the receiving school details/i, "applicant notification must include reviewer feedback");
  const approvedTransferDownload = await request("/api/academic-records/transfer-requests/" + transferRequest.data.id + "/download", { token: learner.token });
  assert.equal(approvedTransferDownload.status, 200, "approved transfer letter should be downloadable by its learner");
  assert.match(String(approvedTransferDownload.data), /^%PDF-1\.4/, "approved transfer letter should be a PDF document");
  assert.match(String(approvedTransferDownload.data), /DALLYLETTER ELIDEMS/, "PDF should carry Dallyletter branding");
  assert.match(String(approvedTransferDownload.data), /Test Receiving School/, "PDF must include the submitted receiving-school data");
  assert.match(String(approvedTransferDownload.data), /Age on effective transfer date: 15/, "transfer PDF age must account for whether the birthday has occurred by the effective date");
  assert.match(String(approvedTransferDownload.data), /Page 1 of/, "PDF must include page numbering");
  const learnerDraftCreation = await request("/api/academic-records/reports/drafts", { token: learner.token, method: "POST", body: { learnerId: learner.id, reportType: "attendance_register", termLabel: "Unauthorized test" } });
  assert.equal(learnerDraftCreation.status, 403, "learners must not create or publish manager-reviewed report drafts");
  const missingReportPeriod = await request("/api/academic-records/reports/drafts", { token: ownerToken, method: "POST", body: { learnerId: learner.id, reportType: "attendance_register", termLabel: "Missing period test" } });
  const invalidReportPeriod = await request("/api/academic-records/reports/drafts", { token: ownerToken, method: "POST", body: { learnerId: learner.id, reportType: "attendance_register", termLabel: "Invalid period test", periodStart: "2026-02-30", periodEnd: "2026-03-01" } });
  assert.equal(invalidReportPeriod.status, 400, "invalid calendar dates must be rejected");
  assert.equal(missingReportPeriod.status, 400, "manager report generation must reject a descriptive term label without explicit date boundaries");
  const draftAttendance = await request("/api/academic-records/reports/drafts", { token: ownerToken, method: "POST", body: { learnerId: learner.id, reportType: "attendance_register", termLabel: "CI test term", periodStart: "2026-10-01", periodEnd: "2026-10-31" } });
  assert.equal(draftAttendance.status, 201, "attendance register should be generated as a draft from authoritative records");
  assert.equal(draftAttendance.data.status, "pending_review", "attendance register must require human review");
  assert.equal(String(draftAttendance.data.period_start).slice(0,10), "2026-10-01");
  assert.equal(String(draftAttendance.data.period_end).slice(0,10), "2026-10-31");
  const draftSnapshot = await pool.query("SELECT source_snapshot FROM academic_report_drafts WHERE id=$1", [draftAttendance.data.id]);
  assert.equal(draftSnapshot.rows[0].source_snapshot.assignmentMarks.length, 3, "term snapshot must exclude assignment submissions before periodStart");
  assert.equal(draftSnapshot.rows[0].source_snapshot.exerciseMarks.length, 3, "term snapshot must exclude exercise submissions before periodStart");
  assert(!draftSnapshot.rows[0].source_snapshot.exerciseMarks.some(row => Number(row.exercise_id) === Number(reportMarkLimitExercises[0].id)), "non-report-mark submissions must not enter the academic report source snapshot");
  assert.equal(draftSnapshot.rows[0].source_snapshot.markSummary.overall.percentage, 77.5, "term report percentage must exclude all out-of-period assignment and exercise marks");
  const blockedDraftDownload = await request("/api/academic-records/reports/drafts/" + draftAttendance.data.id + "/download", { token: learner.token });
  assert.equal(blockedDraftDownload.status, 403, "report draft must not be downloadable before approval");
  const blockedDraftPdf = await request("/api/academic-records/reports/drafts/" + draftAttendance.data.id + "/download/pdf", { token: learner.token });
  assert.equal(blockedDraftPdf.status, 403, "PDF report must not be downloadable before approval");
  const otherLearnerDraftDownload = await request("/api/academic-records/reports/drafts/" + draftAttendance.data.id + "/download", { token: otherLearner.token });
  assert.equal(otherLearnerDraftDownload.status, 404, "a different learner must not access another learner's report");
  const otherLearnerDraftPdf = await request("/api/academic-records/reports/drafts/" + draftAttendance.data.id + "/download/pdf", { token: otherLearner.token });
  assert.equal(otherLearnerDraftPdf.status, 404, "a different learner must not access another learner's PDF report");
  const learnerReportReview = await request("/api/academic-records/reports/drafts/" + draftAttendance.data.id + "/review", { token: learner.token, method: "POST", body: { status: "approved" } });
  assert.equal(learnerReportReview.status, 403, "learners must not approve academic reports");
  const approveDraft = await request("/api/academic-records/reports/drafts/" + draftAttendance.data.id + "/review", { token: ownerToken, method: "POST", body: { status: "approved", note: "CI-only manager approval" } });
  assert.equal(approveDraft.status, 200, "manager should be able to approve an academic report draft");
  const reportReviewAudit = await pool.query("SELECT id FROM audit_logs WHERE action=$1 AND target_type=$2 AND target_id=$3 AND performed_by=$4", ["academic_report.reviewed", "academic_report_draft", draftAttendance.data.id, ownerId]);
  assert.equal(reportReviewAudit.rowCount, 1, "report decision and its audit record must be committed together");
  const duplicateReportReview = await request("/api/academic-records/reports/drafts/" + draftAttendance.data.id + "/review", { token: ownerToken, method: "POST", body: { status: "approved", note: "Duplicate approval attempt" } });
  assert.equal(duplicateReportReview.status, 404, "a reviewed report draft must not accept a second decision");
  const approvedDraftDownload = await request("/api/academic-records/reports/drafts/" + draftAttendance.data.id + "/download", { token: learner.token });
  assert.equal(approvedDraftDownload.status, 200, "legacy JSON academic report download must remain available");
  const approvedDraftPdf = await request("/api/academic-records/reports/drafts/" + draftAttendance.data.id + "/download/pdf", { token: learner.token });
  assert.equal(approvedDraftPdf.status, 200, "approved academic report PDF should be downloadable by its learner");
  assert.match(String(approvedDraftPdf.data), /^%PDF-1\.4/, "approved academic report must be a genuine PDF");
  assert.match(String(approvedDraftPdf.data), /Period dates: 2026-10-01 to 2026-10-31/, "academic report PDF must print the verified inclusive period");
  assert.match(String(approvedDraftPdf.data), /Page 1 of 1/, "academic report PDF must include page numbering");
  const learnerApprovedReports = await request("/api/academic-records/reports/me", { token: learner.token });
  assert.equal(learnerApprovedReports.status, 200);
  assert(learnerApprovedReports.data.some(item => Number(item.id) === Number(draftAttendance.data.id)), "approved report must synchronize to the learner's Profile Hub");
  const otherLearnerReports = await request("/api/academic-records/reports/me", { token: otherLearner.token });
  assert.equal(otherLearnerReports.status, 200);
  assert.equal(otherLearnerReports.data.some(item => Number(item.id) === Number(draftAttendance.data.id)), false, "approved reports must not cross learner boundaries");
  const ownTransferList = await request("/api/academic-records/transfer-requests", { token: learner.token });
  assert.equal(ownTransferList.status, 200);
  assert(ownTransferList.data.some(item => Number(item.id) === Number(transferRequest.data.id)), "transfer request must persist and reload for its learner");
  const otherTransferList = await request("/api/academic-records/transfer-requests", { token: otherLearner.token });
  assert.equal(otherTransferList.status, 200);
  assert.equal(otherTransferList.data.some(item => Number(item.id) === Number(transferRequest.data.id)), false, "transfer requests must not cross learner boundaries");
  console.log("ACADEMIC_RECORDS_APPROVAL_E2E: PASS (own records, transfer approval gate, attendance draft review gate; isolated CI only)");

  
  // Exercise the newly added primary-email verification and change flows with the isolated Resend mock.
  const signupVerifyRequest = await request("/api/auth/email-verification/request", { token: learner.token, method: "POST", body: {} });
  assert.equal(signupVerifyRequest.status, 200, "signed-in new account can request signup email verification");
  const signupVerifyEmail = await waitFor(() => {
    const records = readFileSync(capturePath, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
    return records.findLast(record => record.provider === "resend" && record.body?.subject === "Verify your Dallyletter Elidems email" && record.body?.to?.includes("pr84-learner-" + suffix + "@example.test"));
  }, "signup verification email captured by test provider");
  const signupTokenMatch = String(signupVerifyEmail.body.text).match(/verify-email\?token=([a-f0-9]{64})/i);
  assert(signupTokenMatch, "signup verification message must contain a 64-character token");
  const signupVerifyConfirm = await request("/api/auth/email-verification/confirm", { method: "POST", body: { token: signupTokenMatch[1] } });
  assert.equal(signupVerifyConfirm.status, 200, "signup verification token should confirm");
  assert.equal(signupVerifyConfirm.data.verified, true);
  const signupVerifyReplay = await request("/api/auth/email-verification/confirm", { method: "POST", body: { token: signupTokenMatch[1] } });
  assert.equal(signupVerifyReplay.status, 400, "signup verification token must be one-use");
  const verifiedStatus = await pool.query("SELECT email,verified_at FROM account_email_status WHERE user_id=$1", [learner.id]);
  assert(verifiedStatus.rows[0]?.verified_at, "signup confirmation must persist verified status");
  console.log("SIGNUP_EMAIL_VERIFICATION_E2E_MOCK_PROVIDER:", JSON.stringify({ request: signupVerifyRequest.status, confirm: signupVerifyConfirm.status, replay: signupVerifyReplay.status, provider: "isolated CI mock; not real inbox delivery" }));

  const emailChangeAccount = await register("pr84-email-change-" + suffix + "@example.test");
  const changedEmail = "pr84-email-change-confirmed-" + suffix + "@example.test";
  const emailChangeRequest = await request("/api/auth/email-change/request", {
    token: emailChangeAccount.token,
    method: "POST",
    body: { email: changedEmail, currentPassword: "Test-only-Password-482!" },
  });
  assert.equal(emailChangeRequest.status, 200, "email change should require password re-auth and issue confirmation");
  const emailChangeMessage = await waitFor(() => {
    const records = readFileSync(capturePath, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
    return records.findLast(record => record.provider === "resend" && record.body?.subject === "Confirm your Dallyletter Elidems email change" && record.body?.to?.includes(changedEmail));
  }, "email-change confirmation email captured by test provider");
  const emailChangeTokenMatch = String(emailChangeMessage.body.text).match(/confirm-email-change\?token=([a-f0-9]{64})/i);
  assert(emailChangeTokenMatch, "email-change message must contain a 64-character token");
  const emailChangeConfirm = await request("/api/auth/email-change/confirm", { method: "POST", body: { token: emailChangeTokenMatch[1] } });
  assert.equal(emailChangeConfirm.status, 200, "email change should succeed after new-address confirmation");
  assert.equal(emailChangeConfirm.data.email, changedEmail);
  const emailChangeReplay = await request("/api/auth/email-change/confirm", { method: "POST", body: { token: emailChangeTokenMatch[1] } });
  assert.equal(emailChangeReplay.status, 400, "email-change token must be one-use");
  const revokedEmailChangeSession = await request("/api/auth/me", { token: emailChangeAccount.token });
  assert.equal(revokedEmailChangeSession.status, 401, "email change must revoke existing sessions");
  const newEmailLogin = await request("/api/auth/login", { method: "POST", body: { email: changedEmail, password: "Test-only-Password-482!" } });
  assert.equal(newEmailLogin.status, 200, "confirmed new email should authenticate");
  console.log("PRIMARY_EMAIL_CHANGE_E2E_MOCK_PROVIDER:", JSON.stringify({ request: emailChangeRequest.status, confirm: emailChangeConfirm.status, replay: emailChangeReplay.status, oldSessionRevoked: revokedEmailChangeSession.status, newEmailLogin: newEmailLogin.status, provider: "isolated CI mock; not real inbox delivery" }));


  // Generate a real, short-lived RS256 test ID token and matching JWKS. The API
  // still runs its production verifier; only Google's public signing-key endpoint
  // is intercepted by the isolated CI provider mock.
  const { publicKey: googleTestPublicKey, privateKey: googleTestPrivateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const googleTestJwk = googleTestPublicKey.export({ format: "jwk" });
  writeFileSync("/tmp/pr84-google-jwks.json", JSON.stringify({ keys: [{
    kty: "RSA", alg: "RS256", use: "sig", kid: "pr84-test-google-key",
    n: googleTestJwk.n, e: googleTestJwk.e,
  }] }));
  const encodeGooglePart = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const googleHeader = encodeGooglePart({ alg: "RS256", typ: "JWT", kid: "pr84-test-google-key" });
  const googleClaims = encodeGooglePart({
    iss: "https://accounts.google.com",
    aud: process.env.GOOGLE_CLIENT_ID,
    sub: "pr84-google-subject",
    email: "pr84-google-user@example.test",
    email_verified: true,
    name: "PR84 Google User",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,
  });
  const googleSigningInput = googleHeader + "." + googleClaims;
  const googleSignature = crypto.sign("RSA-SHA256", Buffer.from(googleSigningInput), googleTestPrivateKey).toString("base64url");
  const googleTestCredential = googleSigningInput + "." + googleSignature;
  const googleLogin = await request("/api/auth/google", { method: "POST", body: { credential: googleTestCredential } });
  assert.equal(googleLogin.status, 200, "Google ID token should be verified and create a learner account: " + JSON.stringify(googleLogin.data));
  assert.equal(googleLogin.data.user.email, "pr84-google-user@example.test");
  assert.equal(googleLogin.data.user.role, "student", "Google sign-up must use the safe learner default role");
  const googleRepeat = await request("/api/auth/google", { method: "POST", body: { credential: googleTestCredential } });
  assert.equal(googleRepeat.status, 200);
  assert.equal(Number(googleRepeat.data.user.id), Number(googleLogin.data.user.id), "Google subject must resolve to the same linked account");
  const googleInvalid = await request("/api/auth/google", { method: "POST", body: { credential: "mock-google-invalid" } });
  assert.equal(googleInvalid.status, 401, "invalid Google credentials must be rejected");
  console.log("GOOGLE_AUTH_E2E_MOCK_PROVIDER:", JSON.stringify({ firstLogin: googleLogin.status, repeatLogin: googleRepeat.status, invalidToken: googleInvalid.status, provider: "isolated CI JWKS mock; not a live Google OAuth verification" }));

  const catalog = await request("/api/subjects/catalog", { token: learner.token });
  assert.equal(catalog.status, 200);
  assert(catalog.data.subjects.includes("Maths"), "subject catalog must discover lesson/class subjects");
  const learnerSubjectSave = await request("/api/users/me/subjects", { token: learner.token, method: "PUT", body: { subjects: ["Maths", "English Language"] } });
  assert.equal(learnerSubjectSave.status, 200, "learners should be able to save learning subjects");
  const learnerSubjects = await request("/api/users/me/subjects", { token: learner.token });
  assert.deepEqual(learnerSubjects.data.subjects, ["Maths", "English Language"]);
  const teacherSubjectSave = await request("/api/users/me/subjects", { token: teacherToken, method: "PUT", body: { teaching_subjects: ["Maths", "Physics"], subjects_to_teach: ["Maths", "Physics"], primary_subject: "Physics" } });
  assert.equal(teacherSubjectSave.status, 200, "teachers should be able to save a primary specialization");
  assert.equal(teacherSubjectSave.data.primary_subject, "Physics");
  const learnerQualificationDenied = await request("/api/users/me/qualifications/bulk", { token: learner.token, method: "POST", body: { qualifications: ["Not a teacher qualification"] } });
  assert.equal(learnerQualificationDenied.status, 403, "learners must not create teacher qualifications");
  const bulkQualifications = await request("/api/users/me/qualifications/bulk", { token: teacherToken, method: "POST", body: { qualifications: ["Diploma in Education", "Bachelor of Science"] } });
  assert.equal(bulkQualifications.status, 201, "teacher should save all qualifications in one transaction");
  assert.equal(bulkQualifications.data.saved, 2);
  assert(bulkQualifications.data.qualifications.every(q => q.verification_status === "pending"));
  const qualificationId = Number(bulkQualifications.data.qualifications[0].id);
  const adminQualificationDenied = await request("/api/qualifications/" + qualificationId + "/verify", { token: adminToken, method: "PATCH", body: { status: "verified", reviewNote: "Admin role alone is not approval authority" } });
  assert.equal(adminQualificationDenied.status, 403, "admin role alone must not grant teacher qualification approval authority");
  const qualificationVerified = await request("/api/qualifications/" + qualificationId + "/verify", { token: ownerToken, method: "PATCH", body: { status: "verified", reviewNote: "CI owner verification test" } });
  assert.equal(qualificationVerified.status, 200, "authorized Owner must be able to verify a qualification through the application route");
  assert.equal(qualificationVerified.data.verification_status, "verified");
  const qualificationHistory = await request("/api/qualifications/" + qualificationId + "/review-history", { token: teacherToken });
  assert.equal(qualificationHistory.status, 200, "qualification owner must be able to inspect review history");
  assert.equal(qualificationHistory.data.history.length, 1, "each verification decision must be persisted in history");
  assert.equal(qualificationHistory.data.history[0].previous_status, "pending");
  assert.equal(qualificationHistory.data.history[0].new_status, "verified");
  assert.equal(qualificationHistory.data.history[0].review_note, "CI owner verification test");
  const learnerQualificationHistoryDenied = await request("/api/qualifications/" + qualificationId + "/review-history", { token: learner.token });
  assert.equal(learnerQualificationHistoryDenied.status, 404, "unrelated learners must not discover private qualification review history");
  const rejectedWithoutNote = await request("/api/qualifications/" + bulkQualifications.data.qualifications[1].id + "/verify", { token: ownerToken, method: "PATCH", body: { status: "rejected" } });
  assert.equal(rejectedWithoutNote.status, 400, "qualification rejection must require a review note");
  await pool.query("CREATE TABLE IF NOT EXISTS teacher_profiles (user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, cv jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now())");
  await pool.query("INSERT INTO teacher_profiles(user_id,cv) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO UPDATE SET cv=EXCLUDED.cv", [teacherId, JSON.stringify({ professionalSummary:"Experienced mathematics teacher.", education:"Bachelor of Education.", experience:"Teacher-provided experience details.", certifications:"Self-reported short course." })]);
  const cvPdfResponse = await fetch(base + "/api/users/me/teacher-cv/pdf", { headers: { Authorization: "Bearer " + teacherToken } });
  assert.equal(cvPdfResponse.status, 200, "teacher can download their own CV PDF");
  assert.equal(String(cvPdfResponse.headers.get("content-type")).split(";")[0], "application/pdf");
  assert.match(String(cvPdfResponse.headers.get("content-disposition")), /attachment; filename="dallyletter-teacher-cv-/);
  const cvPdf = Buffer.from(await cvPdfResponse.arrayBuffer()).toString("latin1");
  assert(cvPdf.startsWith("%PDF-1.4"), "teacher CV download must be a genuine PDF document");
  assert(cvPdf.includes("Diploma in Education"), "CV PDF includes verified qualifications");
  const cvQualificationStates = await pool.query("SELECT title,source,verification_status FROM teacher_qualifications WHERE user_id=$1 ORDER BY id", [teacherId]);
  console.log("CV_PDF_QUALIFICATION_DEBUG:", JSON.stringify(cvQualificationStates.rows));
  console.log("CV_PDF_BACHELOR_DEBUG:", JSON.stringify(cvPdf.split(/\\r?\\n/).filter(line => line.includes("Bachelor of Science"))));
  assert(!cvPdf.includes("Bachelor of Science"), "pending qualifications must be excluded from the verified qualification list");
  assert(cvPdf.includes("VERIFIED QUALIFICATIONS") && cvPdf.includes("TEACHER-PROVIDED DETAILS"), "CV PDF must visibly distinguish verified and self-reported information");
  const learnerCvDenied = await fetch(base + "/api/users/me/teacher-cv/pdf", { headers: { Authorization: "Bearer " + learner.token } });
  assert.equal(learnerCvDenied.status, 403, "learners must not access teacher CV PDFs");
  const learnerPublicProfile = await request("/api/users/" + learner.id + "/public-profile", { token: otherLearner.token });
  assert.equal(learnerPublicProfile.status, 200);
  assert.deepEqual(learnerPublicProfile.data.subjects, ["Maths", "English Language"]);
  assert(Array.isArray(learnerPublicProfile.data.groups_joined));
  assert.deepEqual(learnerPublicProfile.data.groups_joined, [], "other users must not see private group memberships");
  assert.equal(learnerPublicProfile.data.fees_status, null, "other users must not see a learner's fee status");
  assert.equal(learnerPublicProfile.data.lesson_requests_count, null, "other users must not see private prefect activity counts");
  assert.equal(learnerPublicProfile.data.verified_qualifications.length, 0, "learner profiles must not expose teacher qualifications");
  const teacherPublicProfile = await request("/api/users/" + teacherId + "/public-profile", { token: learner.token });
  assert.equal(teacherPublicProfile.status, 200);
  assert.deepEqual(teacherPublicProfile.data.subjects, ["Maths", "Physics"]);
  assert.equal(teacherPublicProfile.data.primary_subject, "Physics");
  assert.deepEqual(teacherPublicProfile.data.verified_qualifications.map(q => q.title), ["Diploma in Education"], "only verified teacher-entered qualifications should be public");
  const overviewPrivacyRestore = await request("/api/profile/me/privacy", {
    token: learner.token, method: "PUT",
    body: { chatPrivacy: "approval_required", sectionSettings: { overview: { mode: "everyone", selectedUserIds: [] } } },
  });
  assert.equal(overviewPrivacyRestore.status, 200, "learner can independently republish the overview section");
  await pool.query("UPDATE users SET is_prefect=true WHERE id=$1", [learner.id]);
  const prefectProfile = await request("/api/users/" + learner.id + "/public-profile", { token: otherLearner.token });
  assert.equal(prefectProfile.data.is_prefect, true, "profile role badge must reflect authoritative prefect promotion state");
  const prefectBroadcast = await request("/api/notifications", {
    token: learner.token, method: "POST",
    body: { title: "Invalid prefect broadcast", message: "This must not reach all users.", type: "class_starting", recipientId: null },
  });
  assert.equal(prefectBroadcast.status, 403, "prefects must not bypass the dedicated lesson-request workflow with global notifications");
  const prefectRoleBroadcast = await request("/api/notifications", {
    token: learner.token, method: "POST",
    body: { title: "Invalid role broadcast", message: "This must not reach a role group.", type: "class_starting", recipientId: otherLearner.id, recipientRole: "student" },
  });
  assert.equal(prefectRoleBroadcast.status, 403, "prefects must not bypass broadcast restrictions with role-targeted notifications");

  const prefectTeachers = await request("/api/achievements/prefect-teachers", { token: learner.token });
  assert.equal(prefectTeachers.status, 200, "prefects must be able to select authorized teachers");
  assert(prefectTeachers.data.some(item => Number(item.id) === teacherId), "active teacher must appear in the prefect recipient list");
  const lessonRequest = await request("/api/achievements/lesson-requests", {
    token: learner.token, method: "POST",
    body: { teacherId, topic: "Integration lesson request", preferredDate: "2026-11-10", notes: "Persisted request test" },
  });
  assert.equal(lessonRequest.status, 201, "prefect request must persist against a specific teacher");
  const teacherLessonRequests = await request("/api/achievements/lesson-requests", { token: teacherToken });
  assert(teacherLessonRequests.data.some(item => Number(item.id) === Number(lessonRequest.data.id)), "assigned teacher must see the persisted request");
  await pool.query("UPDATE users SET teacher_application_status='pending_review' WHERE id=$1", [teacherId]);
  const pendingTeacherRequests = await request("/api/achievements/lesson-requests", { token: teacherToken });
  assert.deepEqual(pendingTeacherRequests.data, [], "pending teachers must not receive active lesson requests");
  const pendingTeacherDecision = await request("/api/achievements/lesson-requests/" + lessonRequest.data.id, {
    token: teacherToken, method: "PATCH", body: { status: "accepted" },
  });
  assert.equal(pendingTeacherDecision.status, 403, "pending teachers must not respond to prefect lesson requests");
  await pool.query("UPDATE users SET teacher_application_status='not_applicable' WHERE id=$1", [teacherId]);
  const otherLearnerDecision = await request("/api/achievements/lesson-requests/" + lessonRequest.data.id, {
    token: otherLearner.token, method: "PATCH", body: { status: "accepted" },
  });
  assert.equal(otherLearnerDecision.status, 403, "unrelated learner must not decide another prefect's request");
  const prefectFakeDecision = await request("/api/achievements/lesson-requests/" + lessonRequest.data.id, {
    token: learner.token, method: "PATCH", body: { status: "accepted" },
  });
  assert.equal(prefectFakeDecision.status, 403, "prefect must not impersonate the assigned teacher");
  const teacherDecision = await request("/api/achievements/lesson-requests/" + lessonRequest.data.id, {
    token: teacherToken, method: "PATCH", body: { status: "accepted", teacherReply: "I will prepare this lesson." },
  });
  assert.equal(teacherDecision.status, 200, "only the assigned teacher should accept and reply");
  assert.equal(teacherDecision.data.status, "accepted");
  const teacherReopen = await request("/api/achievements/lesson-requests/" + lessonRequest.data.id, {
    token: teacherToken, method: "PATCH", body: { status: "pending" },
  });
  assert.equal(teacherReopen.status, 403, "assigned teacher must not reset a decided request to pending");
  const cancellableRequest = await request("/api/achievements/lesson-requests", {
    token: learner.token, method: "POST", body: { teacherId, topic: "Prefect cancellation test" },
  });
  assert.equal(cancellableRequest.status, 201);
  const prefectCancel = await request("/api/achievements/lesson-requests/" + cancellableRequest.data.id, {
    token: learner.token, method: "PATCH", body: { status: "cancelled" },
  });
  assert.equal(prefectCancel.status, 200, "requesting prefect may cancel their own pending request");
  assert.equal(prefectCancel.data.status, "cancelled");
  console.log("PREFECT_LESSON_REQUEST_E2E: PASS (authorized teacher recipient, persistence, teacher visibility, broadcast denial, requester cancellation, role-scoped decisions and no status reset)");

  console.log("PROFILE_SUBJECTS_E2E:", JSON.stringify({ catalogContainsLiveClassSubject: true, learnerSubjectSave: learnerSubjectSave.status, teacherPrimarySubject: teacherSubjectSave.data.primary_subject, learnerQualificationsHidden: true, prefectState: prefectProfile.data.is_prefect }));

  const phone = "+263771234567";
  const phoneSaved = await request("/api/users/" + learner.id, { token: learner.token, method: "PATCH", body: { phone } });
  assert.equal(phoneSaved.status, 200, "learner should be able to save a contact phone number");
  const phoneRequest = await request("/api/users/me/phone/request-verification", { token: learner.token, method: "POST", body: { phone } });
  assert.equal(phoneRequest.status, 200, "configured mock SMS provider should accept phone verification");
  const capturedSms = await waitFor(() => {
    const records = readFileSync(capturePath, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
    return records.findLast(record => record.provider === "twilio" && record.body?.to === phone && /verification code is \d{6}/i.test(record.body?.text || ""));
  }, "six-digit SMS verification code captured by isolated test provider");
  const phoneCodeMatch = String(capturedSms.body.text).match(/verification code is (\d{6})/i);
  assert(phoneCodeMatch, "captured SMS should contain a six-digit code");
  const wrongPhoneCode = await request("/api/users/me/phone/confirm", { token: learner.token, method: "POST", body: { code: "000000" } });
  assert.equal(wrongPhoneCode.status, 400, "incorrect SMS code must not verify a phone");
  const phoneVerified = await request("/api/users/me/phone/confirm", { token: learner.token, method: "POST", body: { code: phoneCodeMatch[1] } });
  assert.equal(phoneVerified.status, 200, "correct SMS code should verify the phone");
  assert.equal(phoneVerified.data.verified, true);
  const phoneReplay = await request("/api/users/me/phone/confirm", { token: learner.token, method: "POST", body: { code: phoneCodeMatch[1] } });
  assert.equal(phoneReplay.status, 400, "verified SMS code must be one-time use");
  const verifiedPhone = await pool.query("SELECT u.phone,r.recovery_phone_verified_at,r.recovery_phone FROM users u JOIN account_recovery_profiles r ON r.user_id=u.id WHERE u.id=$1", [learner.id]);
  assert.equal(verifiedPhone.rows[0].phone, phone);
  assert.equal(verifiedPhone.rows[0].recovery_phone, phone);
  assert(verifiedPhone.rows[0].recovery_phone_verified_at);
  console.log("PHONE_VERIFICATION_E2E_MOCK_PROVIDER:", JSON.stringify({ save: phoneSaved.status, send: phoneRequest.status, verify: phoneVerified.status, verified: true, provider: "isolated Twilio mock; not a live SMS delivery" }));

  const health = await request("/api/healthz");
  assert.equal(health.status, 200);
  assert.deepEqual(health.data, { status: "ok" });
  console.log("HEALTH_JSON:", JSON.stringify(health.data));

  assert.equal((await request("/api/users/me/enrollments-summary")).status, 401, "enrollment summary must require authentication");
  const enrolled = await request(`/api/classes/${classId}/enroll`, { token: learner.token, method: "POST", body: {} });
  assert.equal(enrolled.status, 201, "learner self-enrollment should succeed: " + JSON.stringify(enrolled.data));
  const enrollmentId = Number(enrolled.data.id);
  assert(Number.isSafeInteger(enrollmentId) && enrollmentId > 0);
  const ownerReportLearners = await request("/api/academic-records/report-learners", { token: ownerToken });
  assert.equal(ownerReportLearners.status, 200, "Owner can retrieve learners for academic report creation");
  assert(ownerReportLearners.data.some(item => Number(item.id) === learner.id), "Owner report learner list must include the enrolled learner");
  const teacherReportLearners = await request("/api/academic-records/report-learners", { token: teacherToken });
  assert.equal(teacherReportLearners.status, 200, "Authorized teacher can retrieve assigned learners for academic report creation");
  assert(teacherReportLearners.data.some(item => Number(item.id) === learner.id), "Teacher report learner list must include their enrolled learner");
  assert.equal(teacherReportLearners.data.some(item => Number(item.id) === otherLearner.id), false, "Teacher report learner list must exclude learners outside assigned classes");
  const learnerReportLearners = await request("/api/academic-records/report-learners", { token: learner.token });
  assert.equal(learnerReportLearners.status, 403, "Learners cannot access the staff academic report learner list");
  console.log("ACADEMIC_REPORT_LEARNER_LIST_E2E: PASS (owner visibility, assigned-teacher scoping, learner denial)");
  const crossEnroll = await request(`/api/classes/${classId}/enroll`, {
    token: learner.token, method: "POST", body: { learnerId: otherLearner.id },
  });
  assert.equal(crossEnroll.status, 403, "learner must not enroll another learner");

  const enrollmentList = await request("/api/users/me/enrollments", { token: learner.token });
  assert.equal(enrollmentList.status, 200);
  assert(enrollmentList.data.some(item => Number(item.class_id) === classId));
  const progress = await request(`/api/enrollments/${enrollmentId}/progress`, {
    token: learner.token, method: "PATCH", body: { progress_percent: 50 },
  });
  assert.equal(progress.status, 200);
  assert.equal(Number(progress.data.progress_percent), 50);
  const summary = await request("/api/users/me/enrollments-summary", { token: learner.token });
  assert.equal(summary.status, 200);
  assert.equal(Number(summary.data.enrollment_count), 1);
  assert.equal(Number(summary.data.progress_percent), 50);
  console.log("ENROLLMENT_E2E:", JSON.stringify({ selfEnroll: enrolled.status, crossEnroll: crossEnroll.status, progress: progress.data.progress_percent, summary: summary.data }));

  const teacherHistoryDenied = await request("/api/payouts/history", { token: teacherToken });
  assert.equal(teacherHistoryDenied.status, 403, "teacher must not access owner payout history");
  const learnerHistoryDenied = await request("/api/payouts/history", { token: learner.token });
  assert.equal(learnerHistoryDenied.status, 403, "learner must not access owner payout history");
  const ownerHistory = await request("/api/payouts/history", { token: ownerToken });
  assert.equal(ownerHistory.status, 200, "owner should access payout history");
  const payoutPreview = await request("/api/users/" + teacherId + "/payout-preview", { token: ownerToken });
  assert.equal(payoutPreview.status, 200);
  assert.equal(payoutPreview.data.destination_masked.includes("teacher-" + suffix + "@example.test"), false, "payout destination must be masked");
  const teacherPayoutDenied = await request("/api/payouts/execute", {
    token: teacherToken, method: "POST", body: { teacherId, amount: 12.5 },
  });
  assert.equal(teacherPayoutDenied.status, 403, "teacher must not execute payouts");
  console.log("ROLE_ACCESS_E2E:", JSON.stringify({
    learnerCannotReadPayoutHistory: learnerHistoryDenied.status,
    teacherCannotReadPayoutHistory: teacherHistoryDenied.status,
    ownerCanReadPayoutHistory: ownerHistory.status,
    ownerPayoutPreview: payoutPreview.data.destination_masked,
    teacherCannotExecutePayout: teacherPayoutDenied.status,
  }));

  const otpEmail = `pr84-notify-${suffix}@example.test`;
  const otpRequest = await request("/api/users/me/notification-email/request", {
    token: learner.token, method: "POST", body: { email: otpEmail },
  });
  assert.equal(otpRequest.status, 200, "mocked Resend provider should accept OTP request: " + JSON.stringify(otpRequest.data));
  const captured = await waitFor(() => {
    const records = readFileSync(capturePath, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
    return records.findLast(record => record.provider === "resend" && record.body?.subject === "Verify your Dallyletter notification email" && record.body?.to?.includes(otpEmail));
  }, "OTP email captured by test provider");
  const otpMatch = String(captured.body.text).match(/verification code is (\d{6})/i);
  assert(otpMatch, "captured OTP email should contain a six-digit code");
  const otp = otpMatch[1];
  const verified = await request("/api/users/me/notification-email/verify", {
    token: learner.token, method: "POST", body: { email: otpEmail, otp },
  });
  assert.equal(verified.status, 200);
  assert.equal(verified.data.verified, true);
  const replay = await request("/api/users/me/notification-email/verify", {
    token: learner.token, method: "POST", body: { email: otpEmail, otp },
  });
  assert.equal(replay.status, 400, "OTP must be one-use");
  console.log("OTP_E2E_MOCK_PROVIDER:", JSON.stringify({ request: otpRequest.status, verify: verified.status, replay: replay.status, provider: "isolated CI mock; not a real Resend delivery" }));

  const queueRow = await waitFor(async () => {
    const q = await pool.query("SELECT status,attempts FROM email_notification_queue WHERE recipient_user_id=$1 ORDER BY id DESC LIMIT 1", [learner.id]);
    return q.rows[0]?.status === "sent" ? q.rows[0] : null;
  }, "email notification queue to process enrollment message");
  console.log("EMAIL_QUEUE_E2E_MOCK_PROVIDER:", JSON.stringify(queueRow));

  const webhookHeaders = {
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-cert-url": "https://api-m.paypal.com/test-cert",
    "paypal-transmission-id": "pr84-ci-transmission",
    "paypal-transmission-sig": "mock-signature",
    "paypal-transmission-time": new Date().toISOString(),
  };
  const invalidWebhook = await request("/api/webhooks/paypal", {
    method: "POST",
    headers: webhookHeaders,
    body: {
      id: "mock-invalid-signature",
      event_type: "PAYMENT.PAYOUTSBATCH.SUCCESS",
      resource: { batch_header: { payout_batch_id: "PR84-MOCK-PAYOUT-" + suffix } },
    },
  });
  assert.equal(invalidWebhook.status, 401, "provider rejection must reject invalid webhook signature");
  const validWebhook = await request("/api/webhooks/paypal", {
    method: "POST",
    headers: webhookHeaders,
    body: {
      id: "mock-valid-signature",
      event_type: "PAYMENT.PAYOUTSBATCH.SUCCESS",
      resource: { batch_header: { payout_batch_id: "PR84-MOCK-PAYOUT-" + suffix } },
    },
  });
  assert.equal(validWebhook.status, 200, "provider acceptance should allow the signed webhook");
  const payoutState = await pool.query("SELECT status,webhook_verified FROM payout_history WHERE id=$1", [payoutId]);
  assert.equal(payoutState.rows[0].status, "paid");
  assert.equal(payoutState.rows[0].webhook_verified, true);
  const paynowDisabled = await request("/api/webhooks/paynow", {
    method: "POST", body: { reference: "PR84-NOT-A-REAL-PAYMENT", status: "paid" },
  });
  assert.equal(paynowDisabled.status, 503, "native Paynow state changes must stay disabled without configured provider-specific verification");
  console.log("PAYOUT_WEBHOOK_E2E_MOCK_PROVIDER:", JSON.stringify({ invalidSignature: invalidWebhook.status, validSignature: validWebhook.status, updated: payoutState.rows[0], paynowFailClosed: paynowDisabled.status, payoutExecutionAttempted: false }));

  // Verify the real application password-reset flow against an isolated test account.
  // The provider is intentionally mocked here; this proves token behavior, not inbox delivery.
  const recoveryEmail = `pr84-recovery-${suffix}@example.test`;
  await pool.query("CREATE TABLE IF NOT EXISTS account_recovery_profiles (user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, recovery_email text, recovery_email_verified_at timestamptz, recovery_phone text, recovery_phone_verified_at timestamptz, security_question text, security_answer_hash text, verification_code_hash text, verification_expires_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now())");
  const recoverySecurityAnswer = "Blue river at dawn";
  const answerSalt = crypto.randomBytes(16);
  const answerHash = crypto.scryptSync(recoverySecurityAnswer.normalize("NFKC").toLowerCase(), answerSalt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const recoverySecurityAnswerHash = "scrypt$16384$8$1$" + answerSalt.toString("hex") + "$" + answerHash.toString("hex");
  await pool.query(
    "INSERT INTO account_recovery_profiles (user_id,recovery_email,recovery_email_verified_at,security_question,security_answer_hash) VALUES ($1,$2,now(),$3,$4) ON CONFLICT (user_id) DO UPDATE SET recovery_email=EXCLUDED.recovery_email,recovery_email_verified_at=now(),security_question=EXCLUDED.security_question,security_answer_hash=EXCLUDED.security_answer_hash",
    [learner.id, recoveryEmail, "What phrase did you save for recovery?", recoverySecurityAnswerHash],
  );
  const resetRequest = await request("/api/auth/password-reset/request", {
    method: "POST", body: { email: recoveryEmail },
  });
  assert.equal(resetRequest.status, 202, "verified alternate email should be accepted for recovery");
  const resetEmail = await waitFor(() => {
    const records = readFileSync(capturePath, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
    return records.findLast(record => record.provider === "resend" && record.body?.subject === "Reset your Dallyletter Elidems password" && record.body?.to?.includes(recoveryEmail));
  }, "password reset email captured by test provider");
  const tokenMatch = String(resetEmail.body.text).match(/reset-password\?token=([a-f0-9]{64})/i);
  assert(tokenMatch, "reset email should contain a 64-character one-time token");
  const resetToken = tokenMatch[1];
  const oldSessionBeforeReset = await request("/api/users/me/enrollments", { token: learner.token });
  assert.equal(oldSessionBeforeReset.status, 200, "learner session should be valid before password reset");
  const newPassword = "New-Test-Password-593!";
  const resetDetails = await request("/api/auth/password-reset/details?token=" + encodeURIComponent(resetToken));
  assert.equal(resetDetails.status, 200, "valid backup-email reset token should reveal the saved security question");
  assert.equal(resetDetails.data.requiresSecurityAnswer, true, "backup-email reset must require a security answer");
  assert.equal(resetDetails.data.securityQuestion, "What phrase did you save for recovery?", "the saved security question must be returned");
  const resetConfirm = await request("/api/auth/password-reset/confirm", {
    method: "POST", body: { token: resetToken, newPassword, securityAnswer: recoverySecurityAnswer },
  });
  assert.equal(resetConfirm.status, 200, "password reset should succeed with a valid token");
  const oldSessionAfterReset = await request("/api/users/me/enrollments", { token: learner.token });
  assert.equal(oldSessionAfterReset.status, 401, "password reset must revoke existing sessions");
  const resetReplay = await request("/api/auth/password-reset/confirm", {
    method: "POST", body: { token: resetToken, newPassword },
  });
  assert.equal(resetReplay.status, 400, "password reset token must be one-use");

  // Expiry must be enforced by the server/database, not only by the reset page UI.
  // This row is created in the isolated CI PostgreSQL database only.
  const expiredResetToken = crypto.randomBytes(32).toString("hex");
  const expiredResetDigest = crypto.createHash("sha256").update(expiredResetToken).digest("hex");
  await pool.query(
    "INSERT INTO password_reset_tokens(token_hash,user_id,expires_at) VALUES($1,$2,now()-interval '1 minute')",
    [expiredResetDigest, learner.id],
  );
  const expiredResetConfirm = await request("/api/auth/password-reset/confirm", {
    method: "POST", body: { token: expiredResetToken, newPassword: "Expired-Test-Password-123!" },
  });
  assert.equal(expiredResetConfirm.status, 400, "expired password reset token must be rejected");
  console.log("PASSWORD_RESET_EXPIRY_E2E:", JSON.stringify({ expiredTokenRejected: expiredResetConfirm.status, provider: "isolated CI PostgreSQL" }));

  const oldPasswordLoginAfterReset = await request("/api/auth/login", {
    method: "POST", body: { email: `pr84-learner-${suffix}@example.test`, password: "Test-only-Password-482!" },
  });
  assert.equal(oldPasswordLoginAfterReset.status, 401, "old password must fail immediately after reset");

  const loginAfterReset = await request("/api/auth/login", {
    method: "POST", body: { email: `pr84-learner-${suffix}@example.test`, password: newPassword },
  });
  assert.equal(loginAfterReset.status, 200, "new password should authenticate successfully");
  console.log("PASSWORD_RECOVERY_E2E_MOCK_PROVIDER:", JSON.stringify({
    verifiedAlternateEmailAccepted: resetRequest.status,
    confirm: resetConfirm.status,
    replay: resetReplay.status,
    oldSessionRevoked: oldSessionAfterReset.status,
    newPasswordLogin: loginAfterReset.status,
    oldPasswordRejected: oldPasswordLoginAfterReset.status,
    provider: "isolated CI mock; not a real Resend delivery",
  }));

  // Revoke a Senior Manager role while retaining the same JWT: current database authority must win.
  const demoteSenior = await request("/api/manager-permissions/" + seniorManagerId + "/role", { token: ownerToken, method: "PATCH", body: { role: "junior_manager" } });
  assert.equal(demoteSenior.status, 200, "Owner can demote a Senior Manager");
  const demotedSeniorPermissions = await request("/api/manager-permissions/me", { token: seniorManagerToken });
  assert.equal(demotedSeniorPermissions.status, 200);
  assert.equal(demotedSeniorPermissions.data.role, "junior_manager", "Permission response must use current database role, not stale JWT role");
  assert.equal(demotedSeniorPermissions.data.permissions["manager.dashboard.view"], true, "An individually Owner-granted non-senior capability must remain explicit across demotion");
  assert.equal(demotedSeniorPermissions.data.permissions["transfers.approve"], true, "Owner-granted operational approval remains attached to the manager after demotion");
  assert.equal(demotedSeniorPermissions.data.permissions["attendance.view"], true, "The Owner's explicit non-senior attendance grant remains attached to this manager after demotion");
  const demotedSeniorDashboard = await request("/api/manager/dashboard", { token: seniorManagerToken });
  assert.equal(demotedSeniorDashboard.status, 200, "Explicitly granted manager dashboard access remains available to the now-Junior manager");
  const demotedSeniorApproval = await request("/api/academic-records/transfer-requests/999999/review", { token: seniorManagerToken, method: "POST", body: { status: "approved" } });
  assert.equal(demotedSeniorApproval.status, 404, "A demoted manager with a preserved approval grant reaches the resource lookup, proving the grant remains effective");
   const revokeDemotedApproval = await request("/api/manager-permissions/" + seniorManagerId, { token: ownerToken, method: "PUT", body: { permissions: [{ key: "transfers.approve", granted: false }] } });
   assert.equal(revokeDemotedApproval.status, 200, "Owner can revoke the preserved operational grant after demotion");
   const demotedApprovalAfterRevoke = await request("/api/academic-records/transfer-requests/999999/review", { token: seniorManagerToken, method: "POST", body: { status: "approved" } });
   assert.equal(demotedApprovalAfterRevoke.status, 403, "Operational permission revocation takes effect immediately after demotion");
  const restoreSenior = await request("/api/manager-permissions/" + seniorManagerId + "/role", { token: ownerToken, method: "PATCH", body: { role: "senior_manager" } });
  assert.equal(restoreSenior.status, 200, "Senior test account can be restored after revocation assertions");
  console.log("PROFILE_HUB_INTEGRATION_RESULT: PASS (isolated ephemeral PostgreSQL + mocked email/PayPal providers; no live provider call or real payout)");
} finally {
  await pool.end();
}
