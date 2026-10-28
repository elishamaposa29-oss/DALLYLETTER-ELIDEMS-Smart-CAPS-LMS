import { Router } from "express";
import { pool } from "@workspace/db";
import { canManageAcademicContent, requireAuth } from "../lib/auth-middleware";

const router = Router();
const SYSTEM_TIME_ZONE = process.env.ATTENDANCE_TIME_ZONE || process.env.TZ || "UTC";

function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 100 || !value.trim()) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date()); return true; }
  catch { return false; }
}

function localDateFor(timeZone: string, date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function safeSystemTimeZone(): string {
  return validTimeZone(SYSTEM_TIME_ZONE) ? SYSTEM_TIME_ZONE : "UTC";
}

router.post("/open", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser;
  if (!user) { res.status(401).json({ error: "Authentication required" }); return; }
  const requestedTimeZone = req.body?.timeZone;
  const timeZone = requestedTimeZone === undefined ? safeSystemTimeZone() : requestedTimeZone;
  if (!validTimeZone(timeZone)) {
    res.status(400).json({ error: "A valid IANA timeZone is required." });
    return;
  }
  const source = ["web", "android"].includes(req.body?.source) ? req.body.source : "other";
  const attendanceDate = localDateFor(timeZone);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO user_attendance_preferences (user_id, time_zone, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET time_zone = EXCLUDED.time_zone, updated_at = now()`,
      [user.id, timeZone],
    );
    const result = await client.query(
      `INSERT INTO daily_app_attendance
         (user_id, attendance_date, time_zone, status, open_count, first_open_at, last_open_at, last_source, activity_label, created_at, updated_at)
       VALUES ($1, $2::date, $3, 'present', 1, now(), now(), $4, 'Active', now(), now())
       ON CONFLICT (user_id, attendance_date) DO UPDATE SET
         time_zone = EXCLUDED.time_zone,
         status = 'present',
         open_count = daily_app_attendance.open_count + 1,
         first_open_at = COALESCE(daily_app_attendance.first_open_at, now()),
         last_open_at = now(),
         last_source = EXCLUDED.last_source,
         updated_at = now()
       RETURNING user_id, attendance_date, time_zone, status, open_count, first_open_at, last_open_at, last_source, activity_label`,
      [user.id, attendanceDate, timeZone, source],
    );
    const row = result.rows[0];
    const averageResult = await client.query(
      "SELECT COALESCE(AVG(open_count), 1)::numeric AS average_opens FROM daily_app_attendance WHERE attendance_date = $1::date AND status = 'present' AND user_id <> $2",
      [attendanceDate, user.id],
    );
    const average = Number(averageResult.rows[0]?.average_opens ?? 1);
    const highlyActive = Number(row.open_count) >= Math.max(5, Math.ceil(average * 1.5));
    const label = highlyActive ? "Highly active" : "Active";
    await client.query(
      "UPDATE daily_app_attendance SET activity_label = $3 WHERE user_id = $1 AND attendance_date = $2::date",
      [user.id, attendanceDate, label],
    );
    await client.query("COMMIT");
    res.status(200).json({ ...row, activity_label: label, average_daily_opens: average, attendance_date: String(row.attendance_date).slice(0, 10) });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
});

router.get("/me", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser;
  if (!user) { res.status(401).json({ error: "Authentication required" }); return; }
  const result = await pool.query(
    `SELECT attendance_date, time_zone, status, open_count, first_open_at, last_open_at, last_source, activity_label
     FROM daily_app_attendance WHERE user_id = $1 ORDER BY attendance_date DESC LIMIT 120`,
    [user.id],
  );
  res.json({ records: result.rows });
});

// Staff can review daily access for all account roles. A missing record for the
// current local date is "pending", never falsely presented as confirmed absence.
router.get("/today", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser;
  if (!user) { res.status(401).json({ error: "Authentication required" }); return; }
  if (!canManageAcademicContent(user)) {
    res.status(403).json({ error: "Academic staff access required" });
    return;
  }
  const timeZone = safeSystemTimeZone();
  const result = await pool.query(
    `SELECT u.id AS user_id, u.name, u.role, COALESCE(p.time_zone, $1) AS time_zone,
            (now() AT TIME ZONE COALESCE(p.time_zone, $1))::date AS local_date,
            d.status, COALESCE(d.open_count, 0) AS open_count,
            d.first_open_at, d.last_open_at, d.last_source,
            COALESCE(d.activity_label, 'Awaiting day end') AS activity_label
       FROM users u
       LEFT JOIN user_attendance_preferences p ON p.user_id = u.id
       LEFT JOIN daily_app_attendance d
         ON d.user_id = u.id
        AND d.attendance_date = (now() AT TIME ZONE COALESCE(p.time_zone, $1))::date
       WHERE COALESCE(u.is_blocked, false) = false
       ORDER BY u.role, u.name`,
    [timeZone],
  );
  res.json({ records: result.rows });
});

export default router;
