import { useEffect, useMemo, useState } from "react";
import { getApiUrl } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Clock3, Activity, ChevronRight, X, BookOpenCheck } from "lucide-react";

type ClassAttendance = {
  id: number;
  classId: number;
  joinedAt: string;
  status: string;
  durationMinutes?: number | null;
};

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

function localDateKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (name: string) => parts.find(item => item.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function todayInLocalZone(): string {
  return localDateKey(new Date());
}

function formatDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function formatTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function DailyAppAttendanceCard() {
  const { user } = useAuth();
  const [classRecords, setClassRecords] = useState<ClassAttendance[]>([]);
  const [dailyRecords, setDailyRecords] = useState<DailyRecord[]>([]);
  const [classLoading, setClassLoading] = useState(true);
  const [dailyLoading, setDailyLoading] = useState(true);
  const [classError, setClassError] = useState("");
  const [dailyError, setDailyError] = useState("");
  const [dailyOpen, setDailyOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const today = todayInLocalZone();
  const monthDate = new Date();
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthLabel = monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const monthDays = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const mondayOffset = (monthStart.getDay() + 6) % 7;
  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  useEffect(() => {
    let active = true;
    const token = localStorage.getItem("dallyletter_token");
    if (!token || !user?.id) {
      setClassLoading(false);
      setDailyLoading(false);
      return;
    }
    const headers = { Authorization: "Bearer " + token };
    const loadClassAttendance = async () => {
      try {
        const response = await fetch(getApiUrl("/api/attendance/my"), { headers, cache: "no-store" });
        if (!response.ok) throw new Error("Your class attendance could not be loaded.");
        const payload = await response.json();
        if (active) {
          setClassRecords(Array.isArray(payload) ? payload : []);
          setClassError("");
        }
      } catch (error) {
        if (active) setClassError(error instanceof Error ? error.message : "Your class attendance could not be loaded.");
      } finally {
        if (active) setClassLoading(false);
      }
    };
    const loadDailyAttendance = async () => {
      try {
        const response = await fetch(getApiUrl("/api/daily-attendance/me"), { headers, cache: "no-store" });
        if (!response.ok) throw new Error("Daily access history is temporarily unavailable.");
        const payload = await response.json();
        if (active) {
          setDailyRecords(Array.isArray(payload.records) ? payload.records : []);
          setDailyError("");
        }
      } catch (error) {
        if (active) setDailyError(error instanceof Error ? error.message : "Daily access history could not be loaded.");
      } finally {
        if (active) setDailyLoading(false);
      }
    };
    void loadClassAttendance();
    void loadDailyAttendance();
    return () => { active = false; };
  }, [user?.id]);

  const presentCount = classRecords.filter(record => record.status?.toLowerCase() === "present").length;
  const absentCount = classRecords.filter(record => record.status?.toLowerCase() === "absent").length;
  const recordedCount = presentCount + absentCount;
  const attendanceRate = recordedCount ? Math.round((presentCount / recordedCount) * 100) : null;

  const dayStatus = useMemo(() => {
    const grouped = new Map<string, { present: number; absent: number }>();
    classRecords.forEach(record => {
      const key = localDateKey(record.joinedAt);
      if (!key) return;
      const value = grouped.get(key) ?? { present: 0, absent: 0 };
      if (record.status?.toLowerCase() === "present") value.present += 1;
      if (record.status?.toLowerCase() === "absent") value.absent += 1;
      grouped.set(key, value);
    });
    return grouped;
  }, [classRecords]);

  const todayRecord = dailyRecords.find(record => String(record.attendance_date).slice(0, 10) === today);
  const recentDailyRecords = dailyRecords.slice(0, 3);

  const renderCalendar = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{monthLabel}</p>
          <p className="text-xs text-muted-foreground">Your saved class-session attendance</p>
        </div>
        <Badge variant="outline" className="border-primary/20 bg-primary/5">{recordedCount} recorded</Badge>
      </div>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {weekdayLabels.map((day, index) => (
          <div key={day} className={`py-1 text-center text-[11px] font-semibold ${index > 4 ? "text-violet-700 dark:text-violet-300" : "text-muted-foreground"}`}>{day}</div>
        ))}
        {Array.from({ length: mondayOffset }, (_, index) => <div key={`blank-${index}`} aria-hidden="true" />)}
        {Array.from({ length: monthDays }, (_, index) => {
          const day = index + 1;
          const key = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const status = dayStatus.get(key);
          const isWeekend = (index + mondayOffset) % 7 >= 5;
          const isFuture = key > today;
          const isToday = key === today;
          const isAbsent = !!status && status.absent > 0;
          const isPresent = !!status && status.present > 0 && !isAbsent;
          const colorClass = isFuture
            ? "bg-muted/40 text-muted-foreground border-border"
            : isAbsent
              ? "bg-red-100 text-red-800 border-red-300 dark:bg-red-950/50 dark:text-red-200 dark:border-red-800"
              : isPresent
                ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800"
                : "bg-card text-foreground border-border";
          return (
            <div key={key} aria-label={`${formatDate(key)}: ${isAbsent ? "absence recorded" : isPresent ? "present" : isFuture ? "not reached" : "no record"}`} className={`relative flex min-h-[42px] flex-col items-center justify-center rounded-lg border text-sm font-semibold sm:min-h-[54px] ${colorClass} ${isWeekend ? "ring-1 ring-inset ring-violet-300 dark:ring-violet-700" : ""} ${isToday ? "outline outline-2 outline-offset-1 outline-primary" : ""}`}>
              <span>{day}</span>
              {status && <span className="text-[9px] font-medium leading-3">{status.present + status.absent} {status.present + status.absent === 1 ? "session" : "sessions"}</span>}
              {isToday && <span className="text-[8px] font-bold uppercase tracking-wide">Today</span>}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm border border-emerald-400 bg-emerald-100" /> Present record</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm border border-red-400 bg-red-100" /> Absence recorded</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm border border-border bg-muted/40" /> No record / future</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm border border-violet-400 bg-card" /> Weekend</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-primary/20 shadow-md">
        <CardHeader className="bg-gradient-to-r from-[#0A1931] to-[#18365C] text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="mb-2 flex items-center gap-2 text-[#F4D27A]"><BookOpenCheck className="h-5 w-5" /><span className="text-xs font-semibold uppercase tracking-[0.16em]">Learner record</span></div>
              <CardTitle className="text-xl sm:text-2xl">My attendance register</CardTitle>
              <CardDescription className="mt-1 text-white/75">Your own recorded class sessions only. Dates and statuses come from saved attendance records.</CardDescription>
            </div>
            <CalendarDays className="mt-1 h-7 w-7 shrink-0 text-[#F4D27A]" />
          </div>
        </CardHeader>
        <CardContent className="space-y-5 p-4 sm:p-6">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <div className="col-span-2 rounded-xl border border-primary/20 bg-primary/[0.06] p-3 sm:col-span-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Attendance rate</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{classLoading ? "…" : attendanceRate === null ? "—" : `${attendanceRate}%`}</p>
              <p className="text-[10px] text-muted-foreground">Based on recorded sessions</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-900 dark:bg-emerald-950/25">
              <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-300">Present sessions</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-800 dark:text-emerald-200">{classLoading ? "…" : presentCount}</p>
              <p className="text-[10px] text-emerald-700/80 dark:text-emerald-300/70">Marked present</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50/70 p-3 dark:border-red-900 dark:bg-red-950/25">
              <p className="text-[11px] font-medium uppercase tracking-wide text-red-800 dark:text-red-300">Absent sessions</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-red-800 dark:text-red-200">{classLoading ? "…" : absentCount}</p>
              <p className="text-[10px] text-red-700/80 dark:text-red-300/70">Absence recorded</p>
            </div>
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Recorded sessions</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{classLoading ? "…" : recordedCount}</p>
              <p className="text-[10px] text-muted-foreground">Present + absent</p>
            </div>
          </div>
          {classError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{classError}</p>}
          {renderCalendar()}
          {!classLoading && !classError && classRecords.length === 0 && <p className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">No personal attendance records are available yet. The calendar is intentionally empty until the API returns saved records.</p>}
          <p className="text-[11px] text-muted-foreground">A session is counted only when the attendance API returns a saved present or absent record. Unmarked dates are not counted as absences.</p>
        </CardContent>
      </Card>

      <Dialog open={dailyOpen} onOpenChange={setDailyOpen}>
        <DialogTrigger asChild>
          <button type="button" className="group block w-full rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
            <Card className="border-primary/20 shadow-sm transition-colors group-hover:border-primary/50">
              <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2 text-lg"><Activity className="h-5 w-5 text-primary" />Daily Dallyletter access</CardTitle>
                  <CardDescription className="mt-1">One presence per day · repeat opens count as activity</CardDescription>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-xl bg-muted/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Today · {today}</p>
                    {todayRecord ? <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Present</Badge> : <Badge variant="outline">No record yet</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{todayRecord ? `${todayRecord.open_count} app opens · ${todayRecord.activity_label}` : "Today's presence appears after a saved access record is returned."}</p>
                </div>
                {dailyLoading ? <p className="text-sm text-muted-foreground">Loading recent activity…</p> : dailyError ? <p role="alert" className="text-sm text-destructive">{dailyError}</p> : dailyRecords.length === 0 ? <p className="text-sm text-muted-foreground">No personal daily access records are available yet.</p> : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {recentDailyRecords.map(record => (
                      <div key={String(record.attendance_date).slice(0, 10)} className="rounded-lg border p-3">
                        <p className="text-xs font-semibold">{String(record.attendance_date).slice(0, 10)}</p>
                        <p className={`mt-1 text-sm font-semibold ${record.status === "present" ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>{record.status === "present" ? "Present" : "Absent"}</p>
                        <p className="text-[11px] text-muted-foreground">{record.open_count} opens · {record.activity_label}</p>
                      </div>
                    ))}
                  </div>
                )}
                <p className="flex items-center justify-end gap-1 text-xs font-semibold text-primary">Open full activity history <ChevronRight className="h-3.5 w-3.5" /></p>
              </CardContent>
            </Card>
          </button>
        </DialogTrigger>
        <DialogContent className="fixed inset-0 left-0 top-0 h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none border-0 p-0 sm:max-w-none">
          <div className="sticky top-0 z-10 border-b bg-background/95 px-4 py-4 backdrop-blur sm:px-6">
            <DialogHeader className="mx-auto max-w-4xl">
              <DialogTitle className="flex items-center gap-2 text-xl"><Activity className="h-5 w-5 text-primary" />Daily Dallyletter access</DialogTitle>
              <DialogDescription>Saved daily presence and app activity for your account.</DialogDescription>
            </DialogHeader>
          </div>
          <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-5 sm:px-6">
            <div className="rounded-xl border bg-muted/30 p-4">
              <p className="text-sm font-semibold">Today · {today}</p>
              {todayRecord ? <p className="mt-1 text-sm text-muted-foreground">{todayRecord.time_zone} · {todayRecord.last_source} · {todayRecord.open_count} app opens · {todayRecord.activity_label}</p> : <p className="mt-1 text-sm text-muted-foreground">No saved presence record for today yet.</p>}
            </div>
            {dailyLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading saved activity…</p> : dailyError ? <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{dailyError}</p> : dailyRecords.length === 0 ? <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No personal daily access records are available yet.</p> : dailyRecords.map(record => (
              <div key={String(record.attendance_date).slice(0, 10)} className="rounded-xl border p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="font-semibold">{formatDate(String(record.attendance_date))}</p><p className="mt-1 text-xs text-muted-foreground">{record.time_zone} · {record.last_source}</p></div>
                  <Badge className={record.status === "present" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}>{record.status === "present" ? "Present" : "Absent"}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div><p className="text-[10px] uppercase text-muted-foreground">App opens</p><p className="font-semibold tabular-nums">{record.open_count}</p></div>
                  <div><p className="text-[10px] uppercase text-muted-foreground">Activity</p><p className="font-semibold">{record.activity_label}</p></div>
                  <div><p className="text-[10px] uppercase text-muted-foreground">First open</p><p className="font-semibold">{formatTime(record.first_open_at)}</p></div>
                  <div><p className="text-[10px] uppercase text-muted-foreground">Last open</p><p className="font-semibold">{formatTime(record.last_open_at)}</p></div>
                </div>
              </div>
            ))}
            <p className="pb-5 text-xs text-muted-foreground">Reopening Dallyletter increments the activity count, not the number of attendance days. Dates follow the saved device-local timezone.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
