import { useEffect, useRef } from "react";
import { getApiUrl } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";

/** Records one authenticated app-open event per browser app mount, not per route/API call. */
export function DailyAttendanceTracker() {
  const { user } = useAuth();
  const sentForUser = useRef<number | null>(null);

  useEffect(() => {
    if (!user?.id) {
      sentForUser.current = null;
      return;
    }
    if (sentForUser.current === user.id) return;
    const token = localStorage.getItem("dallyletter_token");
    if (!token) return;
    sentForUser.current = user.id;
    let timeZone = "UTC";
    try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { /* use UTC */ }
    void fetch(getApiUrl("/api/daily-attendance/open"), {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ timeZone, source: "web" }),
    }).then(response => {
      if (!response.ok) sentForUser.current = null;
    }).catch(() => {
      // Attendance is best-effort during a network outage; a later app remount retries.
      sentForUser.current = null;
    });
  }, [user?.id]);

  return null;
}
