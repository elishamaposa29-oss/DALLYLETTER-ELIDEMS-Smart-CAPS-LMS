import { pool } from "@workspace/db";
import { ensureConnectSchema } from "../../artifacts/api-server/src/lib/ensureConnectSchema.js";
import { ensureAuthSessionSchema } from "../../artifacts/api-server/src/lib/auth-session-store.js";
import { ensureProfileHubSchema } from "../../artifacts/api-server/src/lib/ensureProfileHubSchema.js";
import { ensureManagerPermissionSchema } from "../../artifacts/api-server/src/lib/ensureManagerPermissionSchema.js";

const email = process.env.OWNER_BOOTSTRAP_EMAIL?.trim().toLowerCase();
if (!email) throw new Error("OWNER_BOOTSTRAP_EMAIL must be configured for recovery verification.");
if (!process.env.OWNER_BOOTSTRAP_PASSWORD || process.env.OWNER_BOOTSTRAP_PASSWORD.length < 12) {
  throw new Error("OWNER_BOOTSTRAP_PASSWORD is missing or too short; configure it in Render's protected environment settings.");
}
if (!process.env.GOOGLE_CLIENT_ID?.trim()) {
  throw new Error("GOOGLE_CLIENT_ID is missing; configure the production Google OAuth client ID in Render's protected environment settings.");
}

const requiredTables = [
  "users",
  "activity_log",
  "audit_logs",
  "ai_actions",
  "lessons",
  "classes",
  "assignments",
  "assignment_submissions",
  "attendance",
  "hand_raises",
  "lesson_requests",
  "exercises",
  "exercise_questions",
  "exercise_options",
  "exercise_submissions",
  "exercise_answers",
  "exercise_media",
  "messages",
  "study_groups",
  "study_group_members",
  "group_member_controls",
  "group_settings",
  "chat_communities",
  "chat_community_groups",
  "chat_polls",
  "chat_poll_options",
  "chat_poll_votes",
  "chat_broadcasts",
  "chat_broadcast_recipients",
  "follows",
  "content_comments",
  "content_flags",
  "moderation_actions",
  "polls",
  "poll_questions",
  "poll_options",
  "poll_submissions",
  "notifications",
  "notification_preferences",
  "achievements",
  "user_achievements",
  "break_elide_events",
  "break_elide_volunteers",
  "owner_alerts",
  "platform_settings",
  "payments",
  "payment_transactions",
  "staff_payments",
  "achievement_award_recommendations",
  "auth_sessions",
  "password_reset_tokens",
  "auth_rate_limits",
  "google_account_links",
  "manager_permission_grants",
  "manager_permission_history",
  "manager_role_assignments",
  "teacher_documents",
  "teacher_qualifications",
  "teacher_qualification_review_history",
  "content_permission_requests",
  "message_media",
  "push_subscriptions",
  "academic_transfer_requests",
  "academic_report_drafts",
  "notification_reads",
  "teacher_subjects",
  "learner_subjects",
  "notification_email_verifications",
  "email_notification_queue",
  "payout_history",
  "payout_preferences",
  "account_email_status",
  "account_email_tokens",
  "daily_app_attendance",
  "daily_attendance_feature_state",
];

try {
  // Run the same additive initializers as API startup before checking their tables.
  // This keeps verification fail-closed without racing the server process.
  await ensureConnectSchema();
  await ensureAuthSessionSchema();
  await ensureProfileHubSchema();
  await ensureManagerPermissionSchema();

  const owners = await pool.query(
    "SELECT id, email, role, is_blocked, is_suspended FROM public.users WHERE lower(email) = $1",
    [email],
  );
  if (owners.rowCount !== 1) {
    throw new Error("Expected exactly one owner bootstrap account; found " + owners.rowCount + ".");
  }
  const owner = owners.rows[0] as { id: number; email: string; role: string; is_blocked: boolean; is_suspended: boolean };
  if (String(owner.role).toLowerCase() !== "owner" || owner.is_blocked || owner.is_suspended) {
    throw new Error("Configured owner must have role=owner and be neither blocked nor suspended.");
  }

  const tables = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name = ANY($1::text[])",
    [requiredTables],
  );
  const present = new Set(tables.rows.map((row: { table_name: string }) => row.table_name));
  const missing = requiredTables.filter((table) => !present.has(table));
  if (missing.length) throw new Error("Recovery schema is incomplete; missing tables: " + missing.join(", "));

  console.log("OWNER_DATABASE_RECOVERY: PASS");
  console.log("Owner account: " + owner.email + " (role=owner, enabled)");
  console.log("Critical auth, Google-link, manager-permission, teacher-review, and legacy tables: " + requiredTables.length + "/" + requiredTables.length + " present");
} finally {
  await pool.end();
}
