import React, { useEffect, useRef } from "react";
import { getApiUrl } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";

/** Records one authenticated Android app-open event per app process mount. */
export function DailyAttendanceTracker() {
  const { user, token } = useAuth();
  const sentForUser = useRef<number | null>(null);

  useEffect(() => {
    if (!user?.id || !token) {
      sentForUser.current = null;
      return;
    }
    if (sentForUser.current === user.id) return;
    sentForUser.current = user.id;
    let timeZone = "UTC";
    try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { /* use UTC */ }
    void fetch(getApiUrl("/api/daily-attendance/open"), {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ timeZone, source: "android" }),
    }).then(response => {
      if (!response.ok) sentForUser.current = null;
    }).catch(() => { sentForUser.current = null; });
  }, [user?.id, token]);

  return null;
}
