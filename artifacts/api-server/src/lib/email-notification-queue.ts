import { pool } from "@workspace/db";
import { isEmailConfigured, resolveNotificationRecipients, sendEmail } from "./email-service";
import { isSmsConfigured, sendSms } from "./sms-service";

let started = false;
let draining = false;

export async function enqueueEmailNotification(recipientUserId: number, subject: string, bodyText: string): Promise<void> {
  if (!Number.isSafeInteger(recipientUserId) || recipientUserId <= 0) throw new Error("A valid notification recipient is required.");
  const safeSubject = subject.trim().slice(0, 200);
  const safeBody = bodyText.trim().slice(0, 20000);
  if (!safeSubject || !safeBody) throw new Error("Notification subject and body are required.");
  await pool.query(
    "INSERT INTO email_notification_queue(recipient_user_id,subject,body_text,status,available_at) VALUES($1,$2,$3,'pending',now())",
    [recipientUserId, safeSubject, safeBody],
  );
}

async function drainQueue(): Promise<void> {
  if (draining || !isEmailConfigured()) return;
  draining = true;
  try {
    const { rows } = await pool.query(`WITH batch AS (
      SELECT id FROM email_notification_queue
      WHERE status='pending' AND available_at<=now()
      ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 10
    )
    UPDATE email_notification_queue q SET status='processing'
    FROM batch WHERE q.id=batch.id
    RETURNING q.id,q.recipient_user_id,q.subject,q.body_text,q.attempts`);
    for (const item of rows) {
      try {
        const recipients = await resolveNotificationRecipients(Number(item.recipient_user_id));
        const result = await sendEmail({ to: recipients, subject: String(item.subject), text: String(item.body_text) });
        if (result.sent < 1) throw new Error("No notification recipient accepted the message.");
        const subject = String(item.subject);
        if (isSmsConfigured() && /security|password|recovery|sign.?in|login|payment|urgent|account alert/i.test(subject)) {
          try {
            const contact = await pool.query(`SELECT u.phone,r.recovery_phone,r.recovery_phone_verified_at
              FROM users u JOIN account_recovery_profiles r ON r.user_id=u.id
              WHERE u.id=$1 AND r.recovery_phone_verified_at IS NOT NULL AND r.recovery_phone=u.phone LIMIT 1`, [Number(item.recipient_user_id)]);
            const phone = contact.rows[0]?.phone;
            if (typeof phone === "string" && phone) await sendSms(phone, subject + ": " + String(item.body_text));
          } catch (smsError) {
            console.error("Verified phone notification delivery failed", smsError instanceof Error ? smsError.message : "unknown");
          }
        }
        await pool.query("UPDATE email_notification_queue SET status='sent',sent_at=now(),last_error=NULL WHERE id=$1", [item.id]);
      } catch (error) {
        const attempts = Number(item.attempts ?? 0) + 1;
        const message = error instanceof Error ? error.message.slice(0, 1000) : "Email delivery failed";
        await pool.query(`UPDATE email_notification_queue
          SET attempts=$2,status=CASE WHEN $2>=5 THEN 'failed' ELSE 'pending' END,
              available_at=now()+(LEAST(3600, 30 * power(2,$2)) * interval '1 second'),last_error=$3
          WHERE id=$1`, [item.id, attempts, message]);
      }
    }
  } catch (error) {
    // Queue errors are logged by the caller's process logger; never crash API requests.
    console.error("Email notification queue drain failed", error);
  } finally {
    draining = false;
  }
}

export function startEmailNotificationDispatcher(): void {
  if (started) return;
  started = true;
  const timer = setInterval(() => { void drainQueue(); }, 5000);
  timer.unref?.();
  void drainQueue();
}
