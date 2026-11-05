import { pool } from "@workspace/db";
import { sendEmail } from "./email-service";
import { logger } from "./logger";

let timer: ReturnType<typeof setInterval> | undefined;
let running = false;

async function ensure(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS teacher_cv_workflow_settings (
    id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    review_duration_days integer CHECK (review_duration_days BETWEEN 1 AND 365 OR review_duration_days IS NULL),
    updated_by integer REFERENCES users(id),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query("INSERT INTO teacher_cv_workflow_settings(id,review_duration_days) VALUES(1,NULL) ON CONFLICT(id) DO NOTHING");
  await pool.query("ALTER TABLE teacher_cv_workflow_settings ALTER COLUMN review_duration_days DROP NOT NULL");
  await pool.query("ALTER TABLE teacher_cv_workflow_settings ALTER COLUMN review_duration_days DROP DEFAULT");
  await pool.query("UPDATE teacher_cv_workflow_settings SET review_duration_days=NULL WHERE updated_by IS NULL");
  await pool.query(`CREATE TABLE IF NOT EXISTS teacher_cv_review_history (
    id bigserial PRIMARY KEY,
    teacher_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reviewer_id integer REFERENCES users(id),
    action text NOT NULL,
    previous_status text,
    new_status text NOT NULL,
    note text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  // Repair legacy pending applications once; later decisions write explicit deadlines.
  await pool.query(`
    UPDATE users
       SET teacher_review_deadline = created_at + make_interval(days => s.review_duration_days)
      FROM teacher_cv_workflow_settings s
     WHERE s.id = 1
       AND s.review_duration_days BETWEEN 1 AND 365
       AND lower(users.role) = 'teacher'
       AND COALESCE(users.teacher_application_status, 'pending_review') = 'pending_review'
       AND users.teacher_review_deadline IS NULL
  `);
}

type DueApplicant = { id: number; name: string | null; email: string | null; teacher_application_status: string };

export async function processExpiredTeacherApplications(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await ensure();
    const client = await pool.connect();
    const notices: DueApplicant[] = [];
    try {
      await client.query("BEGIN");
      const due = await client.query<DueApplicant>(`
        SELECT id, name, email, COALESCE(teacher_application_status, 'pending_review') AS teacher_application_status
          FROM users
         WHERE lower(role) = 'teacher'
           AND COALESCE(teacher_application_status, 'pending_review') IN ('pending_review', 'rejected')
           AND teacher_review_deadline IS NOT NULL
           AND teacher_review_deadline <= now()
         ORDER BY teacher_review_deadline, id
         FOR UPDATE SKIP LOCKED
         LIMIT 50
      `);

      for (const applicant of due.rows) {
        const wasRejected = applicant.teacher_application_status === "rejected";
        const newStatus = wasRejected ? "rejected_converted" : "auto_converted";
        const updated = await client.query(
          `UPDATE users
              SET role = 'student',
                  teacher_application_status = $2,
                  teacher_review_deadline = NULL,
                  subject = NULL,
                  is_manager = false,
                  is_prefect = false
            WHERE id = $1
              AND lower(role) = 'teacher'
              AND teacher_review_deadline <= now()
            RETURNING id`,
          [applicant.id, newStatus],
        );
        if (!updated.rowCount) continue;

        await client.query(
          "UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = $1",
          [applicant.id],
        );
        await client.query(
          `INSERT INTO teacher_cv_review_history
             (teacher_id, reviewer_id, action, previous_status, new_status, note)
           VALUES ($1, NULL, $2, $3, $4, $5)`,
          [
            applicant.id,
            wasRejected ? "rejected_conversion" : "expired",
            applicant.teacher_application_status,
            newStatus,
            wasRejected
              ? "Scheduled learner conversion completed; email delivery was not required."
              : "Owner-configured review deadline elapsed; email delivery was not required.",
          ],
        );
        notices.push(applicant);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    // Communication is best-effort and deliberately happens after the account
    // transition commits. Missing email/provider failures can never block conversion.
    for (const applicant of notices) {
      if (!applicant.email || !String(applicant.email).trim()) continue;
      try {
        await sendEmail({
          to: [String(applicant.email).trim()],
          subject: "Dallyletter Elidems teacher application update",
          text:
            "Hello " + (applicant.name || "applicant") +
            ", your teacher application review period has ended. Your account is now a learner account. " +
            "Your existing login credentials remain valid; sign in again to access the learner dashboard.",
        });
      } catch (error) {
        logger.warn(
          { event: "teacher_cv_conversion_email_failed", userId: applicant.id, reason: error instanceof Error ? error.message.slice(0, 160) : "unknown" },
          "Teacher-to-learner conversion completed; optional email notification was unavailable",
        );
      }
    }
    if (notices.length) logger.info({ event: "teacher_cv_applications_converted", count: notices.length }, "Expired/rejected teacher applications converted to learners");
  } catch (error) {
    logger.error({ err: error }, "Teacher CV expiry scheduler pass failed");
  } finally {
    running = false;
  }
}

export function startTeacherCvExpiryScheduler(): void {
  if (timer) return;
  void processExpiredTeacherApplications();
  timer = setInterval(() => void processExpiredTeacherApplications(), 5 * 60 * 1000);
  timer.unref?.();
}
