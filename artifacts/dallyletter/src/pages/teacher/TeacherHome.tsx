import { DashboardLayout } from "@/components/DashboardLayout";
import { useGetDashboardStats, useListClasses, useGetRecentActivity } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, BookOpen, Video, Activity, ExternalLink, Clock, Plus } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

export default function TeacherHome() {
  const { user } = useAuth();
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: classes, isLoading: classesLoading } = useListClasses();
  const { data: activity, isLoading: activityLoading } = useGetRecentActivity();

  const isLoading = statsLoading || classesLoading || activityLoading;
  const upcomingClasses = classes?.filter(c => c.status === "upcoming" || c.status === "live").slice(0, 5) ?? [];

  const statCards = [
    {
      label: "Students",
      value: stats?.totalStudents ?? 0,
      icon: Users,
      gradient: "from-blue-500 to-blue-700",
      bg: "from-blue-50 to-blue-100/50 dark:from-blue-950/40 dark:to-blue-900/20",
      border: "border-blue-200 dark:border-blue-800",
      text: "text-blue-700 dark:text-blue-300",
    },
    {
      label: "Lessons Posted",
      value: stats?.totalLessons ?? 0,
      icon: BookOpen,
      gradient: "from-emerald-500 to-emerald-700",
      bg: "from-emerald-50 to-emerald-100/50 dark:from-emerald-950/40 dark:to-emerald-900/20",
      border: "border-emerald-200 dark:border-emerald-800",
      text: "text-emerald-700 dark:text-emerald-300",
    },
    {
      label: "Classes",
      value: stats?.totalClasses ?? 0,
      icon: Video,
      gradient: "from-violet-500 to-violet-700",
      bg: "from-violet-50 to-violet-100/50 dark:from-violet-950/40 dark:to-violet-900/20",
      border: "border-violet-200 dark:border-violet-800",
      text: "text-violet-700 dark:text-violet-300",
    },
    {
      label: "Study Groups",
      value: stats?.activeStudyGroups ?? 0,
      icon: Activity,
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
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Teacher Portal</h1>
            <p className="text-muted-foreground mt-1">
              Good to see you, <span className="font-semibold text-foreground">{user?.name}</span>. Ready to teach?
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Link href="/teacher/lessons">
              <Button variant="outline" className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400">
                <BookOpen className="h-4 w-4" />
                Add Lesson
              </Button>
            </Link>
            <Link href="/teacher/classes">
              <Button className="gap-2 bg-gradient-to-r from-primary to-primary/80 shadow-lg shadow-primary/25">
                <Plus className="h-4 w-4" />
                Schedule Class
              </Button>
            </Link>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center p-20">
            <div className="text-center space-y-3">
              <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">Loading your portal...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {statCards.map((card) => {
                const Icon = card.icon;
                return (
                  <Card key={card.label} className={`bg-gradient-to-br ${card.bg} ${card.border} overflow-hidden relative`}>
                    <CardContent className="p-5">
                      <div className={`inline-flex p-2 rounded-lg bg-gradient-to-br ${card.gradient} shadow-md mb-3`}>
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <p className={`text-4xl font-bold ${card.text} leading-none`}>{card.value}</p>
                      <p className="text-xs font-semibold text-muted-foreground mt-1.5 uppercase tracking-wider">{card.label}</p>
                    </CardContent>
                    <div className={`absolute -bottom-4 -right-4 h-20 w-20 rounded-full bg-gradient-to-br ${card.gradient} opacity-10`} />
                  </Card>
                );
              })}
            </div>

            {/* Bottom Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Upcoming Classes */}
              <Card>
                <CardHeader className="border-b pb-4 flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <div className="p-1.5 bg-primary/10 rounded-lg">
                      <Video className="h-4 w-4 text-primary" />
                    </div>
                    Upcoming Classes
                  </CardTitle>
                  <Link href="/teacher/classes">
                    <span className="text-xs text-primary hover:underline cursor-pointer font-medium">Manage →</span>
                  </Link>
                </CardHeader>
                <CardContent className="p-0">
                  {!upcomingClasses.length ? (
                    <div className="flex flex-col items-center py-10 gap-3 text-muted-foreground">
                      <Video className="h-10 w-10 opacity-25" />
                      <p className="text-sm">No upcoming classes scheduled.</p>
                      <Link href="/teacher/classes">
                        <Button size="sm" variant="outline" className="gap-1.5">
                          <Plus className="h-3.5 w-3.5" /> Schedule one
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {upcomingClasses.map(c => (
                        <div key={c.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="bg-primary/10 text-primary p-2 rounded-lg shrink-0 text-center min-w-[44px]">
                              <p className="text-xs font-bold uppercase leading-none">
                                {new Date(c.scheduledAt || "").toLocaleDateString("en-ZA", { month: "short" })}
                              </p>
                              <p className="text-lg font-bold leading-none mt-0.5">
                                {new Date(c.scheduledAt || "").getDate()}
                              </p>
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <p className="font-semibold text-sm text-foreground truncate">{c.title}</p>
                                {c.status === "live" && (
                                  <Badge className="bg-red-500 text-white text-[10px] px-1.5 py-0 h-4 animate-pulse shrink-0">LIVE</Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(c.scheduledAt || "").toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant={c.status === "live" ? "default" : "outline"}
                            className={`gap-1.5 shrink-0 ml-2 ${c.status === "live" ? "shadow-md shadow-primary/20" : ""}`}
                            onClick={() => window.open(c.meetLink, "_blank")}
                          >
                            <ExternalLink className="h-3 w-3" />
                            {c.status === "live" ? "Go Live" : "Open"}
                          </Button>
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
                    <div className="p-1.5 bg-violet-100 dark:bg-violet-900/30 rounded-lg">
                      <Activity className="h-4 w-4 text-violet-600" />
                    </div>
                    Recent Activity
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {!activity?.length ? (
                    <div className="py-10 text-center text-muted-foreground">
                      <Activity className="h-8 w-8 mx-auto mb-2 opacity-25" />
                      <p className="text-sm">No recent activity yet.</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {activity.slice(0, 6).map((item, i) => (
                        <div key={item.id} className="flex gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors">
                          <div className="flex flex-col items-center gap-1 shrink-0 pt-1">
                            <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                            {i < 5 && <div className="w-px flex-1 bg-border min-h-[12px]" />}
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
