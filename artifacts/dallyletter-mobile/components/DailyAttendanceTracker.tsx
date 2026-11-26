import React, { useEffect } from "react";
import { AppState } from "react-native";
import { getApiUrl } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";

/** Record signed-in app launches and foreground resumes, once per foreground transition. */
export function DailyAttendanceTracker() {
  const { user, token } = useAuth();

  useEffect(() => {
    if (!user?.id || !token) return;

    let disposed = false;
    let requestInFlight = false;
    const recordOpen = () => {
      if (disposed || requestInFlight) return;
      requestInFlight = true;
      let timeZone = "UTC";
      try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { /* use UTC */ }
      void fetch(getApiUrl("/api/daily-attendance/open"), {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ timeZone, source: "android" }),
      }).catch(() => {
        // Attendance is best-effort during a network outage; a later foreground transition retries.
      }).finally(() => { requestInFlight = false; });
    };

    recordOpen();
    let lastState = AppState.currentState;
    const subscription = AppState.addEventListener("change", nextState => {
      if (nextState === "active" && lastState !== "active") recordOpen();
      lastState = nextState;
    });

    return () => {
      disposed = true;
      subscription.remove();
    };
  }, [user?.id, token]);

  return null;
}
