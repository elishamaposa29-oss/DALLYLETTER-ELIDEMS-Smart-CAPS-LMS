import { DashboardLayout } from "@/components/DashboardLayout";
import { useGetDashboardStats, useListLessons, useListClasses, useListUsers, useGetRecentActivity } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Users, BookOpen, Video, Activity, Plus } from "lucide-react";
import { Link } from "wouter";

export default function TeacherHome() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: lessons, isLoading: lessonsLoading } = useListLessons();
  const { data: classes, isLoading: classesLoading } = useListClasses();
  const { data: activity, isLoading: activityLoading } = useGetRecentActivity();

  const isLoading = statsLoading || lessonsLoading || classesLoading || activityLoading;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-4xl font-bold tracking-tight font-serif text-foreground">Teacher Portal</h1>
            <p className="text-muted-foreground mt-2 text-lg">Manage your classes and student interactions.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/teacher/lessons">
              <Button variant="outline" className="gap-2">
                <BookOpen className="h-4 w-4" /> Add Lesson
              </Button>
            </Link>
            <Link href="/teacher/classes">
              <Button className="gap-2">
                <Video className="h-4 w-4" /> Schedule Class
              </Button>
            </Link>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-6 flex flex-col justify-center items-center text-center space-y-2">
                <div className="p-3 bg-primary/10 rounded-full text-primary mb-2">
                  <Users className="h-6 w-6" />
                </div>
                <p className="text-4xl font-bold font-serif text-foreground">{stats?.totalStudents || 0}</p>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Students</p>
              </CardContent>
            </Card>

            <Card className="bg-secondary/5 border-secondary/20">
              <CardContent className="p-6 flex flex-col justify-center items-center text-center space-y-2">
                <div className="p-3 bg-secondary/10 rounded-full text-secondary mb-2">
                  <BookOpen className="h-6 w-6" />
                </div>
                <p className="text-4xl font-bold font-serif text-foreground">{stats?.totalLessons || 0}</p>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Lessons</p>
              </CardContent>
            </Card>

            <Card className="bg-blue-500/5 border-blue-500/20">
              <CardContent className="p-6 flex flex-col justify-center items-center text-center space-y-2">
                <div className="p-3 bg-blue-500/10 rounded-full text-blue-500 mb-2">
                  <Video className="h-6 w-6" />
                </div>
                <p className="text-4xl font-bold font-serif text-foreground">{stats?.totalClasses || 0}</p>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Live Classes</p>
              </CardContent>
            </Card>

            <Card className="bg-green-500/5 border-green-500/20">
              <CardContent className="p-6 flex flex-col justify-center items-center text-center space-y-2">
                <div className="p-3 bg-green-500/10 rounded-full text-green-500 mb-2">
                  <Activity className="h-6 w-6" />
                </div>
                <p className="text-4xl font-bold font-serif text-foreground">{stats?.activeStudyGroups || 0}</p>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Study Groups</p>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Video className="h-5 w-5 text-primary" />
                Your Upcoming Classes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {classes?.filter(c => c.status === "upcoming" || c.status === "live").slice(0, 5).length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  No upcoming classes. Schedule one to get started.
                </div>
              ) : (
                <div className="space-y-4">
                  {classes?.filter(c => c.status === "upcoming" || c.status === "live").slice(0, 5).map(c => (
                    <div key={c.id} className="flex justify-between items-center p-3 rounded-lg border bg-muted/30">
                      <div>
                        <p className="font-semibold">{c.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(c.scheduledAt || "").toLocaleString()}
                        </p>
                      </div>
                      <Button variant={c.status === "live" ? "default" : "secondary"} size="sm" onClick={() => window.open(c.meetLink, "_blank")}>
                        {c.status === "live" ? "Start" : "Link"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activity?.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  No recent activity found.
                </div>
              ) : (
                <div className="space-y-4">
                  {activity?.slice(0, 5).map(item => (
                    <div key={item.id} className="flex gap-3">
                      <div className="mt-0.5 shrink-0">
                        <div className="w-2 h-2 mt-1.5 rounded-full bg-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{item.actorName}</p>
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(item.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </DashboardLayout>
  );
}
