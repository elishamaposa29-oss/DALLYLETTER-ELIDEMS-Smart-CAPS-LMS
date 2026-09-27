import { DashboardLayout } from "@/components/DashboardLayout";
import { useGetDashboardStats, useGetPaymentSummary, useGetRecentActivity } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PremiumButton } from "@/components/ui/PremiumButton";
import { StatCard } from "@/components/dashboard/StatCard";
import { Loader2, Users, BookOpen, Video, Activity, DollarSign, AlertTriangle, TrendingUp, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";

export default function AdminHome() {
  const { user } = useAuth();
  const { data: stats, isLoading: statsLoading, isError: statsError, refetch: refetchStats } = useGetDashboardStats();
  const { data: paymentSummary, isLoading: paymentsLoading, isError: paymentsError, refetch: refetchPayments } = useGetPaymentSummary();
  const { data: activity, isLoading: activityLoading, isError: activityError, refetch: refetchActivity } = useGetRecentActivity();

  const isLoading = statsLoading || paymentsLoading || activityLoading;
  const hasError = statsError || paymentsError || activityError;
  const refreshAll = async () => { await Promise.all([refetchStats(), refetchPayments(), refetchActivity()]); };

  const statCards = [
    { label: "Total Students", value: stats?.totalStudents ?? 0, icon: Users },
    { label: "Teachers", value: stats?.totalTeachers ?? 0, icon: Users },
    { label: "Lessons", value: stats?.totalLessons ?? 0, icon: BookOpen },
    { label: "Live Classes", value: stats?.totalClasses ?? 0, icon: Video },
    { label: "Revenue", value: `$${paymentSummary?.totalRevenue?.toFixed(2) ?? "0.00"}`, icon: DollarSign },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8 rounded-[28px] bg-[#0A1931] p-3 text-white sm:p-5 md:p-7">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white md:text-4xl">
              Admin Overview
            </h1>
            <p className="mt-1 text-white/60">
              Welcome back, <span className="font-semibold text-[#FFC72C]">{user?.name}</span>. Here's your platform at a glance.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PremiumButton variant="outline" onClick={refreshAll} disabled={isLoading}>Refresh</PremiumButton>
            <div className={"flex items-center gap-2 px-4 py-2 rounded-full border " + (hasError ? "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800" : "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800")}><div className={"h-2 w-2 rounded-full " + (hasError ? "bg-red-500" : "bg-emerald-500") + " animate-pulse"} /><span className={"text-sm font-medium " + (hasError ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400")}>{hasError ? "Dashboard needs attention" : "Platform Online"}</span></div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center p-20">
            <div className="text-center space-y-3">
              <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
              <p className="text-sm text-white/55">Loading dashboard...</p>
            </div>
          </div>
        ) : (
          <>
            {hasError && <Card className="border-red-200 bg-red-50/70 dark:bg-red-950/20 dark:border-red-800"><CardContent className="p-4 text-sm text-red-800 dark:text-red-300">One or more dashboard services could not be loaded. The displayed numbers may be incomplete. Restore the database/API and press Refresh.</CardContent></Card>}
            {/* Stat Cards */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {statCards.map((card) => <StatCard key={card.label} {...card} />)}
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
                    <span className="text-sm text-white/55">
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
                    <div className="flex flex-col items-center justify-center py-10 text-white/55 gap-2">
                      <CheckCircle2 className="h-10 w-10 text-emerald-400 opacity-60" />
                      <p className="font-medium text-emerald-600">All payments up to date!</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {paymentSummary.overdueStudents.slice(0, 6).map(student => (
                        <div key={student.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-[#FFC72C]/5 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                              {student.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-sm text-white">{student.name}</p>
                              <p className="text-xs text-white/55">{student.email}</p>
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
                    <div className="py-10 text-center text-white/55">
                      <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p>No recent activity found.</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {activity.slice(0, 6).map((item, i) => (
                        <div key={item.id} className="flex gap-4 px-5 py-3.5 hover:bg-[#FFC72C]/5 transition-colors">
                          <div className="flex flex-col items-center gap-1 shrink-0 pt-1">
                            <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                            {i < 5 && <div className="w-px flex-1 bg-border" />}
                          </div>
                          <div className="flex-1 min-w-0 pb-1">
                            <p className="text-sm font-semibold text-white">{item.actorName}</p>
                            <p className="text-sm text-white/55 line-clamp-2">{item.description}</p>
                            <p className="text-xs text-white/55/60 mt-1">
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
