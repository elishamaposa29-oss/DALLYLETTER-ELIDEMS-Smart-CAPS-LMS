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
  const webChat = readFileSync(new URL("../../../artifacts/dallyletter/src/pages/student/StudentChat.tsx", import.meta.url), "utf8");
  const webGroups = readFileSync(new URL("../../../artifacts/dallyletter/src/pages/student/StudentStudyGroups.tsx", import.meta.url), "utf8");
  const webTeacherClasses = readFileSync(new URL("../../../artifacts/dallyletter/src/pages/teacher/TeacherClasses.tsx", import.meta.url), "utf8");
  const webTeacherAssignments = readFileSync(new URL("../../../artifacts/dallyletter/src/pages/teacher/TeacherAssignments.tsx", import.meta.url), "utf8");
  const webLeaderboard = readFileSync(new URL("../../../artifacts/dallyletter/src/pages/student/StudentAchievements.tsx", import.meta.url), "utf8");
  const webPrefects = readFileSync(new URL("../../../artifacts/dallyletter/src/pages/manager/ManagerPrefects.tsx", import.meta.url), "utf8");
  const mobileFeatureHub = readFileSync(new URL("../../../artifacts/dallyletter-mobile/components/FeatureHub.tsx", import.meta.url), "utf8");
  const mobileGroupChat = readFileSync(new URL("../../../artifacts/dallyletter-mobile/app/(student)/chat.tsx", import.meta.url), "utf8");
  const mobileTeacherChat = readFileSync(new URL("../../../artifacts/dallyletter-mobile/app/(teacher)/chat.tsx", import.meta.url), "utf8");

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
  const managerResult = await pool.query("INSERT INTO users(email,password_hash,name,role) VALUES($1,$2,$3,'manager') RETURNING id", ["profile-hub-manager-" + suffix + "@example.test", "test-only-not-a-login-hash", "PR84 Test Manager"]);
  const managerId = Number(managerResult.rows[0].id);
  const adminResult = await pool.query("INSERT INTO users(email,password_hash,name,role) VALUES($1,$2,$3,'admin') RETURNING id", ["profile-hub-admin-" + suffix + "@example.test", "test-only-not-a-login-hash", "PR84 Test Admin"]);
  const adminId = Number(adminResult.rows[0].id);
  const seniorManagerResult = await pool.query("INSERT INTO users(email,password_hash,name,role) VALUES($1,$2,$3,'senior_manager') RETURNING id", ["profile-hub-senior-manager-" + suffix + "@example.test", "test-only-not-a-login-hash", "PR84 Test Senior Manager"]);
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
  assert.equal(managerSafetyQueue.status, 200, "manager role must retain safety moderation access without a legacy manager flag");
  const seniorSafetyQueue = await request("/api/content-flags", { token: seniorManagerToken });
  assert.equal(seniorSafetyQueue.status, 200, "senior manager must retain safety moderation access");
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

  // Owner-class aliases and both explicit management tiers retain existing achievement controls.
  const adminAchievement = await request("/api/achievements", { token: adminToken, method: "POST", body: { name: "PR84 Admin Award " + suffix, description: "CI-only owner-class achievement", pointsValue: 5 } });
  assert.equal(adminAchievement.status, 201, "owner-class admin must retain achievement creation access");
  const seniorAchievement = await request("/api/achievements", { token: adminToken, method: "POST", body: { name: "PR84 Senior Award " + suffix, description: "CI-only manager-tier achievement", pointsValue: 7 } });
  assert.equal(seniorAchievement.status, 201, "owner-class admin must create the second isolated test achievement");
  const adminAward = await request("/api/achievements/award", { token: adminToken, method: "POST", body: { userId: learner.id, achievementId: adminAchievement.data.id, note: "CI owner-class admin award" } });
  assert.equal(adminAward.status, 201, "owner-class admin must retain award authority");
  const adminAwardNonLearner = await request("/api/achievements/award", { token: adminToken, method: "POST", body: { userId: managerId, achievementId: adminAchievement.data.id } });
  assert.equal(adminAwardNonLearner.status, 404, "owner direct awards must target active learners only");
  const adminAwardInactiveBadge = await request("/api/achievements/award", { token: adminToken, method: "POST", body: { userId: learner.id, achievementId: 999999 } });
  assert.equal(adminAwardInactiveBadge.status, 404, "owner direct awards must use an active achievement");

  const juniorDirectAward = await request("/api/achievements/award", { token: managerToken, method: "POST", body: { userId: otherLearner.id, achievementId: seniorAchievement.data.id, note: "CI direct junior award must be blocked" } });
  assert.equal(juniorDirectAward.status, 403, "junior managers must not bypass senior approval");
  const juniorRecommendation = await request("/api/achievements/award/recommendations", { token: managerToken, method: "POST", body: { userId: otherLearner.id, achievementId: seniorAchievement.data.id, note: "CI junior recommendation" } });
  assert.equal(juniorRecommendation.status, 201, "junior manager should be able to recommend an award");
  assert.equal(juniorRecommendation.data.status, "pending_senior_review");
  const duplicateRecommendation = await request("/api/achievements/award/recommendations", { token: managerToken, method: "POST", body: { userId: otherLearner.id, achievementId: seniorAchievement.data.id, note: "Duplicate recommendation" } });
  assert.equal(duplicateRecommendation.status, 409, "duplicate pending recommendations must be rejected");
  const juniorSelfApproval = await request("/api/achievements/award/recommendations/" + juniorRecommendation.data.id + "/review", { token: managerToken, method: "POST", body: { status: "approved" } });
  assert.equal(juniorSelfApproval.status, 403, "junior managers cannot approve recommendations");
  const pendingForSenior = await request("/api/achievements/award/recommendations", { token: seniorManagerToken });
  assert(pendingForSenior.data.items.some(row => Number(row.id) === Number(juniorRecommendation.data.id)), "senior manager must see pending recommendations");
  const seniorManagerAward = await request("/api/achievements/award/recommendations/" + juniorRecommendation.data.id + "/review", { token: seniorManagerToken, method: "POST", body: { status: "approved", note: "CI senior approval" } });
  assert.equal(seniorManagerAward.status, 200, "senior manager should approve a junior recommendation");
  assert.equal(seniorManagerAward.data.recommendation.status, "approved");
  assert.equal(Number(seniorManagerAward.data.award.awarded_by), seniorManagerId, "final award attribution must identify the senior approver");
  const repeatSeniorApproval = await request("/api/achievements/award/recommendations/" + juniorRecommendation.data.id + "/review", { token: seniorManagerToken, method: "POST", body: { status: "approved" } });
  assert.equal(repeatSeniorApproval.status, 404, "approved recommendations cannot be approved twice");
  const learnerAwards = await request("/api/achievements/user/" + learner.id, { token: learner.token });
  assert(learnerAwards.data.some(row => Number(row.achievementId) === Number(adminAchievement.data.id)));
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
  const teacherPayoutPreferences = await request("/api/users/me/payout-preferences", { token: teacherToken });
  assert.equal(teacherPayoutPreferences.status, 200, "teachers should be able to read their own payout preferences");
  assert.equal(Array.isArray(teacherPayoutPreferences.data), false, "payout preferences must not be treated as a payment ledger");
  console.log("PAYMENT_LEDGER_OWNERSHIP_E2E: PASS (isolated CI row, list isolation, ID isolation, staff access, payout preference separation)");

  // Seed real marked, unmarked and exempt assignment/exercise records in isolated CI PostgreSQL.
  const reportLesson = await pool.query("INSERT INTO lessons(title,subject,teacher_id,teacher_name) VALUES($1,$2,$3,$4) RETURNING id", ["PR84 Report Lesson", "Mathematics", teacherId, "PR84 Test Teacher"]);
  const reportAssignment = await pool.query("INSERT INTO assignments(title,subject,due_date,total_marks,teacher_id,teacher_name,status) VALUES($1,$2,$3,100,$4,$5,'active') RETURNING id", ["PR84 Marked Assignment", "Mathematics", "2099-12-31", teacherId, "PR84 Test Teacher"]);
  const unmarkedAssignment = await pool.query("INSERT INTO assignments(title,subject,due_date,total_marks,teacher_id,teacher_name,status) VALUES($1,$2,$3,50,$4,$5,'active') RETURNING id", ["PR84 Unmarked Assignment", "Mathematics", "2099-12-31", teacherId, "PR84 Test Teacher"]);
  const exemptAssignment = await pool.query("INSERT INTO assignments(title,subject,due_date,total_marks,teacher_id,teacher_name,status) VALUES($1,$2,$3,40,$4,$5,'active') RETURNING id", ["PR84 Exempt Assignment", "Mathematics", "2099-12-31", teacherId, "PR84 Test Teacher"]);
  await pool.query("INSERT INTO assignment_submissions(assignment_id,student_id,student_name,status,marks,submitted_at,graded_at) VALUES($1,$2,$3,'graded',75,now(),now())", [reportAssignment.rows[0].id, learner.id, "PR84 Integration Learner"]);
  await pool.query("INSERT INTO assignment_submissions(assignment_id,student_id,student_name,status,marks,submitted_at) VALUES($1,$2,$3,'submitted',NULL,now())", [unmarkedAssignment.rows[0].id, learner.id, "PR84 Integration Learner"]);
  await pool.query("INSERT INTO assignment_submissions(assignment_id,student_id,student_name,status,marks,submitted_at) VALUES($1,$2,$3,'exempt',NULL,now())", [exemptAssignment.rows[0].id, learner.id, "PR84 Integration Learner"]);
  await pool.query("INSERT INTO assignment_submissions(assignment_id,student_id,student_name,status,marks,submitted_at) VALUES($1,$2,$3,'graded',99,'2026-09-30T12:00:00Z')", [reportAssignment.rows[0].id, learner.id, "PR84 Integration Learner"]);
  const reportExercise = await pool.query("INSERT INTO exercises(lesson_id,created_by,title,total_marks,status) VALUES($1,$2,$3,20,'published') RETURNING id", [reportLesson.rows[0].id, teacherId, "PR84 Marked Exercise"]);
  const unmarkedExercise = await pool.query("INSERT INTO exercises(lesson_id,created_by,title,total_marks,status) VALUES($1,$2,$3,10,'published') RETURNING id", [reportLesson.rows[0].id, teacherId, "PR84 Unmarked Exercise"]);
  const exemptExercise = await pool.query("INSERT INTO exercises(lesson_id,created_by,title,total_marks,status) VALUES($1,$2,$3,15,'published') RETURNING id", [reportLesson.rows[0].id, teacherId, "PR84 Exempt Exercise"]);
  await pool.query("INSERT INTO exercise_submissions(exercise_id,learner_id,attempt_number,status,total_score,percentage,submitted_at,marked_at,returned_at) VALUES($1,$2,1,'returned',18,90,now(),now(),now())", [reportExercise.rows[0].id, learner.id]);
  await pool.query("INSERT INTO exercise_submissions(exercise_id,learner_id,attempt_number,status,total_score,submitted_at) VALUES($1,$2,1,'submitted',0,now())", [unmarkedExercise.rows[0].id, learner.id]);
  await pool.query("INSERT INTO exercise_submissions(exercise_id,learner_id,attempt_number,status,total_score,submitted_at) VALUES($1,$2,1,'exempt',0,now())", [exemptExercise.rows[0].id, learner.id]);
  await pool.query("INSERT INTO exercise_submissions(exercise_id,learner_id,attempt_number,status,total_score,submitted_at) VALUES($1,$2,2,'returned',20,'2026-09-30T12:00:00Z')", [reportExercise.rows[0].id, learner.id]);

  // Academic records and approval-gated documents are exercised only against isolated CI PostgreSQL.
  const ownAcademicRecords = await request("/api/academic-records/me", { token: learner.token });
  assert.equal(ownAcademicRecords.status, 200, "learner must be able to view own authoritative academic records");
  assert(Array.isArray(ownAcademicRecords.data.enrollments) && Array.isArray(ownAcademicRecords.data.awards) && Array.isArray(ownAcademicRecords.data.attendance));
  assert.equal(ownAcademicRecords.data.assignmentMarks.length, 4, "learner academic records include all-time marked, unmarked, exempt and out-of-term assignment submissions");
  assert.equal(ownAcademicRecords.data.exerciseMarks.length, 4, "learner academic records include all-time marked, unmarked, exempt and out-of-term exercise submissions");
  assert.equal(ownAcademicRecords.data.markSummary.assignments.markedCount, 2);
  assert.equal(ownAcademicRecords.data.markSummary.assignments.unmarkedCount, 1);
  assert.equal(ownAcademicRecords.data.markSummary.assignments.exemptCount, 1);
  assert.equal(ownAcademicRecords.data.markSummary.exercises.markedCount, 2);
  assert.equal(ownAcademicRecords.data.markSummary.exercises.unmarkedCount, 1);
  assert.equal(ownAcademicRecords.data.markSummary.exercises.exemptCount, 1);
  assert.equal(ownAcademicRecords.data.markSummary.overall.percentage, 88.33, "all-time percentage must use only known earned and possible marks");
  const transferFormData = { learnerName: "PR84 Transfer Learner", receivingSchool: "Test Receiving School", academicYear: "2026", guardianName: "Test Guardian", guardianPhone: "+263771234567", reasonDetail: "Family relocation" };
  const transferRequest = await request("/api/academic-records/transfer-requests", { token: learner.token, method: "POST", body: { reason: "Family relocation for integration test", formData: transferFormData } });
  assert.equal(transferRequest.status, 201, "learner should be able to request a transfer letter");
  const reviewerQueueRows = await pool.query("SELECT recipient_user_id,subject FROM email_notification_queue WHERE subject='Transfer letter request awaiting review' AND recipient_user_id=ANY($1::int[])", [[ownerId, managerId, seniorManagerId]]);
  assert.deepEqual(new Set(reviewerQueueRows.rows.map(row => Number(row.recipient_user_id))), new Set([ownerId, managerId, seniorManagerId]), "new transfer request must enqueue reviewer notifications for manager, senior manager and owner");

  const savedTransfer = await pool.query("SELECT form_data FROM academic_transfer_requests WHERE id=$1", [transferRequest.data.id]);
  assert.deepEqual(savedTransfer.rows[0].form_data, transferFormData, "migration must persist the complete form_data JSONB payload");
  const duplicateAttempts = await Promise.all([1, 2].map(() => request("/api/academic-records/transfer-requests", { token: learner.token, method: "POST", body: { reason: "Duplicate transfer attempt", formData: transferFormData } })));
  assert(duplicateAttempts.every(result => result.status === 409), "concurrent duplicate pending requests must be rejected");
  const teacherTransferReview = await request("/api/academic-records/transfer-requests/" + transferRequest.data.id + "/review", { token: teacherToken, method: "POST", body: { status: "approved" } });
  assert.equal(teacherTransferReview.status, 403, "teacher role must not review transfer requests");
  const adminTransferQueue = await request("/api/academic-records/transfer-requests", { token: adminToken });
  assert.equal(adminTransferQueue.status, 200, "owner-class admin must retain access to the transfer review queue");
  assert(adminTransferQueue.data.some(item => Number(item.id) === Number(transferRequest.data.id)), "admin queue must include the pending transfer request");
  const blockedTransferDownload = await request("/api/academic-records/transfer-requests/" + transferRequest.data.id + "/download", { token: learner.token });
  assert.equal(blockedTransferDownload.status, 403, "transfer letter must be blocked until manager approval");
  const otherLearnerTransferDownload = await request("/api/academic-records/transfer-requests/" + transferRequest.data.id + "/download", { token: otherLearner.token });
  assert.equal(otherLearnerTransferDownload.status, 404, "a different learner must not access another learner's transfer letter");
  const learnerTransferReview = await request("/api/academic-records/transfer-requests/" + transferRequest.data.id + "/review", { token: learner.token, method: "POST", body: { status: "approved" } });
  assert.equal(learnerTransferReview.status, 403, "learners must not review transfer letters");
  const approveTransfer = await request("/api/academic-records/transfer-requests/" + transferRequest.data.id + "/review", { token: managerToken, method: "POST", body: { status: "approved", note: "CI-only manager approval" } });
  assert.equal(approveTransfer.status, 200, "manager should be able to approve transfer request");
  const approvalNotice = await pool.query("SELECT subject,body_text FROM email_notification_queue WHERE recipient_user_id=$1 AND subject='Your transfer letter request was approved' ORDER BY id DESC LIMIT 1", [learner.id]);
  assert.equal(approvalNotice.rowCount, 1, "approval must enqueue an applicant notification");
  const managerApprovedDownload = await request("/api/academic-records/transfer-requests/" + transferRequest.data.id + "/download", { token: seniorManagerToken });
  assert.equal(managerApprovedDownload.status, 200, "authorized senior managers must be able to download approved letters");
  const adminApprovedDownload = await request("/api/academic-records/transfer-requests/" + transferRequest.data.id + "/download", { token: adminToken });
  assert.equal(adminApprovedDownload.status, 200, "owner-class admin must retain access to approved transfer letters");
  const adminReviewRequest = await request("/api/academic-records/transfer-requests", { token: learner.token, method: "POST", body: { reason: "Admin review authorization integration test", formData: { ...transferFormData, learnerName: "PR84 Admin Review Learner" } } });
  assert.equal(adminReviewRequest.status, 201, "learner should be able to submit a separate request for admin review");
  const adminTransferReview = await request("/api/academic-records/transfer-requests/" + adminReviewRequest.data.id + "/review", { token: adminToken, method: "POST", body: { status: "approved", note: "CI-only owner-class admin approval" } });
  assert.equal(adminTransferReview.status, 200, "owner-class admin must retain transfer approval authority");
  assert.equal(adminTransferReview.data.status, "approved", "admin approval decision must persist");
  const adminReviewedDownload = await request("/api/academic-records/transfer-requests/" + adminReviewRequest.data.id + "/download", { token: adminToken });
  assert.equal(adminReviewedDownload.status, 200, "admin must retain access to the transfer letter they approved");
  assert.match(String(adminReviewedDownload.data), /^%PDF-1\.4/, "admin-approved transfer letter must be a genuine PDF");
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
  await pool.query("UPDATE teacher_qualifications SET verification_status='verified' WHERE id=$1", [bulkQualifications.data.qualifications[0].id]);
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
  await pool.query("UPDATE users SET is_prefect=true WHERE id=$1", [learner.id]);
  const prefectProfile = await request("/api/users/" + learner.id + "/public-profile", { token: otherLearner.token });
  assert.equal(prefectProfile.data.is_prefect, true, "profile role badge must reflect authoritative prefect promotion state");
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

  console.log("PROFILE_HUB_INTEGRATION_RESULT: PASS (isolated ephemeral PostgreSQL + mocked email/PayPal providers; no live provider call or real payout)");
} finally {
  await pool.end();
}
