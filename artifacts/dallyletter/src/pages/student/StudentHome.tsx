import { DashboardLayout } from "@/components/DashboardLayout";
import { useGetDashboardStats, useListLessons, useListClasses, useListNotifications } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, BookOpen, Video, Bell, Clock, ChevronRight, Shield, Calendar } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function StudentHome() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: lessons, isLoading: lessonsLoading } = useListLessons();
  const { data: classes, isLoading: classesLoading } = useListClasses();
  const { data: notifications, isLoading: notifsLoading } = useListNotifications();

  const [lessonTopic, setLessonTopic] = useState("");
  const [lessonDate, setLessonDate] = useState("");
  const [lessonNotes, setLessonNotes] = useState("");
  const [schedulingLesson, setSchedulingLesson] = useState(false);
  const [lessonDialogOpen, setLessonDialogOpen] = useState(false);

  const handleScheduleLesson = async () => {
    if (!lessonTopic.trim()) {
      toast({ variant: "destructive", title: "Topic required", description: "Please enter a lesson topic." });
      return;
    }
    setSchedulingLesson(true);
    try {
      const token = localStorage.getItem("dallyletter_token");
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: `Lesson Request: ${lessonTopic}`,
          message: `Prefect ${user?.name} has requested a lesson on "${lessonTopic}".${lessonDate ? ` Preferred date: ${lessonDate}.` : ""}${lessonNotes ? ` Notes: ${lessonNotes}` : ""}`,
          type: "class_starting",
          recipientId: null,
        }),
      });
      toast({ title: "Lesson request sent!", description: "Your teachers have been notified of the lesson request." });
      setLessonTopic("");
      setLessonDate("");
      setLessonNotes("");
      setLessonDialogOpen(false);
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not send the lesson request." });
    } finally {
      setSchedulingLesson(false);
    }
  };

  const recentLessons = lessons?.slice(0, 3);
  const upcomingClasses = classes?.filter(c => c.status === "upcoming" || c.status === "live").slice(0, 3);
  const unreadNotifs = notifications?.filter(n => !n.isRead).slice(0, 3);

  const isLoading = statsLoading || lessonsLoading || classesLoading || notifsLoading;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-4xl font-bold tracking-tight font-serif text-foreground">Welcome back</h1>
          <p className="text-muted-foreground mt-2 text-lg">Here's what's happening with your studies today.</p>
        </div>

        {/* Prefect Panel */}
        {user?.isPrefect && (
          <Card className="border-amber-300 dark:border-amber-700 bg-gradient-to-r from-amber-50 to-amber-100 dark:from-amber-950/30 dark:to-amber-900/20">
            <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="bg-amber-500 p-2.5 rounded-xl shadow-sm">
                  <Shield className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-bold text-amber-800 dark:text-amber-400 flex items-center gap-1.5">
                    Prefect Dashboard
                    <Badge className="bg-amber-500 text-white text-[10px] py-0 px-1.5 ml-1">PREFECT</Badge>
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-500">As a prefect, you can request lessons on behalf of your class.</p>
                </div>
              </div>
              <Dialog open={lessonDialogOpen} onOpenChange={setLessonDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-amber-500 hover:bg-amber-600 text-white gap-2 shrink-0 shadow-sm">
                    <Calendar className="h-4 w-4" />
                    Schedule a Lesson
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-amber-500" />
                      Request a Lesson
                    </DialogTitle>
                    <DialogDescription>
                      As a prefect, you can request a lesson topic on behalf of your class. Teachers will be notified.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="space-y-1.5">
                      <Label>Lesson Topic <span className="text-destructive">*</span></Label>
                      <Input
                        placeholder="e.g. Quadratic Equations, Essay Writing..."
                        value={lessonTopic}
                        onChange={e => setLessonTopic(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Preferred Date (optional)</Label>
                      <Input
                        type="date"
                        value={lessonDate}
                        onChange={e => setLessonDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Additional Notes (optional)</Label>
                      <Textarea
                        placeholder="Any specific areas to focus on, or context for the request..."
                        value={lessonNotes}
                        onChange={e => setLessonNotes(e.target.value)}
                        rows={3}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setLessonDialogOpen(false)}>Cancel</Button>
                    <Button
                      onClick={handleScheduleLesson}
                      disabled={schedulingLesson}
                      className="bg-amber-500 hover:bg-amber-600 text-white"
                    >
                      {schedulingLesson ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Send Lesson Request
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Column - Main Content */}
            <div className="lg:col-span-2 space-y-8">
              
              {/* Upcoming Classes */}
              <Card className="border-primary/20 shadow-md">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="space-y-1">
                    <CardTitle className="text-2xl flex items-center gap-2">
                      <Video className="h-6 w-6 text-primary" />
                      Live Classes
                    </CardTitle>
                    <CardDescription>Your upcoming scheduled sessions</CardDescription>
                  </div>
                  <Link href="/student/classes">
                    <Button variant="ghost" size="sm" className="hidden sm:flex">
                      View all <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </Link>
                </CardHeader>
                <CardContent>
                  {upcomingClasses?.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground bg-muted/30 rounded-lg border border-dashed">
                      No upcoming classes scheduled right now.
                    </div>
                  ) : (
                    <div className="space-y-4 mt-4">
                      {upcomingClasses?.map((c) => (
                        <div key={c.id} className="flex flex-col sm:flex-row gap-4 p-4 rounded-xl border bg-card hover:border-primary/50 transition-colors">
                          <div className="bg-primary/10 text-primary p-3 rounded-lg flex flex-col items-center justify-center min-w-[80px] shrink-0">
                            <span className="text-xs font-semibold uppercase">{new Date(c.scheduledAt || "").toLocaleDateString('en-US', { month: 'short' })}</span>
                            <span className="text-2xl font-bold">{new Date(c.scheduledAt || "").getDate()}</span>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">{c.subject}</Badge>
                              {c.status === "live" && (
                                <Badge className="bg-destructive text-destructive-foreground animate-pulse">LIVE NOW</Badge>
                              )}
                            </div>
                            <h4 className="font-semibold text-lg">{c.title}</h4>
                            <div className="flex items-center text-sm text-muted-foreground mt-1 gap-4">
                              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {new Date(c.scheduledAt || "").toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              <span>Teacher: {c.teacherName}</span>
                            </div>
                          </div>
                          <div className="sm:self-center mt-2 sm:mt-0">
                            <Button 
                              variant={c.status === "live" ? "default" : "secondary"} 
                              className="w-full sm:w-auto"
                              onClick={() => window.open(c.meetLink, "_blank")}
                            >
                              Join
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent Lessons */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                    <BookOpen className="h-6 w-6 text-primary" />
                    Recent Materials
                  </h3>
                  <Link href="/student/lessons">
                    <Button variant="ghost" size="sm">
                      View all <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {recentLessons?.length === 0 ? (
                    <div className="col-span-full py-8 text-center text-muted-foreground bg-muted/30 rounded-lg border border-dashed">
                      No lessons posted recently.
                    </div>
                  ) : (
                    recentLessons?.map((lesson) => (
                      <Link key={lesson.id} href={`/student/lessons`}>
                        <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer group">
                          <CardContent className="p-5">
                            <Badge variant="outline" className="mb-3 bg-secondary/10 text-secondary-foreground border-secondary/20">
                              {lesson.subject}
                            </Badge>
                            <h4 className="font-semibold text-base line-clamp-2 mb-2 group-hover:text-primary transition-colors">{lesson.title}</h4>
                            <p className="text-xs text-muted-foreground">Added {new Date(lesson.createdAt).toLocaleDateString()}</p>
                          </CardContent>
                        </Card>
                      </Link>
                    ))
                  )}
                </div>
              </div>

            </div>

            {/* Right Column - Sidebar */}
            <div className="space-y-8">
              {/* Quick Stats */}
              <Card className="bg-primary text-primary-foreground border-none">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg">Your Progress</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-3xl font-bold font-serif">{stats?.totalLessons || 0}</p>
                    <p className="text-xs text-primary-foreground/80 uppercase tracking-wider">Lessons</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-3xl font-bold font-serif">{stats?.activeStudyGroups || 0}</p>
                    <p className="text-xs text-primary-foreground/80 uppercase tracking-wider">Groups</p>
                  </div>
                </CardContent>
              </Card>

              {/* Notifications */}
              <Card>
                <CardHeader className="pb-3 flex flex-row items-center justify-between border-b">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Bell className="h-5 w-5" />
                    Alerts
                  </CardTitle>
                  <Link href="/student/notifications">
                    <span className="text-xs text-primary hover:underline cursor-pointer">View all</span>
                  </Link>
                </CardHeader>
                <CardContent className="p-0">
                  {unreadNotifs?.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">
                      No new notifications.
                    </div>
                  ) : (
                    <div className="divide-y">
                      {unreadNotifs?.map((notif) => (
                        <div key={notif.id} className="p-4 hover:bg-muted/50 transition-colors">
                          <p className="font-medium text-sm text-foreground">{notif.title}</p>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{notif.message}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
