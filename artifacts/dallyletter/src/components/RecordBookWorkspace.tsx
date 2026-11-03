import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiUrl } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

type Row = Record<string, any>;
type AcademicData = { enrollments: Row[]; attendance: Row[]; awards: Row[]; assignmentMarks: Row[]; exerciseMarks: Row[]; pollSubmissions?: Row[]; markSummary?: Row };
const today = new Date();
const dateString = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const yearStart = `${today.getFullYear()}-01-01`;

async function api(path: string, init?: RequestInit) {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("dallyletter_token") : null;
  const response = await fetch(getApiUrl(path), { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...((init?.headers || {}) as Record<string, string>) } });
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
  const isStaff = ["teacher","manager","senior_manager","junior_manager","owner"].includes(role);
  const isManager = ["manager","senior_manager","junior_manager"].includes(role) || (role === "teacher" && (user as any)?.isManager === true);
  const [managerPermissions, setManagerPermissions] = useState<Record<string, boolean>>({});
  const [permissionLoaded, setPermissionLoaded] = useState(!isManager);
  const [isOwner, setIsOwner] = useState(role === "owner" || role === "platform_owner");
  const canCreateReports = !isManager || isOwner || managerPermissions["reports.create"] === true;
  const canViewReports = !isManager || isOwner || managerPermissions["reports.view"] === true;
  const canViewRecordBook = !isManager || isOwner || managerPermissions["recordbook.view"] === true;
  const [learners, setLearners] = useState<Row[]>([]);
  const [learnerId, setLearnerId] = useState("");
  const [termLabel, setTermLabel] = useState("Term record");
  const [periodStart, setPeriodStart] = useState(yearStart);
  const [periodEnd, setPeriodEnd] = useState(dateString(today));
  const [record, setRecord] = useState<AcademicData | null>(null);
  const [snapshot, setSnapshot] = useState<Row | null>(null);
  const [snapshotId, setSnapshotId] = useState<number | null>(null);
  const [snapshotStatus, setSnapshotStatus] = useState<string>("draft");
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
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
    try {
      const loaded: AcademicData = await api("/api/academic-records/me");
      if ((!Array.isArray(loaded.pollSubmissions) || loaded.pollSubmissions.length === 0) && role === "student") {
        try {
          const polls: Row[] = await api("/api/polls");
          const ownResults = await Promise.all(polls.slice(0, 100).map(async (poll: Row) => {
            try {
              const result = await api(`/api/polls/${poll.id}/my-results`);
              return result?.submitted ? { submission_id: `poll-${poll.id}`, poll_id: poll.id, title: result.poll?.title || poll.title, subject: poll.subject, grade: poll.grade, score: result.score, total_questions: result.totalQuestions, completed_at: result.completedAt, status: "saved result" } : null;
            } catch { return null; }
          }));
          loaded.pollSubmissions = ownResults.filter(Boolean) as Row[];
        } catch { /* Poll history may be unavailable; keep the other saved records visible. */ }
      }
      setRecord(loaded);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load saved academic records."); }
  }, [role]);

  useEffect(() => {
    if (isManager) {
      void fetch(getApiUrl("/api/manager-permissions/me"), { headers: { Authorization: "Bearer " + (typeof localStorage !== "undefined" ? localStorage.getItem("dallyletter_token") : "") } })
        .then(async response => { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "Could not load manager permissions"); setManagerPermissions(data.permissions || {}); setIsOwner(Boolean(data.isOwner)); })
        .catch(error => setError(error instanceof Error ? error.message : "Could not load manager permissions"))
        .finally(() => setPermissionLoaded(true));
      return;
    }
    if (isStaff) void loadLearners(); else void loadOwnRecord();
  }, [isManager, isStaff, loadLearners, loadOwnRecord]);
  useEffect(() => { if (isManager && permissionLoaded && canCreateReports) void loadLearners(); }, [isManager, permissionLoaded, canCreateReports, loadLearners]);

  const selectedLearner = useMemo(() => learners.find(l => String(l.id) === learnerId), [learners, learnerId]);
  const summary = record?.markSummary?.overall;
  const factual = snapshot?.factualRecords || {};
  const staffSummary = factual.markSummary?.overall;
  const activitySummary = isStaff ? staffSummary : summary;
  const shownRecord = snapshot ? {
    assignmentMarks: factual.assignmentMarks || [],
    exerciseMarks: factual.exerciseMarks || [],
    pollSubmissions: factual.pollSubmissions || [],
    markSummary: factual.markSummary || {}
  } : record;

  async function submitForReview() {
    if (!snapshotId) return;
    setReviewBusy(true); setError(""); setNotice("");
    try {
      const result = await api(`/api/academic-records/reports/drafts/${snapshotId}/submit`, { method: "POST", body: JSON.stringify({}) });
      setSnapshotStatus(String(result?.status || "pending_review").toLowerCase());
      setNotice("RecordBook submitted for review. A Senior Manager or Owner must approve or reject it before PDF download.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not submit the report for review."); }
    finally { setReviewBusy(false); }
  }

  async function refreshDraftStatus() {
    if (!snapshotId) return;
    setReviewBusy(true); setError("");
    try {
      const rows: Row[] = await api("/api/academic-records/reports/drafts");
      const current = rows.find(row => Number(row.id) === snapshotId);
      if (!current) throw new Error("This report is not available in your permitted review list.");
      setSnapshotStatus(String(current.status || "draft").toLowerCase());
      setNotice(`Report status refreshed: ${String(current.status || "draft").replace(/_/g, " ")}.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not refresh report status."); }
    finally { setReviewBusy(false); }
  }

  async function downloadPdfDraft() {
    if (!snapshotId) return;
    setPdfBusy(true); setError("");
    try {
      const token = typeof localStorage !== "undefined" ? localStorage.getItem("dallyletter_token") : null;
      const response = await fetch(getApiUrl(`/api/academic-records/reports/drafts/${snapshotId}/download/pdf`), {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `PDF request failed (${response.status}).`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `RecordBook-${snapshotId}.pdf`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      URL.revokeObjectURL(url);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not download the saved PDF draft."); }
    finally { setPdfBusy(false); }
  }

  async function buildSnapshot() {
    if (!learnerId || !termLabel.trim() || !periodStart || !periodEnd || periodStart > periodEnd) {
      setError("Choose a learner, enter a record label and select a valid date range."); return;
    }
    setBusy(true); setError(""); setNotice(""); setSnapshot(null); setSnapshotId(null); setSnapshotStatus("draft");
    try {
      const created = await api("/api/academic-records/reports/drafts", { method: "POST", body: JSON.stringify({ learnerId: Number(learnerId), reportType: "term_performance", termLabel: termLabel.trim(), periodStart, periodEnd }) });
      setSnapshot(created?.draft_content || null);
      setSnapshotId(Number(created?.id) || null);
      setSnapshotStatus(String(created?.status || "draft").toLowerCase());
      setNotice("RecordBook snapshot created from saved activity, attendance and achievement records. It is a report draft—not an approved report.");
    } catch (e) { setError(e instanceof Error ? e.message : "RecordBook could not be built from saved records."); }
    finally { setBusy(false); }
  }

  return <Card className="overflow-hidden border-primary/25 shadow-sm">
    <CardHeader className="bg-gradient-to-r from-primary/[0.08] to-transparent">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-primary">Academic workspace</p><CardTitle className="mt-1">RecordBook</CardTitle><p className="mt-1 text-sm text-muted-foreground">{isStaff ? "Build an activity-by-activity view from existing saved records. Mark work in its original activity workspace." : "Your saved activity results, with missing marks kept unscored."}</p></div><span className="rounded-full border px-3 py-1 text-xs font-semibold">Saved records only</span></div>
    </CardHeader>
    <CardContent className="space-y-4 p-4">
      {isStaff && canCreateReports && <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Learner<select className="mt-1 w-full rounded-md border bg-background p-2.5" value={learnerId} onChange={e=>{setLearnerId(e.target.value);setSnapshot(null);}}><option value="">Choose assigned learner</option>{learners.map(l=><option key={l.id} value={String(l.id)}>{l.name} · {l.grade || "Grade not recorded"}</option>)}</select></label>
        <label className="text-sm font-medium">Term / record label<input className="mt-1 w-full rounded-md border bg-background p-2.5" maxLength={80} value={termLabel} onChange={e=>setTermLabel(e.target.value)} /></label>
        <label className="text-sm font-medium">Period starts<input type="date" className="mt-1 w-full rounded-md border bg-background p-2.5" value={periodStart} onChange={e=>setPeriodStart(e.target.value)} /></label>
        <label className="text-sm font-medium">Period ends<input type="date" className="mt-1 w-full rounded-md border bg-background p-2.5" value={periodEnd} onChange={e=>setPeriodEnd(e.target.value)} /></label>
        <div className="sm:col-span-2"><Button disabled={busy || !learnerId} onClick={()=>void buildSnapshot()}>{busy ? "Building from saved records…" : "Build RecordBook from saved activities"}</Button></div>
      </div>}
      {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">{error}</p>}
      {notice && <p role="status" className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">{notice}</p>}
      {isStaff && canCreateReports && !learners.length && !error && <p className="text-sm text-muted-foreground">No learners are currently available through your permitted report access.</p>}
      {isManager && permissionLoaded && !canCreateReports && <p className="rounded-lg border p-3 text-sm text-muted-foreground">Report creation is not enabled for this manager account. Ask the Owner to grant Reports → Create academic reports.</p>}
      {isManager && permissionLoaded && canCreateReports && !canViewRecordBook && <p className="rounded-lg border p-3 text-sm text-muted-foreground">You can build reports, but RecordBook view access is not granted. Ask the Owner to grant RecordBook → View saved RecordBook activity.</p>}
      {!isStaff && record && <div className="grid gap-2 sm:grid-cols-4"><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Marked activities</p><p className="text-xl font-bold">{summary?.markedCount ?? 0}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Assignment/exercise marks</p><p className="text-xl font-bold">{summary?.earnedMarks ?? "—"}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Possible marks</p><p className="text-xl font-bold">{summary?.possibleMarks ?? "—"}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Overall percentage</p><p className="text-xl font-bold">{summary?.percentage == null ? "Not available" : `${summary.percentage}%`}</p></div></div>}
      {isStaff && selectedLearner && <p className="text-sm text-muted-foreground">Selected learner: <strong>{selectedLearner.name}</strong>. Only records within the selected period are included in the generated snapshot.</p>}
      {isStaff && canViewRecordBook && <div className="flex flex-wrap gap-2 rounded-lg border bg-muted/20 p-3"><span className="w-full text-xs font-semibold uppercase tracking-wide text-muted-foreground">Record marks in the existing activity workspaces</span><Link href="/teacher/assignments"><Button variant="outline" size="sm">Open assignments</Button></Link><Link href="/teacher/polls"><Button variant="outline" size="sm">Open polls & quizzes</Button></Link><Link href="/teacher/classes"><Button variant="outline" size="sm">Open classes & exercises</Button></Link></div>}

      {activitySummary && <div className="grid gap-2 sm:grid-cols-4"><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Marked activities</p><p className="text-xl font-bold">{activitySummary.markedCount ?? 0}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Actual marks</p><p className="text-xl font-bold">{activitySummary.earnedMarks ?? "—"}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Possible marks</p><p className="text-xl font-bold">{activitySummary.possibleMarks ?? "—"}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Overall percentage</p><p className="text-xl font-bold">{activitySummary.percentage == null ? "Not available" : `${activitySummary.percentage}%`}</p></div></div>}
      {isStaff && snapshot && <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm"><span>Saved report draft ID: <strong>{snapshotId || "Unavailable"}</strong></span><span className="rounded-full border px-2 py-1 text-xs font-semibold capitalize">{snapshotStatus.replace(/_/g, " ")}</span>{snapshotId && snapshotStatus === "draft" && canCreateReports && <Button size="sm" disabled={reviewBusy} onClick={()=>void submitForReview()}>{reviewBusy ? "Submitting…" : "Submit for review"}</Button>}{snapshotId && canViewReports && <Button variant="outline" size="sm" disabled={reviewBusy} onClick={()=>void refreshDraftStatus()}>{reviewBusy ? "Refreshing…" : "Refresh status"}</Button>}{snapshotId && snapshotStatus === "approved" && canViewReports && <Button variant="outline" size="sm" disabled={pdfBusy} onClick={()=>void downloadPdfDraft()}>{pdfBusy ? "Preparing PDF…" : "Download approved PDF"}</Button>}<span className="text-muted-foreground">{snapshotStatus === "approved" ? "PDF access follows existing report permissions." : snapshotStatus === "pending_review" ? "Awaiting Senior Manager / Owner review." : "Submit this draft for Senior Manager / Owner review before PDF download."}</span></div>}
      {shownRecord && <div className="space-y-5">
        <MarkRows title="Exercises" rows={shownRecord.exerciseMarks || []} kind="exercise" />
        <MarkRows title="Assignments" rows={shownRecord.assignmentMarks || []} kind="assignment" />
        <MarkRows title="Polls / quizzes" rows={shownRecord.pollSubmissions || []} kind="poll" />
        {(isStaff ? Boolean(snapshot) : Boolean(record)) && <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg border p-3"><h4 className="font-semibold text-sm">Attendance evidence</h4><p className="mt-1 text-sm text-muted-foreground">Sessions: {isStaff ? (factual.attendanceSummary?.sessions ?? "Not recorded") : (record?.attendance?.length ?? 0)} · Present: {isStaff ? (factual.attendanceSummary?.present ?? "Not recorded") : (record?.attendance?.filter((a: Row) => String(a.status).toLowerCase() === "present" && !a.is_late).length ?? 0)} · Absent: {isStaff ? (factual.attendanceSummary?.absent ?? "Not recorded") : (record?.attendance?.filter((a: Row) => String(a.status).toLowerCase() === "absent").length ?? 0)} · Late: {isStaff ? (factual.attendanceSummary?.late ?? "Not recorded") : (record?.attendance?.filter((a: Row) => Boolean(a.is_late) || String(a.status).toLowerCase() === "late").length ?? 0)}</p></div><div className="rounded-lg border p-3"><h4 className="font-semibold text-sm">Achievements</h4><p className="mt-1 text-sm text-muted-foreground">{(isStaff ? factual.awards : record?.awards || []).length} saved achievement(s){isStaff ? " in this period" : ""}.</p>{(isStaff ? factual.awards : record?.awards || []).map((a: Row, i: number)=><p className="mt-1 text-sm" key={a.id || i}>{a.name || "Achievement"} · {fmtDate(a.earned_at)}</p>)}</div></div>}
        <div className="rounded-lg border bg-muted/20 p-3 text-sm"><p className="font-semibold">Record integrity</p><p className="mt-1 text-muted-foreground">Marks come from saved exercise submissions, assignment submissions and poll submissions. The summary follows the existing exercise/assignment calculation; poll results are listed separately and are not silently added to that summary. Unmarked work is not counted as zero. No official weighting rules are assumed.</p>{!isStaff && <Button variant="outline" size="sm" className="mt-3" onClick={()=>void loadOwnRecord()}>Refresh saved results</Button>}</div>
      </div>}
      {!isStaff && !record && !error && <p className="text-sm text-muted-foreground">Loading your saved academic records…</p>}
    </CardContent>
  </Card>;
}
