import { pool } from "@workspace/db";

const configuredTimeZone = process.env.ATTENDANCE_TIME_ZONE || process.env.TZ || "UTC";
function systemTimeZone(): string {
  try { new Intl.DateTimeFormat("en-US", { timeZone: configuredTimeZone }).format(); return configuredTimeZone; }
  catch { return "UTC"; }
}

/**
 * Persist confirmed absences only after the user's local day has ended.
 * This intentionally does not backfill earlier historical dates when the feature
 * first ships; it only closes the immediately preceding local calendar day.
 */
export async function closePreviousAttendanceDay(): Promise<number> {
  const fallbackZone = systemTimeZone();
  const result = await pool.query(
    `WITH local_days AS (
       SELECT u.id AS user_id,
              COALESCE(p.time_zone, $1) AS time_zone,
              (now() AT TIME ZONE COALESCE(p.time_zone, $1))::date AS today_local,
              (u.created_at AT TIME ZONE COALESCE(p.time_zone, $1))::date AS created_local,
              (s.enabled_at AT TIME ZONE COALESCE(p.time_zone, $1))::date AS feature_start_local
         FROM users u
         LEFT JOIN user_attendance_preferences p ON p.user_id = u.id
         CROSS JOIN daily_attendance_feature_state s
        WHERE COALESCE(u.is_blocked, false) = false
     ), absent_days AS (
       INSERT INTO daily_app_attendance
         (user_id, attendance_date, time_zone, status, open_count, last_source, activity_label, created_at, updated_at)
       SELECT ld.user_id, ld.today_local - 1, ld.time_zone, 'absent', 0, 'system', 'Absent', now(), now()
         FROM local_days ld
        WHERE ld.created_local < ld.today_local
          AND ld.today_local - 1 >= ld.feature_start_local
          AND NOT EXISTS (
            SELECT 1 FROM daily_app_attendance d
             WHERE d.user_id = ld.user_id AND d.attendance_date = ld.today_local - 1
          )
       ON CONFLICT (user_id, attendance_date) DO NOTHING
       RETURNING user_id
     )
     SELECT COUNT(*)::int AS inserted_count FROM absent_days`,
    [fallbackZone],
  );
  return Number(result.rows[0]?.inserted_count ?? 0);
}

export function startDailyAttendanceLifecycle(): void {
  const run = () => closePreviousAttendanceDay().catch(() => {
    // Attendance closure is retried on the next interval; never take down the API.
  });
  void run();
  setInterval(run, 15 * 60 * 1000).unref();
}
