import { pool } from "@workspace/db";

export async function expireUnapprovedTeacherApplications(): Promise<number> {
  const result = await pool.query(`
    UPDATE users
    SET role = 'student',
        teacher_application_status = 'expired',
        teacher_review_deadline = NULL,
        subject = NULL,
        is_manager = false,
        is_prefect = false
    WHERE role = 'teacher'
      AND teacher_application_status = 'pending_review'
      AND teacher_review_deadline IS NOT NULL
      AND teacher_review_deadline < now()
    RETURNING id
  `);
  return result.rowCount ?? 0;
}

export function startTeacherLifecycle(): void {
  const run = () => expireUnapprovedTeacherApplications().catch(() => undefined);
  void run();
  setInterval(run, 60 * 60 * 1000).unref();
}
