import { getApiUrl } from "@workspace/api-client-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Users, BookOpen, Video, AlertTriangle, TrendingUp, GraduationCap, Shield, BarChart3, Star } from "lucide-react";
import { ActivityMonitor } from "@/components/ActivityMonitor";
import { InstallAppCard } from "@/components/InstallAppCard";

const token = () => localStorage.getItem("dallyletter_token") ?? "";

export default function ManagerHome() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [transferQueue, setTransferQueue] = useState<any[]>([]);
  const [reportQueue, setReportQueue] = useState<any[]>([]);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [queueBusyId, setQueueBusyId] = useState<string | null>(null);
  const [queueMessage, setQueueMessage] = useState("");

  useEffect(() => {
    fetch(getApiUrl("/api/manager/dashboard"), { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const loadAcademicQueues = async () => {
    const headers = { Authorization: `Bearer ${token()}` };
    const [transfers, reports] = await Promise.all([
      fetch(getApiUrl("/api/academic-records/transfer-requests"), { headers }),
      fetch(getApiUrl("/api/academic-records/reports/drafts"), { headers }),
    ]);
    if (transfers.ok) {
      const rows = await transfers.json().catch(() => []);
      setTransferQueue(Array.isArray(rows) ? rows.filter((row: any) => row.status === "pending") : []);
    } else if (transfers.status === 403) setTransferQueue([]);
    if (reports.ok) {
      const rows = await reports.json().catch(() => []);
      setReportQueue(Array.isArray(rows) ? rows.filter((row: any) => row.status === "pending_review") : []);
    } else if (reports.status === 403) setReportQueue([]);
  };

  useEffect(() => { void loadAcademicQueues().catch(() => setQueueMessage("Academic review queues are temporarily unavailable.")); }, []);

  const reviewAcademicItem = async (kind: "transfer" | "report", id: number, status: "approved" | "rejected") => {
    const key = kind + "-" + id;
    setQueueBusyId(key);
    setQueueMessage("");
    try {
      const endpoint = kind === "transfer"
        ? "/api/academic-records/transfer-requests/" + id + "/review"
        : "/api/academic-records/reports/drafts/" + id + "/review";
      const response = await fetch(getApiUrl(endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ status, note: reviewNotes[key] || "" }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Review action was denied.");
      setQueueMessage((kind === "transfer" ? "Transfer request " : "Report ") + "#" + id + " " + status + ".");
      setReviewNotes(notes => ({ ...notes, [key]: "" }));
      await loadAcademicQueues();
    } catch (error) {
      setQueueMessage(error instanceof Error ? error.message : "Review action failed.");
    } finally {
      setQueueBusyId(null);
    }
  };

  if (loading) return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-7xl px-4 pt-4"><InstallAppCard /></div>
      <div className="flex items-center justify-center h-64 text-slate-500">Loading manager dashboard…</div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-700 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-white/20 p-2 rounded-xl"><Shield className="h-5 w-5" /></div>
            <div>
              <h1 className="text-xl font-bold">Manager Dashboard</h1>
              <p className="text-indigo-200 text-sm">Welcome back, {user?.name}</p>
            </div>
          </div>
          <p className="text-indigo-100 text-sm mt-2">Monitor teachers, students, classes, and platform activity.</p>
        </div>

        {/* Stats */}
        {data?.stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Teachers", value: data.stats.teachers, icon: GraduationCap, color: "text-emerald-600", bg: "bg-emerald-50" },
              { label: "Students", value: data.stats.students, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
              { label: "Classes", value: data.stats.classes, icon: Video, color: "text-purple-600", bg: "bg-purple-50" },
              { label: "Lessons", value: data.stats.lessons, icon: BookOpen, color: "text-amber-600", bg: "bg-amber-50" },
            ].map(m => (
              <Card key={m.label} className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className={`w-10 h-10 rounded-xl ${m.bg} flex items-center justify-center mb-2`}>
                    <m.icon className={`h-5 w-5 ${m.color}`} />
                  </div>
                  <p className="text-2xl font-bold text-slate-900">{m.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{m.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {(transferQueue.length > 0 || reportQueue.length > 0 || queueMessage) && <section className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Academic approvals</h2>
            <p className="text-sm text-slate-500">Approval controls are checked again by the server. If your role lacks a permission, its queue is not shown.</p>
            {queueMessage && <p role="status" className="mt-2 rounded-lg border bg-white p-3 text-sm text-slate-700">{queueMessage}</p>}
          </div>
          {transferQueue.length > 0 && <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle>Transfer letter requests <Badge className="ml-2">{transferQueue.length}</Badge></CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {transferQueue.map((item: any) => {
                const key = "transfer-" + item.id;
                return <article key={item.id} className="rounded-xl border p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold text-slate-900">{item.learner_name || "Learner #" + item.learner_id}</h3><p className="text-xs text-slate-500">Request #{item.id} · Submitted {item.created_at ? new Date(item.created_at).toLocaleDateString() : "date unavailable"}</p></div><Badge>Pending</Badge></div>
                  <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{item.reason}</p>
                  <Textarea aria-label={"Review comments for transfer request " + item.id} maxLength={2000} value={reviewNotes[key] || ""} onChange={event => setReviewNotes(notes => ({ ...notes, [key]: event.target.value }))} placeholder="Optional review comments (up to 2,000 characters)" />
                  <div className="flex flex-wrap gap-2"><Button disabled={queueBusyId !== null} onClick={() => void reviewAcademicItem("transfer", Number(item.id), "approved")}>Approve & enable PDF</Button><Button variant="outline" disabled={queueBusyId !== null} onClick={() => void reviewAcademicItem("transfer", Number(item.id), "rejected")}>Reject</Button></div>
                </article>;
              })}
            </CardContent>
          </Card>}
          {reportQueue.length > 0 && <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle>Performance report review <Badge className="ml-2">{reportQueue.length}</Badge></CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {reportQueue.map((item: any) => {
                const key = "report-" + item.id;
                const subjectRows = item.draft_content?.subjectPerformance || item.draft_content?.factualRecords?.marksSummary?.subjectPerformance || [];
                return <article key={item.id} className="rounded-xl border p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold text-slate-900">{item.learner_name || "Learner #" + item.learner_id} · {item.term_label}</h3><p className="text-xs text-slate-500">Report #{item.id} · {item.report_type === "attendance_register" ? "Attendance register" : "Term performance"} · {item.learner_grade || "Grade not recorded"}</p></div><Badge>Pending review</Badge></div>
                  {subjectRows.length > 0 && <div className="grid gap-2 sm:grid-cols-2">{subjectRows.map((row: any) => <div key={row.subject} className="rounded-lg bg-slate-50 p-3"><p className="text-sm font-semibold text-slate-800">{row.subject}</p><p className="text-sm text-slate-600">{row.percentage}% · {row.earnedMarks}/{row.possibleMarks} marks · {row.markedRecords} records</p></div>)}</div>}
                  <details><summary className="cursor-pointer text-sm font-medium text-indigo-700">Preview report source and content</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-xs">{JSON.stringify(item.draft_content, null, 2)}</pre></details>
                  <Textarea aria-label={"Review comments for report " + item.id} maxLength={2000} value={reviewNotes[key] || ""} onChange={event => setReviewNotes(notes => ({ ...notes, [key]: event.target.value }))} placeholder="Comments required by your review process (up to 2,000 characters)" />
                  <div className="flex flex-wrap gap-2"><Button disabled={queueBusyId !== null} onClick={() => void reviewAcademicItem("report", Number(item.id), "approved")}>Approve report</Button><Button variant="outline" disabled={queueBusyId !== null} onClick={() => void reviewAcademicItem("report", Number(item.id), "rejected")}>Reject</Button></div>
                </article>;
              })}
            </CardContent>
          </Card>}
        </section>}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Open Alerts */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-red-500" /> Open Alerts
                {data?.openAlerts?.length > 0 && <Badge className="bg-red-500 text-white text-xs ml-auto">{data.openAlerts.length}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!data?.openAlerts?.length ? (
                <p className="text-slate-400 text-sm text-center py-4">No open alerts</p>
              ) : (
                <div className="space-y-2">
                  {data.openAlerts.slice(0, 4).map((a: any) => (
                    <div key={a.id} className="flex items-start gap-2 p-2 bg-red-50 rounded-lg">
                      <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-medium text-slate-800">{a.title}</p>
                        <p className="text-xs text-slate-500">{a.reporterName} · {a.severity}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Teachers */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Star className="h-4 w-4 text-amber-500" /> Top Performing Teachers
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!data?.topTeachers?.length ? (
                <p className="text-slate-400 text-sm text-center py-4">No teachers yet</p>
              ) : (
                <div className="space-y-2">
                  {data.topTeachers.map((t: any, i: number) => (
                    <div key={t.id} className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg">
                      <span className="text-xs font-bold text-slate-400 w-5">#{i + 1}</span>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-slate-800">{t.name}</p>
                        <p className="text-xs text-slate-400">{t.subject ?? "General"}</p>
                      </div>
                      <span className="text-xs font-bold text-amber-600">{t.performanceScore ?? 0} pts</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

<ActivityMonitor />
        {/* Quick Nav */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: "Monitor Teachers", href: "/manager/teachers", icon: GraduationCap, color: "bg-emerald-600" },
            { label: "Monitor Students", href: "/manager/students", icon: Users, color: "bg-blue-600" },
            { label: "View Reports", href: "/manager/reports", icon: BarChart3, color: "bg-purple-600" },
            { label: "Manage Prefects", href: "/manager/prefects", icon: Shield, color: "bg-amber-600" },
          ].map(item => (
            <Link key={item.href} href={item.href}>
              <div className={`${item.color} text-white rounded-xl p-4 flex items-center gap-3 hover:opacity-90 transition-opacity cursor-pointer`}>
                <item.icon className="h-5 w-5" />
                <span className="text-sm font-semibold">{item.label}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
