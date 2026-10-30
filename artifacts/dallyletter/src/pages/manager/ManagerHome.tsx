import { getApiUrl } from "@workspace/api-client-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  const [pendingTransfers, setPendingTransfers] = useState(0);
  const [transferError, setTransferError] = useState("");

  useEffect(() => {
    fetch(getApiUrl("/api/manager/dashboard"), { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
    fetch(getApiUrl("/api/academic-records/transfer-requests"), { headers: { Authorization: `Bearer ${token()}` } })
      .then(async r => { const d = await r.json().catch(() => []); if (!r.ok) throw new Error(d.error || "Could not load transfer approvals"); return d; })
      .then(d => { setPendingTransfers(Array.isArray(d) ? d.filter((item: any) => item.status === "pending").length : 0); setTransferError(""); })
      .catch(e => setTransferError(e instanceof Error ? e.message : "Transfer approval count unavailable"));
  }, []);

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

        <div className="grid md:grid-cols-2 gap-6">
          {/* Open Alerts */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-red-500" /> Manager Action Queue
                <Badge className="ml-auto bg-red-500 text-white text-xs">{data?.reviewQueue?.length ?? 0} pending</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!data?.reviewQueue?.length ? <p className="text-slate-400 text-sm text-center py-4">No pending approvals or open alerts.</p> : (
                <div className="max-h-96 space-y-2 overflow-y-auto">
                  {data.reviewQueue.map((item:any) => (
                    <div key={item.id} className="flex items-start gap-2 rounded-lg bg-slate-50 p-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-800">{item.title}</p>
                        <p className="text-xs text-slate-500">{item.learnerName || "Platform"} · {String(item.type || "review").replaceAll("_"," ")}</p>
                        {item.description && <p className="mt-1 line-clamp-2 text-xs text-slate-600">{item.description}</p>}
                      </div>
                      {item.href && <Link href={item.href}><Button size="sm" variant="outline">Review</Button></Link>}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2 border-t pt-3">
                <Link href="/manager/transfer-requests"><Button size="sm" variant="outline">Transfer approvals ({data?.reviewCounts?.transferRequests ?? pendingTransfers})</Button></Link>
                <Link href="/manager/reports/review"><Button size="sm" variant="outline">Report review ({data?.reviewCounts?.performanceReports ?? 0})</Button></Link>
                <Link href="/manager/notifications"><Button size="sm" variant="outline">All alerts</Button></Link>
                {transferError && <span className="self-center text-xs text-amber-700">{transferError}</span>}
              </div>
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
                        <p className="text-xs text-slate-400">{t.subject ?? "General"} · {t.lessonsCount ?? 0} lessons · {t.exercisesCount ?? 0} exercises · {t.assignmentsCount ?? 0} assignments</p><p className="text-xs text-slate-500">{t.markedCount ?? 0} marked · {t.learnersJoined ?? 0} learners joined · {t.learnerSubmissions ?? 0} submissions</p>
                      </div>
                      <span className="text-xs font-bold text-amber-600">{t.activityScore ?? 0} activity</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

<Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><AlertTriangle className="h-4 w-4 text-amber-600" /> Verification & Approval Queue</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-semibold text-slate-800">Transfer letter requests</p><p className="text-xs text-slate-500">Review learner requests and approve or reject them with an audit trail.</p>{transferError && <p role="alert" className="mt-1 text-xs text-red-600">{transferError}</p>}</div>
            <div className="flex items-center gap-3"><Badge className={pendingTransfers ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-700"}>{pendingTransfers} pending</Badge><Link href="/manager/transfer-requests"><Button size="sm">Review requests</Button></Link></div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Star className="h-4 w-4 text-emerald-600" /> Highest Performing Learners</CardTitle></CardHeader>
          <CardContent>
            {!data?.topLearners?.length ? <p className="py-4 text-center text-sm text-slate-400">No learner activity recorded yet.</p> :
              <div className="space-y-2">{data.topLearners.map((learner:any,index:number)=><div key={learner.id} className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
                <span className="w-6 text-xs font-bold text-slate-400">#{index+1}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-800">{learner.name}</p><p className="text-xs text-slate-500">{learner.grade || "Grade not set"} · {learner.exerciseSubmissions} exercise submissions · {learner.assignmentSubmissions} assignment submissions · {learner.averageMarkPercentage == null ? "marks pending" : learner.averageMarkPercentage + "% average"}</p></div><Badge variant="secondary">{learner.badgeCount} awards</Badge><Link href="/manager/students"><Button size="sm" variant="outline">Monitor</Button></Link>
              </div>)}</div>}
          </CardContent>
        </Card>

        <ActivityMonitor />
        {/* Quick Nav */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: "Monitor Teachers", href: "/manager/teachers", icon: GraduationCap, color: "bg-emerald-600" },
            { label: "Monitor Students", href: "/manager/students", icon: Users, color: "bg-blue-600" },
            { label: "View Reports", href: "/manager/reports", icon: BarChart3, color: "bg-purple-600" },
            { label: "Manage Prefects", href: "/manager/prefects", icon: Shield, color: "bg-amber-600" },
            { label: "Transfer Approvals", href: "/manager/transfer-requests", icon: AlertTriangle, color: "bg-rose-600" },
            { label: "Review Performance Reports", href: "/manager/reports/review", icon: BarChart3, color: "bg-violet-600" },
            { label: "All Review Items", href: "/manager/review-queue", icon: AlertTriangle, color: "bg-red-600" },
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
