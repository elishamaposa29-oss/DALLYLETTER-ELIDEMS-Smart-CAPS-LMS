import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
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
    [["users", "classes", "enrollments", "notification_email_verifications", "email_notification_queue", "payout_history", "payout_preferences", "user_courses", "course_enrollments", "class_enrollments", "student_courses", "class_students"]],
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

  const googleLogin = await request("/api/auth/google", { method: "POST", body: { credential: "mock-google-valid" } });
  assert.equal(googleLogin.status, 200, "Google ID token should be verified and create a learner account: " + JSON.stringify(googleLogin.data));
  assert.equal(googleLogin.data.user.email, "pr84-google-user@example.test");
  assert.equal(googleLogin.data.user.role, "student", "Google sign-up must use the safe learner default role");
  const googleRepeat = await request("/api/auth/google", { method: "POST", body: { credential: "mock-google-valid" } });
  assert.equal(googleRepeat.status, 200);
  assert.equal(Number(googleRepeat.data.user.id), Number(googleLogin.data.user.id), "Google subject must resolve to the same linked account");
  const googleInvalid = await request("/api/auth/google", { method: "POST", body: { credential: "mock-google-invalid" } });
  assert.equal(googleInvalid.status, 401, "invalid Google credentials must be rejected");
  console.log("GOOGLE_AUTH_E2E_MOCK_PROVIDER:", JSON.stringify({ firstLogin: googleLogin.status, repeatLogin: googleRepeat.status, invalidToken: googleInvalid.status, provider: "isolated CI tokeninfo mock; not a live Google OAuth verification" }));

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
  await pool.query(
    "INSERT INTO account_recovery_profiles (user_id,recovery_email,recovery_email_verified_at) VALUES ($1,$2,now()) ON CONFLICT (user_id) DO UPDATE SET recovery_email=EXCLUDED.recovery_email,recovery_email_verified_at=now()",
    [learner.id, recoveryEmail],
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
  const resetConfirm = await request("/api/auth/password-reset/confirm", {
    method: "POST", body: { token: resetToken, newPassword },
  });
  assert.equal(resetConfirm.status, 200, "password reset should succeed with a valid token");
  const oldSessionAfterReset = await request("/api/users/me/enrollments", { token: learner.token });
  assert.equal(oldSessionAfterReset.status, 401, "password reset must revoke existing sessions");
  const resetReplay = await request("/api/auth/password-reset/confirm", {
    method: "POST", body: { token: resetToken, newPassword },
  });
  assert.equal(resetReplay.status, 400, "password reset token must be one-use");
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
    provider: "isolated CI mock; not a real Resend delivery",
  }));

  console.log("PROFILE_HUB_INTEGRATION_RESULT: PASS (isolated ephemeral PostgreSQL + mocked email/PayPal providers; no live provider call or real payout)");
} finally {
  await pool.end();
}
