import { DashboardLayout } from "@/components/DashboardLayout";
import { useGetDashboardStats, useGetPaymentSummary, useGetRecentActivity } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Users, BookOpen, Video, Activity, DollarSign, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function AdminHome() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: paymentSummary, isLoading: paymentsLoading } = useGetPaymentSummary();
  const { data: activity, isLoading: activityLoading } = useGetRecentActivity();

  const isLoading = statsLoading || paymentsLoading || activityLoading;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-4xl font-bold tracking-tight font-serif text-foreground">Admin Overview</h1>
          <p className="text-muted-foreground mt-2 text-lg">Platform statistics, financial overview, and recent activity.</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-6 flex flex-col justify-center items-center text-center space-y-2">
                  <div className="p-3 bg-primary/10 rounded-full text-primary mb-2">
                    <Users className="h-6 w-6" />
                  </div>
                  <p className="text-3xl font-bold font-serif text-foreground">{stats?.totalStudents || 0}</p>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Students</p>
                </CardContent>
              </Card>

              <Card className="bg-secondary/5 border-secondary/20">
                <CardContent className="p-6 flex flex-col justify-center items-center text-center space-y-2">
                  <div className="p-3 bg-secondary/10 rounded-full text-secondary mb-2">
                    <Users className="h-6 w-6" />
                  </div>
                  <p className="text-3xl font-bold font-serif text-foreground">{stats?.totalTeachers || 0}</p>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Teachers</p>
                </CardContent>
              </Card>

              <Card className="bg-blue-500/5 border-blue-500/20">
                <CardContent className="p-6 flex flex-col justify-center items-center text-center space-y-2">
                  <div className="p-3 bg-blue-500/10 rounded-full text-blue-500 mb-2">
                    <BookOpen className="h-6 w-6" />
                  </div>
                  <p className="text-3xl font-bold font-serif text-foreground">{stats?.totalLessons || 0}</p>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Lessons</p>
                </CardContent>
              </Card>

              <Card className="bg-green-500/5 border-green-500/20">
                <CardContent className="p-6 flex flex-col justify-center items-center text-center space-y-2">
                  <div className="p-3 bg-green-500/10 rounded-full text-green-500 mb-2">
                    <Video className="h-6 w-6" />
                  </div>
                  <p className="text-3xl font-bold font-serif text-foreground">{stats?.totalClasses || 0}</p>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Classes</p>
                </CardContent>
              </Card>

              <Card className="bg-amber-500/5 border-amber-500/20">
                <CardContent className="p-6 flex flex-col justify-center items-center text-center space-y-2">
                  <div className="p-3 bg-amber-500/10 rounded-full text-amber-500 mb-2">
                    <DollarSign className="h-6 w-6" />
                  </div>
                  <p className="text-3xl font-bold font-serif text-foreground">${paymentSummary?.totalRevenue.toFixed(2) || "0.00"}</p>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Revenue</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    Overdue Students
                  </CardTitle>
                  <CardDescription>
                    Students with overdue payments ({paymentSummary?.overdueCount || 0})
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {paymentSummary?.overdueStudents?.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      No overdue students.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {paymentSummary?.overdueStudents?.slice(0, 5).map(student => (
                        <div key={student.id} className="flex justify-between items-center p-3 rounded-lg border bg-destructive/5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center text-destructive font-bold text-xs">
                              {student.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-semibold">{student.name}</p>
                              <p className="text-xs text-muted-foreground">{student.email}</p>
                            </div>
                          </div>
                          <Badge variant="destructive">Overdue</Badge>
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
                  <CardDescription>Latest actions across the platform</CardDescription>
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
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
