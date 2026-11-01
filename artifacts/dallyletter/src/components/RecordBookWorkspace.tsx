import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiUrl } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Row = Record<string, any>;
type AcademicData = { enrollments: Row[]; attendance: Row[]; awards: Row[]; assignmentMarks: Row[]; exerciseMarks: Row[]; pollSubmissions?: Row[]; markSummary?: Row };
const today = new Date();
const dateString = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const yearStart = `${today.getFullYear()}-01-01`;

async function api(path: string, init?: RequestInit) {
  const response = await fetch(getApiUrl(path), { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}
function fmtDate(value: unknown) {
  if (!value) return "Date not recorded";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "Date not recorded" : date.toLocaleDateString();
}
function MarkRows({ title, rows, kind }: { title: string; rows: Row[]; kind: "exercise" | "assignment" | "poll" }) {
  return <section className="space-y-2">
    <h4 className="font-semibold text-sm">{title} <span className="text-muted-foreground font-normal">({rows.length})</span></h4>
    {!rows.length ? <p className="text-sm text-muted-foreground">No saved {title.toLowerCase()} in this record.</p> : <div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead className="bg-muted/50"><tr className="text-left"><th className="p-2">Activity</th><th className="p-2">Date</th><th className="p-2">Actual / possible</th><th className="p-2">Status</th></tr></thead><tbody>{rows.map((row, i) => {
      const actual = kind === "exercise" ? row.total_score : kind === "assignment" ? row.marks : row.score;
      const possible = kind === "poll" ? row.total_questions : row.total_marks;
      const status = String(row.status || (actual == null ? "score not recorded" : "saved result"));
      return <tr className="border-t" key={String(row.submission_id || row.id || i)}><td className="p-2"><div className="font-medium">{row.title || (kind === "exercise" ? "Exercise" : kind === "assignment" ? "Assignment" : "Poll")}</div><div className="text-xs text-muted-foreground">{row.subject || row.grade || "Subject not recorded"} · ID {row.submission_id || row.id || "not available"}</div></td><td className="p-2 whitespace-nowrap">{fmtDate(row.graded_at || row.marked_at || row.returned_at || row.completed_at || row.submitted_at)}</td><td className="p-2 font-semibold">{actual == null || possible == null ? "Not fully marked" : `${actual} / ${possible}`}{actual != null && possible > 0 ? <div className="text-xs text-muted-foreground">{Math.round(Number(actual) / Number(possible) * 10000) / 100}%</div> : null}</td><td className="p-2"><span className="rounded-full border px-2 py-1 text-xs">{status}</span></td></tr>;
    })}</tbody></table></div>}
  </section>;
}
export default function RecordBookWorkspace() {
  const { user } = useAuth();
  const role = String(user?.role || "").toLowerCase().replace(/[ -]+/g, "_");
  const isStaff = ["teacher","manager","senior_manager","owner","admin","platform_owner"].includes(role);
  const [learners, setLearners] = useState<Row[]>([]);
  const [learnerId, setLearnerId] = useState("");
  const [termLabel, setTermLabel] = useState("Term record");
  const [periodStart, setPeriodStart] = useState(yearStart);
  const [periodEnd, setPeriodEnd] = useState(dateString(today));
  const [record, setRecord] = useState<AcademicData | null>(null);
  const [snapshot, setSnapshot] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadLearners = useCallback(async () => {
    try {
      const rows = await api("/api/academic-records/report-learners");
      const safeRows = Array.isArray(rows) ? rows : [];
      setLearners(safeRows);
      setLearnerId(current => current && safeRows.some((r: Row) => String(r.id) === current) ? current : (safeRows[0] ? String(safeRows[0].id) : ""));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load assigned learners."); }
  }, []);

  const loadOwnRecord = useCallback(async () => {
    try { setRecord(await api("/api/academic-records/me")); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load saved academic records."); }
  }, []);

  useEffect(() => { if (isStaff) void loadLearners(); else void loadOwnRecord(); }, [isStaff, loadLearners, loadOwnRecord]);

  const selectedLearner = useMemo(() => learners.find(l => String(l.id) === learnerId), [learners, learnerId]);
  const summary = record?.markSummary?.overall;
  const factual = snapshot?.factualRecords || {};
  const shownRecord = snapshot ? {
    assignmentMarks: factual.assignmentMarks || [],
    exerciseMarks: factual.exerciseMarks || [],
    pollSubmissions: factual.pollSubmissions || [],
    markSummary: factual.markSummary || {}
  } : record;

  async function buildSnapshot() {
    if (!learnerId || !termLabel.trim() || !periodStart || !periodEnd || periodStart > periodEnd) {
      setError("Choose a learner, enter a record label and select a valid date range."); return;
    }
    setBusy(true); setError(""); setNotice(""); setSnapshot(null);
    try {
      const created = await api("/api/academic-records/reports/drafts", { method: "POST", body: JSON.stringify({ learnerId: Number(learnerId), reportType: "term_performance", termLabel: termLabel.trim(), periodStart, periodEnd }) });
      setSnapshot(created?.draft_content || null);
      setNotice("RecordBook snapshot created from saved activity, attendance and achievement records. It is a report draft—not an approved report.");
    } catch (e) { setError(e instanceof Error ? e.message : "RecordBook could not be built from saved records."); }
    finally { setBusy(false); }
  }

  return <Card className="overflow-hidden border-primary/25 shadow-sm">
    <CardHeader className="bg-gradient-to-r from-primary/[0.08] to-transparent">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-primary">Academic workspace</p><CardTitle className="mt-1">RecordBook</CardTitle><p className="mt-1 text-sm text-muted-foreground">{isStaff ? "Build an activity-by-activity view from existing saved records. Mark work in its original activity workspace." : "Your saved activity results, with missing marks kept unscored."}</p></div><span className="rounded-full border px-3 py-1 text-xs font-semibold">Saved records only</span></div>
    </CardHeader>
    <CardContent className="space-y-4 p-4">
      {isStaff && <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Learner<select className="mt-1 w-full rounded-md border bg-background p-2.5" value={learnerId} onChange={e=>{setLearnerId(e.target.value);setSnapshot(null);}}><option value="">Choose assigned learner</option>{learners.map(l=><option key={l.id} value={String(l.id)}>{l.name} · {l.grade || "Grade not recorded"}</option>)}</select></label>
        <label className="text-sm font-medium">Term / record label<input className="mt-1 w-full rounded-md border bg-background p-2.5" maxLength={80} value={termLabel} onChange={e=>setTermLabel(e.target.value)} /></label>
        <label className="text-sm font-medium">Period starts<input type="date" className="mt-1 w-full rounded-md border bg-background p-2.5" value={periodStart} onChange={e=>setPeriodStart(e.target.value)} /></label>
        <label className="text-sm font-medium">Period ends<input type="date" className="mt-1 w-full rounded-md border bg-background p-2.5" value={periodEnd} onChange={e=>setPeriodEnd(e.target.value)} /></label>
        <div className="sm:col-span-2"><Button disabled={busy || !learnerId} onClick={()=>void buildSnapshot()}>{busy ? "Building from saved records…" : "Build RecordBook from saved activities"}</Button></div>
      </div>}
      {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">{error}</p>}
      {notice && <p role="status" className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">{notice}</p>}
      {isStaff && !learners.length && !error && <p className="text-sm text-muted-foreground">No learners are currently available through your permitted report access.</p>}
      {!isStaff && record && <div className="grid gap-2 sm:grid-cols-4"><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Marked activities</p><p className="text-xl font-bold">{summary?.markedCount ?? 0}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Actual marks</p><p className="text-xl font-bold">{summary?.earnedMarks ?? "—"}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Possible marks</p><p className="text-xl font-bold">{summary?.possibleMarks ?? "—"}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Overall percentage</p><p className="text-xl font-bold">{summary?.percentage == null ? "Not available" : `${summary.percentage}%`}</p></div></div>}
      {isStaff && selectedLearner && <p className="text-sm text-muted-foreground">Selected learner: <strong>{selectedLearner.name}</strong>. Only records within the selected period are included in the generated snapshot.</p>}
      {shownRecord && <div className="space-y-5">
        <MarkRows title="Exercises" rows={shownRecord.exerciseMarks || []} kind="exercise" />
        <MarkRows title="Assignments" rows={shownRecord.assignmentMarks || []} kind="assignment" />
        <MarkRows title="Polls / quizzes" rows={shownRecord.pollSubmissions || []} kind="poll" />
        <div className="rounded-lg border bg-muted/20 p-3 text-sm"><p className="font-semibold">Record integrity</p><p className="mt-1 text-muted-foreground">Marks come from saved exercise submissions, assignment submissions and poll submissions. Unmarked work is not counted as zero. This workspace does not create duplicate marks or assume official weighting rules.</p>{!isStaff && <Button variant="outline" size="sm" className="mt-3" onClick={()=>void loadOwnRecord()}>Refresh saved results</Button>}</div>
      </div>}
      {!isStaff && !record && !error && <p className="text-sm text-muted-foreground">Loading your saved academic records…</p>}
    </CardContent>
  </Card>;
}
