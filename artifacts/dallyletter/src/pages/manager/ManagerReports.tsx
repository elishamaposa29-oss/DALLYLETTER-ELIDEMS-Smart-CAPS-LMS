import { DashboardLayout } from "@/components/DashboardLayout";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, GraduationCap, BookOpen, Video, DollarSign, BarChart3 } from "lucide-react";

const token = () => localStorage.getItem("dallyletter_token") ?? "";

export default function ManagerReports() {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/manager/reports/overview", { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json()).then(d => { setReport(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const stats = [
    { label: "Teachers", value: report?.teacherCount ?? 0, icon: GraduationCap, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Students", value: report?.studentCount ?? 0, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Managers", value: report?.managerCount ?? 0, icon: Users, color: "text-purple-600", bg: "bg-purple-50" },
    { label: "Total Lessons", value: report?.lessonCount ?? 0, icon: BookOpen, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "Total Classes", value: report?.classCount ?? 0, icon: Video, color: "text-indigo-600", bg: "bg-indigo-50" },
    { label: "Total Revenue", value: `$${(report?.totalRevenue ?? 0).toFixed(2)}`, icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-purple-600" /> Platform Reports
          </h1>
          <p className="text-slate-500 mt-1">Overview of platform performance and metrics</p>
        </div>

        {loading ? <p className="text-center text-slate-400 py-10">Loading…</p> : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {stats.map(m => (
                <Card key={m.label} className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <div className={`w-10 h-10 rounded-xl ${m.bg} flex items-center justify-center mb-3`}>
                      <m.icon className={`h-5 w-5 ${m.color}`} />
                    </div>
                    <p className="text-2xl font-bold text-slate-900">{m.value}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{m.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Card className="border-0 shadow-sm">
                <CardHeader><CardTitle className="text-sm">Payment Status</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { label: "Paid Payments", value: report?.paidPayments ?? 0, color: "bg-emerald-500", pct: report?.paidPayments / ((report?.paidPayments ?? 0) + (report?.pendingPayments ?? 0)) * 100 || 0 },
                      { label: "Pending Payments", value: report?.pendingPayments ?? 0, color: "bg-amber-500", pct: report?.pendingPayments / ((report?.paidPayments ?? 0) + (report?.pendingPayments ?? 0)) * 100 || 0 },
                    ].map(item => (
                      <div key={item.label}>
                        <div className="flex justify-between text-xs text-slate-600 mb-1">
                          <span>{item.label}</span>
                          <span className="font-semibold">{item.value}</span>
                        </div>
                        <div className="bg-slate-100 rounded-full h-2">
                          <div className={`h-2 ${item.color} rounded-full transition-all`} style={{ width: `${item.pct}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader><CardTitle className="text-sm">Quick Summary</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {[
                      { label: "Avg lessons per teacher", value: report?.teacherCount ? Math.round(report.lessonCount / report.teacherCount) : 0 },
                      { label: "Avg classes per teacher", value: report?.teacherCount ? Math.round(report.classCount / report.teacherCount) : 0 },
                      { label: "Teacher-to-student ratio", value: report?.teacherCount ? `1:${Math.round(report.studentCount / report.teacherCount)}` : "N/A" },
                      { label: "Revenue per student", value: report?.studentCount ? `$${(report.totalRevenue / report.studentCount).toFixed(2)}` : "$0" },
                    ].map(item => (
                      <div key={item.label} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                        <span className="text-sm text-slate-600">{item.label}</span>
                        <span className="text-sm font-bold text-slate-800">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
