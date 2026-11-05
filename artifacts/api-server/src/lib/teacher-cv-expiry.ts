import { db, notificationsTable, pool } from "@workspace/db";
import { enqueueEmailNotification } from "./email-notification-queue";

let timer: ReturnType<typeof setInterval> | undefined;
let running = false;

async function ensure(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS teacher_cv_workflow_settings(
    id integer PRIMARY KEY DEFAULT 1 CHECK(id=1),
    review_duration_days integer CHECK(review_duration_days BETWEEN 1 AND 365 OR review_duration_days IS NULL),
    updated_by integer REFERENCES users(id),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query("INSERT INTO teacher_cv_workflow_settings(id,review_duration_days) VALUES(1,NULL) ON CONFLICT(id) DO NOTHING");
  await pool.query("ALTER TABLE teacher_cv_workflow_settings ALTER COLUMN review_duration_days DROP NOT NULL");
  await pool.query("ALTER TABLE teacher_cv_workflow_settings ALTER COLUMN review_duration_days DROP DEFAULT");
  await pool.query("UPDATE teacher_cv_workflow_settings SET review_duration_days=NULL WHERE updated_by IS NULL");
  await pool.query(`CREATE TABLE IF NOT EXISTS teacher_cv_review_history(
    id bigserial PRIMARY KEY,
    teacher_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reviewer_id integer REFERENCES users(id),
    action text NOT NULL,
    previous_status text,
    new_status text NOT NULL,
    note text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
}

/**
 * CV review expiry and rejected-account conversion are core account workflows.
 * Notification delivery is deliberately downstream and best-effort: an absent,
 * invalid, disabled or temporarily unavailable email must never stop conversion.
 */
export async function processExpiredTeacherApplications(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await ensure();
    const settings = await pool.query("SELECT review_duration_days FROM teacher_cv_workflow_settings WHERE id=1");
    const configured = Number(settings.rows[0]?.review_duration_days || 0);
    const fallbackDays = Number.isInteger(configured) && configured >= 1 && configured <= 365 ? configured : 30;

    const client = await pool.connect();
    let converted: Array<{id:number;name:string|null;email:string|null;previousStatus:string}> = [];
    try {
      await client.query("BEGIN");
      const due = await client.query(
        `SELECT id,name,email,teacher_application_status
           FROM users
          WHERE lower(role)='teacher'
            AND COALESCE(teacher_application_status,'pending_review') IN ('pending_review','rejected_pending_conversion')
            AND COALESCE(teacher_review_deadline,created_at+make_interval(days=>$1))<=now()
          ORDER BY teacher_review_deadline NULLS FIRST,created_at
          FOR UPDATE SKIP LOCKED
          LIMIT 50`,
        [fallbackDays],
      );

      for (const teacher of due.rows) {
        const previousStatus = String(teacher.teacher_application_status || "pending_review");
        const updated = await client.query(
          "UPDATE users SET role='student',teacher_application_status='auto_converted',teacher_review_deadline=NULL,subject=NULL,is_manager=false,is_prefect=false WHERE id=$1 AND lower(role)='teacher' RETURNING id",
          [teacher.id],
        );
        if (!updated.rows.length) continue;
        await client.query(
          "UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1",
          [teacher.id],
        );
        await client.query(
          "INSERT INTO teacher_cv_review_history(teacher_id,reviewer_id,action,previous_status,new_status,note) VALUES($1,NULL,$2,$3,'student',$4)",
          [
            teacher.id,
            previousStatus === "rejected_pending_conversion" ? "rejection_conversion" : "expired",
            previousStatus,
            "Owner-configured deadline elapsed. Account converted independently of notification delivery; login credentials and account identity were preserved.",
          ],
        );
        converted.push({
          id:Number(teacher.id),
          name:teacher.name==null?null:String(teacher.name),
          email:teacher.email==null?null:String(teacher.email),
          previousStatus,
        });
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    for (const teacher of converted) {
      const title = "Teacher account converted to learner";
      const message = teacher.previousStatus === "rejected_pending_conversion"
        ? "Your teacher application was not approved and the scheduled conversion period has ended. Your existing account has now been converted to a learner account. Your login email and password remain unchanged."
        : "The Owner-configured teacher application review period ended without approval. Your existing account has now been converted to a learner account. Your login email and password remain unchanged.";
      try {
        await db.insert(notificationsTable).values({
          recipientId:teacher.id,
          title,
          message,
          link:"/profile-hub",
          type:"teacher_cv_conversion",
        });
      } catch (error) {
        console.error("[teacher-cv-expiry] In-app notification failed after conversion.", error instanceof Error ? error.message : "unknown");
      }
      try {
        await enqueueEmailNotification(teacher.id,title,message);
      } catch (error) {
        console.error("[teacher-cv-expiry] Email notification could not be queued; account conversion is already complete.", error instanceof Error ? error.message : "unknown");
      }
    }
  } catch (error) {
    console.error("[teacher-cv-expiry] Scheduler pass failed", error instanceof Error ? error.message : "unknown");
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
