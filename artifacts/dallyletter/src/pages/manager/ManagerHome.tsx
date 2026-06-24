import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Users, BookOpen, Video, AlertTriangle, TrendingUp, GraduationCap, Shield, BarChart3, Star } from "lucide-react";

const token = () => localStorage.getItem("dallyletter_token") ?? "";

export default function ManagerHome() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/manager/dashboard", { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <DashboardLayout>
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
