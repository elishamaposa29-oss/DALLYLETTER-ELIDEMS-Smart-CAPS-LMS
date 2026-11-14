import { DashboardLayout } from "@/components/DashboardLayout";
import RecordBookWorkspace from "@/components/RecordBookWorkspace";
import { useGetDashboardStats, useListClasses, useGetRecentActivity } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, BookOpen, Video, Activity, ExternalLink, Clock, Plus } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InstallAppCard } from "@/components/InstallAppCard";

export default function TeacherHome() {
  const { user } = useAuth();
  const restrictedApplicant = String(user?.role||"").toLowerCase()==="teacher" && ["draft","pending_review","rejected_pending_conversion"].includes(String((user as any)?.teacherApplicationStatus||"").toLowerCase());
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats({ query: { enabled: !restrictedApplicant } } as any);
  const { data: classes, isLoading: classesLoading } = useListClasses({ query: { enabled: !restrictedApplicant } } as any);
  const { data: activity, isLoading: activityLoading } = useGetRecentActivity({ query: { enabled: !restrictedApplicant } } as any);

  const isLoading = statsLoading || classesLoading || activityLoading;
  const upcomingClasses = classes?.filter(c => c.status === "upcoming" || c.status === "live").slice(0, 5) ?? [];
  const [selectedActivity, setSelectedActivity] = useState<any | null>(null);

  if (restrictedApplicant) {
    const rejected = String((user as any)?.teacherApplicationStatus||"").toLowerCase()==="rejected_pending_conversion";
    const deadline = (user as any)?.teacherReviewDeadline ? new Date((user as any).teacherReviewDeadline).toLocaleString() : null;
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-3xl space-y-5">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Teacher Portal</h1>
            <p className="mt-1 text-muted-foreground">Your account is active. Your teacher application status is shown below.</p>
          </div>
          <Card className="border-[#b38b00]/40">
            <CardContent className="space-y-4 p-6">
              <Badge variant="outline" className="w-fit">{rejected ? "Application not approved" : "Application awaiting review"}</Badge>
              <h2 className="text-xl font-semibold">{rejected ? "Teaching access is disabled" : "Complete your Profile Hub application"}</h2>
              <p className="text-sm text-muted-foreground">
                {rejected
                  ? "Your application was not approved. Your account, login email and password remain active during the scheduled conversion period. You can continue to use your Profile Hub and view your CV, certificates and messages."
                  : "You can use every Profile Hub feature, prepare your CV, upload certificates, answer the teaching-readiness survey and communicate with authorized reviewers. Lessons, classes, assignments, polls and other teaching operations unlock only after approval."}
              </p>
              {rejected && deadline && <p className="text-sm font-medium">Scheduled learner conversion: {deadline}</p>}
              <div className="flex flex-wrap gap-2">
                <Link href="/profile-hub"><Button className="bg-[#0f2a5a] hover:bg-[#173a72]">Open Profile Hub</Button></Link>
                <Link href="/teacher/qualifications"><Button variant="outline">CV & certificates</Button></Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const statCards = [
    {
      label: "Students",
      value: stats?.totalStudents ?? 0,
      icon: Users,
      gradient: "from-[#0f2a5a] to-[#164a78]",
      bg: "from-[#0f2a5a]/10 to-[#00d9ef]/[0.08] dark:from-[#0f2a5a]/45 dark:to-[#00d9ef]/10",
      border: "border-[#0f2a5a]/20 dark:border-[#00d9ef]/25",
      text: "text-[#0f2a5a] dark:text-[#65eaff]",
    },
    {
      label: "Lessons Posted",
      value: stats?.totalLessons ?? 0,
      icon: BookOpen,
      gradient: "from-[#087f91] to-[#00b8c9]",
      bg: "from-[#00a6bd]/10 to-[#00d9ef]/[0.08] dark:from-[#087f91]/25 dark:to-[#00b8c9]/10",
      border: "border-[#00a6bd]/20 dark:border-[#00d9ef]/25",
      text: "text-[#087f91] dark:text-[#65eaff]",
    },
    {
      label: "Classes",
      value: stats?.totalClasses ?? 0,
      icon: Video,
      gradient: "from-[#51327f] to-[#8557bb]",
      bg: "from-[#8557bb]/10 to-[#a85cff]/[0.08] dark:from-[#51327f]/35 dark:to-[#8557bb]/10",
      border: "border-[#8557bb]/20 dark:border-[#a85cff]/25",
      text: "text-[#694293] dark:text-[#c6a1ff]",
    },
    {
      label: "Study Groups",
      value: stats?.activeStudyGroups ?? 0,
      icon: Activity,
      gradient: "from-[#8b6b00] to-[#c59a13]",
      bg: "from-[#b38b00]/10 to-[#f2d98c]/[0.12] dark:from-[#8b6b00]/25 dark:to-[#c59a13]/10",
      border: "border-[#b38b00]/25 dark:border-[#f2d98c]/25",
      text: "text-[#856500] dark:text-[#f2d98c]",
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <InstallAppCard />

        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-card via-card to-primary/[0.06] p-5 shadow-sm sm:p-6">
          <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <p className="dallyletter-tech-label mb-1 text-[10px] font-bold text-primary">ELIDEMS · TEACHER COMMAND</p>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Teacher Portal</h1>
            <p className="text-muted-foreground mt-1">
              Good to see you, <span className="font-semibold text-foreground">{user?.name}</span>. Ready to teach?
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Link href="/teacher/lessons">
              <Button variant="outline" className="gap-2 border-primary/25 text-primary hover:bg-primary/5">
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

            <Card className="border-[#b38b00]/40 bg-gradient-to-r from-[#0f2a5a]/[0.04] to-[#b38b00]/[0.06]">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div>
                  <h2 className="font-bold text-[#0f2a5a]">Academic report builder</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Create period-based learner reports using saved attendance, assignment marks and report-enabled exercise results. Reports go to Senior Manager / Owner review.</p>
                </div>
                <Link href="/record-book"><Button className="bg-[#0f2a5a] hover:bg-[#173a72]">Open RecordBook & build report</Button></Link>
              </CardContent>
            </Card>

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
                    <div className="p-1.5 rounded-lg bg-cyan-400/10 dark:bg-cyan-400/15">
                      <Activity className="h-4 w-4 text-cyan-700 dark:text-cyan-300" />
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
                        <button type="button" key={item.id} onClick={() => setSelectedActivity(item)} className="flex w-full gap-4 px-5 py-3.5 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`Open activity: ${item.description}`}>
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
                            <p className="mt-1 text-xs font-medium text-primary">Open activity details</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
      <RecordBookWorkspace />
      <Dialog open={Boolean(selectedActivity)} onOpenChange={(open) => { if (!open) setSelectedActivity(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Activity details</DialogTitle>
            <DialogDescription>Recorded teacher and learning activity</DialogDescription>
          </DialogHeader>
          {selectedActivity && <div className="space-y-3 rounded-xl border p-4">
            <p className="font-semibold">{selectedActivity.actorName}</p>
            <p className="whitespace-pre-wrap text-sm">{selectedActivity.description}</p>
            <p className="text-xs text-muted-foreground">{new Date(selectedActivity.createdAt).toLocaleString()}</p>
            <div className="flex flex-wrap gap-2 border-t pt-3">
              {/lesson|media|resource/i.test(String(selectedActivity.description)) && <Link href="/teacher/lessons"><Button type="button" size="sm" variant="outline"><BookOpen className="mr-1.5 h-4 w-4" />Open lessons</Button></Link>}
              {/assignment|submission|marking/i.test(String(selectedActivity.description)) && <Link href="/teacher/assignments"><Button type="button" size="sm" variant="outline"><Activity className="mr-1.5 h-4 w-4" />Open assignments</Button></Link>}
              {/exercise|drawbox|question/i.test(String(selectedActivity.description)) && <Link href="/teacher/exercises"><Button type="button" size="sm" variant="outline"><Activity className="mr-1.5 h-4 w-4" />Open exercise marking</Button></Link>}
              
              {/poll|quiz/i.test(String(selectedActivity.description)) && <Link href="/teacher/polls"><Button type="button" size="sm" variant="outline"><Activity className="mr-1.5 h-4 w-4" />Open polls</Button></Link>}
              {/group|chat|message/i.test(String(selectedActivity.description)) && <Link href="/student/study-groups"><Button type="button" size="sm" variant="outline"><Users className="mr-1.5 h-4 w-4" />Open study groups</Button></Link>}
            </div>
            <p className="text-xs text-muted-foreground">Actions open the relevant module; changes still require the correct role and permissions.</p>
          </div>}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
