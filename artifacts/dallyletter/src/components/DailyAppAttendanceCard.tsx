import { useEffect, useMemo, useState } from "react";
import { getApiUrl } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Activity, ChevronRight, BookOpenCheck, ChevronLeft } from "lucide-react";

type ClassAttendance = {
  id: number;
  classId: number;
  joinedAt?: string;
  joined_at?: string;
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


export function DailyAppAttendanceCard({profileId}:{profileId?:number}) {
  const { user } = useAuth();
  const targetId=profileId??user?.id;
  const isOwn=!profileId||profileId===user?.id;
  const [classRecords, setClassRecords] = useState<ClassAttendance[]>([]);
  const [dailyRecords, setDailyRecords] = useState<DailyRecord[]>([]);
  const [classLoading, setClassLoading] = useState(true);
  const [dailyLoading, setDailyLoading] = useState(true);
  const [classError, setClassError] = useState("");
  const [dailyError, setDailyError] = useState("");
  const [dailyOpen, setDailyOpen] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState(todayInLocalZone());
  const [offlineClassCache, setOfflineClassCache] = useState(false);
  const [offlineDailyCache, setOfflineDailyCache] = useState(false);
  const today = todayInLocalZone();
  const monthDate = new Date(new Date().getFullYear(), new Date().getMonth() + monthOffset, 1);
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthLabel = monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const monthDays = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const mondayOffset = (monthStart.getDay() + 6) % 7;
  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  useEffect(() => {
    let active = true;
    const token = localStorage.getItem("dallyletter_token");
    if (!token || !user?.id || !targetId) {
      setClassLoading(false);
      setDailyLoading(false);
      return;
    }
    const headers = { Authorization: "Bearer " + token };
    const loadClassAttendance = async () => {
      try {
        const path=isOwn?"/api/academic-records/me":"/api/attendance/student/"+targetId;
        const response = await fetch(getApiUrl(path), { headers, cache: "no-store" });
        if (!response.ok) throw new Error(response.status===403?"This user's attendance section is private.":"Attendance records could not be loaded.");
        const payload = await response.json();
        if (active) {
          const source=Array.isArray(payload.attendance)?payload.attendance:payload;
          const records = Array.isArray(source) ? source.map((record: any) => ({ ...record, joinedAt: record.joinedAt ?? record.joined_at })) : [];
          setClassRecords(records);
          if(isOwn)try { localStorage.setItem("dallyletter_attendance_calendar_v1_" + user.id, JSON.stringify({ savedAt: Date.now(), records })); } catch { /* Optional cache. */ }
          setOfflineClassCache(false);
          setClassError("");
        }
      } catch (error) {
        if (active) {
          if(isOwn){
            try { const cached = localStorage.getItem("dallyletter_attendance_calendar_v1_" + user.id); const parsed = cached ? JSON.parse(cached) : null; if (Array.isArray(parsed?.records)) { setClassRecords(parsed.records); setOfflineClassCache(true); setClassError(""); } else setClassError(error instanceof Error ? error.message : "Attendance records could not be loaded."); }
            catch { setClassError(error instanceof Error ? error.message : "Attendance records could not be loaded."); }
          }else setClassError(error instanceof Error ? error.message : "Attendance records could not be loaded.");
        }
      } finally {
        if (active) setClassLoading(false);
      }
    };
    const loadDailyAttendance = async () => {
      try {
        const path=isOwn?"/api/daily-attendance/me":"/api/daily-attendance/user/"+targetId;
        const response = await fetch(getApiUrl(path), { headers, cache: "no-store" });
        if (!response.ok) throw new Error(response.status===403?"This user's daily register is private.":"Daily access history is temporarily unavailable.");
        const payload = await response.json();
        if (active) {
          const records = Array.isArray(payload.records) ? payload.records : [];
          setDailyRecords(records);
          if(isOwn)try { localStorage.setItem("dallyletter_daily_attendance_calendar_v1_" + user.id, JSON.stringify({ savedAt: Date.now(), records })); } catch { /* Optional cache. */ }
          setOfflineDailyCache(false);
          setDailyError("");
        }
      } catch (error) {
        if (active) {
          if(isOwn){
            try { const cached = localStorage.getItem("dallyletter_daily_attendance_calendar_v1_" + user.id); const parsed = cached ? JSON.parse(cached) : null; if (Array.isArray(parsed?.records)) { setDailyRecords(parsed.records); setOfflineDailyCache(true); setDailyError(""); } else setDailyError(error instanceof Error ? error.message : "Daily access history could not be loaded."); }
            catch { setDailyError(error instanceof Error ? error.message : "Daily access history could not be loaded."); }
          }else setDailyError(error instanceof Error ? error.message : "Daily access history could not be loaded.");
        }
      } finally {
        if (active) setDailyLoading(false);
      }
    };
    void loadClassAttendance();
    void loadDailyAttendance();
    return () => { active = false; };
  }, [user?.id, targetId, isOwn]);

  const presentCount = classRecords.filter(record => record.status?.toLowerCase() === "present").length;
  const absentCount = classRecords.filter(record => record.status?.toLowerCase() === "absent").length;
  const recordedCount = presentCount + absentCount;
  const attendanceRate = recordedCount ? Math.round((presentCount / recordedCount) * 100) : null;

  // Calendar = daily Dallyletter app access. Class-session totals remain separate.
  const dailyStatus = useMemo(() => new Map(
    dailyRecords.map(record => [String(record.attendance_date).slice(0, 10), record] as const),
  ), [dailyRecords]);

  const todayRecord = dailyRecords.find(record => String(record.attendance_date).slice(0, 10) === today);
  const recentDailyRecords = dailyRecords.slice(0, 3);

  const renderCalendar = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1">
          <button type="button" aria-label="Previous month" onClick={() => { const next = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1); const day = Math.min(Number(selectedDate.slice(8, 10)) || 1, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()); setMonthOffset(value => value - 1); setSelectedDate(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`); }} className="rounded-md border p-1.5 hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
          <div className="min-w-0 px-1"><p className="text-sm font-semibold text-foreground">{monthLabel}</p><p className="text-xs text-muted-foreground">Daily Dallyletter app access · offline-ready</p></div>
          <button type="button" aria-label="Next month" onClick={() => { const next = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1); const day = Math.min(Number(selectedDate.slice(8, 10)) || 1, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()); setMonthOffset(value => value + 1); setSelectedDate(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`); }} className="rounded-md border p-1.5 hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <Badge variant="outline" className="shrink-0 border-primary/20 bg-primary/5">{dailyRecords.length} days recorded</Badge>
      </div>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {weekdayLabels.map((day, index) => (
          <div key={day} className={`py-1 text-center text-[11px] font-semibold ${index > 4 ? "text-violet-700 dark:text-violet-300" : "text-muted-foreground"}`}>{day}</div>
        ))}
        {Array.from({ length: mondayOffset }, (_, index) => <div key={`blank-${index}`} aria-hidden="true" />)}
        {Array.from({ length: monthDays }, (_, index) => {
          const day = index + 1;
          const key = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const status = dailyStatus.get(key);
          const isToday = key === today;
          const isAbsent = status?.status === "absent";
          const isPresent = status?.status === "present";
          // A missing row is unknown (including dates before tracking began), not an absence.
          const colorClass = isAbsent
            ? "bg-red-300 text-red-950 border-red-500 dark:bg-red-800 dark:text-white dark:border-red-500"
            : isPresent
              ? "bg-emerald-300 text-emerald-950 border-emerald-500 dark:bg-emerald-800 dark:text-white dark:border-emerald-500"
              : "bg-card text-foreground border-border";
          return (
            <button type="button" key={key} aria-pressed={selectedDate === key} onClick={() => setSelectedDate(key)} title={`${formatDate(key)} · ${isPresent ? "Opened Dallyletter" : isAbsent ? "No app open · absence recorded" : "No daily app record"}${status ? ` · ${status.open_count} app opens` : ""}`} aria-label={`${formatDate(key)}: ${isPresent ? "Dallyletter opened" : isAbsent ? "daily app absence recorded" : "no daily app access record"}`} className={`relative flex min-h-[42px] flex-col items-center justify-center rounded-lg border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b38b00] sm:min-h-[54px] ${colorClass} ${isToday ? "border-2 border-[#0f2a5a] outline outline-1 outline-offset-1 outline-[#0f2a5a]" : ""} ${selectedDate === key ? "ring-2 ring-[#b38b00] ring-offset-1" : ""}`}>
              <span>{day}</span>
              {status && <span className="text-[9px] font-bold leading-3">{isPresent ? `${status.open_count} opens` : "Absent"}</span>}
              {isToday && <span className="text-[8px] font-bold uppercase tracking-wide">Today</span>}
            </button>
          );
        })}
      </div>
      <div aria-live="polite" className="rounded-lg border border-[#b38b00]/30 bg-muted/30 px-3 py-2">
        <p className="text-xs font-semibold text-foreground">Selected date · {formatDate(selectedDate)}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{(() => { const item = dailyStatus.get(selectedDate); return item ? item.status === "present" ? `Dallyletter opened · ${item.open_count} app opens · ${item.time_zone}` : "No Dallyletter app open was recorded for this completed day." : "No daily app-access record saved for this date."; })()}</p>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm border border-emerald-500 bg-emerald-300 dark:border-emerald-500 dark:bg-emerald-800" /> Opened Dallyletter (green)</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm border border-red-500 bg-red-300 dark:border-red-500 dark:bg-red-800" /> No app open after day close (red)</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm border border-border bg-card" /> No daily record (neutral)</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm border-2 border-[#0f2a5a] bg-card" /> Today (navy border)</span>
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
              <CardDescription className="mt-1 text-white/75">The calendar records whether you opened Dallyletter each day. Class-session totals below are separate and use saved class attendance marks.</CardDescription>
            </div>
            <CalendarDays className="mt-1 h-7 w-7 shrink-0 text-[#F4D27A]" />
          </div>
        </CardHeader>
        <CardContent className="space-y-5 p-4 sm:p-6">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <div className="col-span-2 rounded-xl border border-primary/20 bg-primary/[0.06] p-3 sm:col-span-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Class-session attendance rate</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{classLoading ? "…" : classError ? "—" : attendanceRate === null ? "—" : `${attendanceRate}%`}</p>
              <p className="text-[10px] text-muted-foreground">Based on recorded sessions</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-900 dark:bg-emerald-950/25">
              <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-300">Present sessions</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-800 dark:text-emerald-200">{classLoading ? "…" : classError ? "—" : presentCount}</p>
              <p className="text-[10px] text-emerald-700/80 dark:text-emerald-300/70">Marked present</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50/70 p-3 dark:border-red-900 dark:bg-red-950/25">
              <p className="text-[11px] font-medium uppercase tracking-wide text-red-800 dark:text-red-300">Absent sessions</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-red-800 dark:text-red-200">{classLoading ? "…" : classError ? "—" : absentCount}</p>
              <p className="text-[10px] text-red-700/80 dark:text-red-300/70">Absence recorded</p>
            </div>
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Recorded sessions</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{classLoading ? "…" : classError ? "—" : recordedCount}</p>
              <p className="text-[10px] text-muted-foreground">Saved class marks only</p>
            </div>
          </div>
          {classError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{classError}</p>}
          {offlineClassCache && <p role="status" className="rounded-lg border border-orange-300 bg-orange-50 p-2 text-xs text-orange-900">Offline mode: showing the last saved attendance records on this device. New changes sync after reconnecting.</p>}
          {renderCalendar()}
          {!classLoading && !classError && classRecords.length === 0 && <p className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">No class-session attendance records have been saved yet. This does not affect the daily Dallyletter app-access calendar above.</p>}
          <p className="text-[11px] text-muted-foreground">A session is counted only when the attendance API returns a saved present or absent record. Unmarked dates are not counted as absences.</p>
        </CardContent>
      </Card>

      <Dialog open={dailyOpen} onOpenChange={setDailyOpen}>
        <DialogTrigger asChild>
          <button type="button" className="group block w-full rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
            <Card className="flex h-[292px] flex-col overflow-hidden border-primary/20 shadow-sm transition-colors group-hover:border-primary/50 sm:h-[276px]">
              <CardHeader className="flex shrink-0 flex-row items-center justify-between gap-3 px-3 pb-2 pt-3">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4 shrink-0 text-primary" />Daily Dallyletter access</CardTitle>
                  <CardDescription className="mt-1 text-xs">One presence per day · repeat opens count as activity</CardDescription>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-3 pb-3 pt-1">
                <div className="shrink-0 rounded-lg bg-muted/40 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-semibold">Today · {today}</p>
                    {todayRecord ? <Badge className="shrink-0 bg-emerald-600 text-white hover:bg-emerald-600">Present</Badge> : <Badge className="shrink-0" variant="outline">No record yet</Badge>}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{todayRecord ? `${todayRecord.open_count} app opens · ${todayRecord.activity_label}` : "Today's presence appears after a saved access record is returned."}</p>
                </div>
                {offlineDailyCache && <p role="status" className="shrink-0 truncate text-[10px] text-orange-800">Offline mode: showing saved activity.</p>}
                {dailyLoading ? <p className="text-xs text-muted-foreground">Loading recent activity…</p> : dailyError ? <p role="alert" className="line-clamp-2 text-xs text-destructive">{dailyError}</p> : dailyRecords.length === 0 ? <p className="text-xs text-muted-foreground">No personal daily access records are available yet.</p> : (
                  <div className="grid shrink-0 grid-cols-3 gap-1.5">
                    {recentDailyRecords.map(record => (
                      <div key={String(record.attendance_date).slice(0, 10)} className="min-w-0 rounded-lg border px-2 py-2">
                        <p className="truncate text-[10px] font-semibold">{String(record.attendance_date).slice(0, 10)}</p>
                        <p className={`mt-1 text-xs font-semibold ${record.status === "present" ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>{record.status === "present" ? "Present" : "Absent"}</p>
                        <p className="truncate text-[10px] text-muted-foreground">{record.open_count} opens · {record.activity_label}</p>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-auto flex shrink-0 items-center justify-end gap-1 text-xs font-semibold text-primary">Open full activity history <ChevronRight className="h-3.5 w-3.5" /></p>
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
