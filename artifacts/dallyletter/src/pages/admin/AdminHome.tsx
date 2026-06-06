import { DashboardLayout } from "@/components/DashboardLayout";
import { useGetDashboardStats, useGetPaymentSummary, useGetRecentActivity } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Users, BookOpen, Video, Activity, DollarSign, AlertTriangle, TrendingUp, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";

export default function AdminHome() {
  const { user } = useAuth();
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: paymentSummary, isLoading: paymentsLoading } = useGetPaymentSummary();
  const { data: activity, isLoading: activityLoading } = useGetRecentActivity();

  const isLoading = statsLoading || paymentsLoading || activityLoading;

  const statCards = [
    {
      label: "Total Students",
      value: stats?.totalStudents ?? 0,
      icon: Users,
      gradient: "from-blue-500 to-blue-700",
      bg: "from-blue-50 to-blue-100/50 dark:from-blue-950/40 dark:to-blue-900/20",
      border: "border-blue-200 dark:border-blue-800",
      text: "text-blue-700 dark:text-blue-300",
    },
    {
      label: "Teachers",
      value: stats?.totalTeachers ?? 0,
      icon: Users,
      gradient: "from-violet-500 to-violet-700",
      bg: "from-violet-50 to-violet-100/50 dark:from-violet-950/40 dark:to-violet-900/20",
      border: "border-violet-200 dark:border-violet-800",
      text: "text-violet-700 dark:text-violet-300",
    },
    {
      label: "Lessons",
      value: stats?.totalLessons ?? 0,
      icon: BookOpen,
      gradient: "from-emerald-500 to-emerald-700",
      bg: "from-emerald-50 to-emerald-100/50 dark:from-emerald-950/40 dark:to-emerald-900/20",
      border: "border-emerald-200 dark:border-emerald-800",
      text: "text-emerald-700 dark:text-emerald-300",
    },
    {
      label: "Live Classes",
      value: stats?.totalClasses ?? 0,
      icon: Video,
      gradient: "from-sky-500 to-sky-700",
      bg: "from-sky-50 to-sky-100/50 dark:from-sky-950/40 dark:to-sky-900/20",
      border: "border-sky-200 dark:border-sky-800",
      text: "text-sky-700 dark:text-sky-300",
    },
    {
      label: "Revenue",
      value: `$${paymentSummary?.totalRevenue?.toFixed(2) ?? "0.00"}`,
      icon: DollarSign,
      gradient: "from-amber-500 to-amber-700",
      bg: "from-amber-50 to-amber-100/50 dark:from-amber-950/40 dark:to-amber-900/20",
      border: "border-amber-200 dark:border-amber-800",
      text: "text-amber-700 dark:text-amber-300",
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Admin Overview
            </h1>
            <p className="text-muted-foreground mt-1">
              Welcome back, <span className="font-semibold text-foreground">{user?.name}</span>. Here's your platform at a glance.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-4 py-2 rounded-full">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Platform Online</span>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center p-20">
            <div className="text-center space-y-3">
              <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">Loading dashboard...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {statCards.map((card) => {
                const Icon = card.icon;
                return (
                  <Card key={card.label} className={`bg-gradient-to-br ${card.bg} ${card.border} overflow-hidden relative`}>
                    <CardContent className="p-5">
                      <div className={`inline-flex p-2 rounded-lg bg-gradient-to-br ${card.gradient} shadow-lg mb-3`}>
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <p className={`text-3xl font-bold ${card.text} leading-none`}>{card.value}</p>
                      <p className="text-xs font-semibold text-muted-foreground mt-1.5 uppercase tracking-wider">{card.label}</p>
                    </CardContent>
                    <div className={`absolute -bottom-4 -right-4 h-20 w-20 rounded-full bg-gradient-to-br ${card.gradient} opacity-10`} />
                  </Card>
                );
              })}
            </div>

            {/* Payment Health Bar */}
            {paymentSummary && (
              <Card className="border-slate-200 dark:border-slate-800">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      Payment Health
                    </CardTitle>
                    <span className="text-sm text-muted-foreground">
                      {paymentSummary.paidCount ?? 0} paid · {paymentSummary.overdueCount ?? 0} overdue
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="h-3 rounded-full bg-muted overflow-hidden">
                    {(() => {
                      const total = (paymentSummary.paidCount ?? 0) + (paymentSummary.overdueCount ?? 0);
                      const pct = total > 0 ? Math.round(((paymentSummary.paidCount ?? 0) / total) * 100) : 0;
                      return (
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      );
                    })()}
                  </div>
                  <div className="flex justify-between mt-2">
                    <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Paid
                    </span>
                    <span className="text-xs text-red-500 font-medium flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Overdue
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Bottom Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Overdue Students */}
              <Card>
                <CardHeader className="border-b pb-4">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <div className="p-1.5 bg-red-100 dark:bg-red-900/30 rounded-lg">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                    </div>
                    Overdue Students
                  </CardTitle>
                  <CardDescription>
                    {paymentSummary?.overdueCount ?? 0} students with outstanding fees
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {!paymentSummary?.overdueStudents?.length ? (
                    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                      <CheckCircle2 className="h-10 w-10 text-emerald-400 opacity-60" />
                      <p className="font-medium text-emerald-600">All payments up to date!</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {paymentSummary.overdueStudents.slice(0, 6).map(student => (
                        <div key={student.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                              {student.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-sm text-foreground">{student.name}</p>
                              <p className="text-xs text-muted-foreground">{student.email}</p>
                            </div>
                          </div>
                          <Badge className="bg-red-100 text-red-700 border border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800">
                            Overdue
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card>
                <CardHeader className="border-b pb-4">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <div className="p-1.5 bg-primary/10 rounded-lg">
                      <Activity className="h-4 w-4 text-primary" />
                    </div>
                    Recent Activity
                  </CardTitle>
                  <CardDescription>Latest actions across the platform</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {!activity?.length ? (
                    <div className="py-10 text-center text-muted-foreground">
                      <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p>No recent activity found.</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {activity.slice(0, 6).map((item, i) => (
                        <div key={item.id} className="flex gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors">
                          <div className="flex flex-col items-center gap-1 shrink-0 pt-1">
                            <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                            {i < 5 && <div className="w-px flex-1 bg-border" />}
                          </div>
                          <div className="flex-1 min-w-0 pb-1">
                            <p className="text-sm font-semibold text-foreground">{item.actorName}</p>
                            <p className="text-sm text-muted-foreground line-clamp-2">{item.description}</p>
                            <p className="text-xs text-muted-foreground/60 mt-1">
                              {new Date(item.createdAt).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
