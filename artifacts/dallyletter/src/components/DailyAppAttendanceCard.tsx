import { useEffect, useState } from "react";
import { getApiUrl } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type DailyRecord = {
  attendance_date: string;
  time_zone: string;
  status: "present" | "absent";
  open_count: number;
  first_open_at: string | null;
  last_open_at: string | null;
  last_source: string;
  activity_label: string;
};

function todayInLocalZone(): string {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (name: string) => parts.find(part => part.type === name)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function DailyAppAttendanceCard() {
  const { user } = useAuth();
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const today = todayInLocalZone();

  useEffect(() => {
    let active = true;
    const load = async () => {
      const token = localStorage.getItem("dallyletter_token");
      if (!token || !user?.id) { if (active) setLoading(false); return; }
      try {
        const response = await fetch(getApiUrl("/api/daily-attendance/me"), { headers: { Authorization: "Bearer " + token } });
        if (!response.ok) throw new Error("Daily app attendance is temporarily unavailable.");
        const payload = await response.json();
        if (active) { setRecords(Array.isArray(payload.records) ? payload.records : []); setError(""); }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Could not load daily attendance.");
      } finally { if (active) setLoading(false); }
    };
    void load();
    const retry = window.setTimeout(() => { void load(); }, 1800);
    return () => { active = false; window.clearTimeout(retry); };
  }, [user?.id]);

  const todayRecord = records.find(record => String(record.attendance_date).slice(0, 10) === today);
  return <Card>
    <CardHeader><CardTitle>Daily Dallyletter access</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <p className="text-sm text-muted-foreground">This register records one daily presence per account using your device's local timezone. Reopening the app increments the activity count, not the number of attendance days.</p>
      <div className="rounded-lg border p-3">
        <p className="text-sm font-medium">Today · {today}</p>
        {todayRecord ? <p className="mt-1 text-sm">{todayRecord.status === "present" ? "Present" : "Absent"} · {todayRecord.open_count} app open{todayRecord.open_count === 1 ? "" : "s"} · {todayRecord.activity_label}</p> : <p className="mt-1 text-sm text-muted-foreground">No access has been recorded for today yet. Absence is only confirmed after your local day ends.</p>}
      </div>
      {loading && <p className="text-sm text-muted-foreground">Loading saved daily records…</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!loading && !error && records.length === 0 && <p className="text-sm text-muted-foreground">No completed daily records yet. A present record is saved when you open Dallyletter while signed in.</p>}
      {records.map(record => <div key={String(record.attendance_date).slice(0, 10)} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
        <div><p className="font-medium">{String(record.attendance_date).slice(0, 10)}</p><p className="text-xs text-muted-foreground">{record.time_zone} · {record.last_source}</p></div>
        <div className="text-right"><p className={record.status === "present" ? "text-sm font-semibold text-green-700" : "text-sm font-semibold text-red-700"}>{record.status === "present" ? "Present" : "Absent"}</p><p className="text-xs text-muted-foreground">{record.open_count} open{record.open_count === 1 ? "" : "s"} · {record.activity_label}</p></div>
      </div>)}
    </CardContent>
  </Card>;
}
