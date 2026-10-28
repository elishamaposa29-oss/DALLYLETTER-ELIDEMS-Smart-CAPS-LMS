import { useEffect } from "react";
import { getApiUrl } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";

/** Record a signed-in app-open and count returning to a visible browser tab as another open. */
export function DailyAttendanceTracker() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;
    const token = localStorage.getItem("dallyletter_token");
    if (!token) return;

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
        body: JSON.stringify({ timeZone, source: "web" }),
      }).catch(() => {
        // Attendance is best-effort during a network outage; the next foreground open retries.
      }).finally(() => { requestInFlight = false; });
    };

    recordOpen();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") recordOpen();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [user?.id]);

  return null;
}
