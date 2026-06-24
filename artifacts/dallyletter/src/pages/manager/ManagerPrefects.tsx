import { DashboardLayout } from "@/components/DashboardLayout";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Star, TrendingUp, Award } from "lucide-react";

const token = () => localStorage.getItem("dallyletter_token") ?? "";

export default function ManagerPrefects() {
  const [prefects, setPrefects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/achievements/prefect-leaderboard", { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json())
      .then(d => { setPrefects(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="bg-amber-500 p-2.5 rounded-xl shadow-sm">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Manage Prefects</h1>
            <p className="text-muted-foreground text-sm">View and monitor prefect performance and standing.</p>
          </div>
        </div>

        {/* Info Banner */}
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
          <CardContent className="p-4 flex items-start gap-3">
            <Shield className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">About Prefects</p>
              <p className="text-xs text-amber-700 dark:text-amber-500 mt-0.5">
                Prefects are trusted student leaders who can request lessons on behalf of their class.
                They are promoted by the platform owner via User Management.
                This view shows current prefect performance rankings.
              </p>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
          </div>
        ) : prefects.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
              <Shield className="h-16 w-16 text-muted-foreground/20" />
              <div className="text-center">
                <p className="font-semibold text-muted-foreground">No prefects assigned yet</p>
                <p className="text-sm text-muted-foreground/70 mt-1">Prefects are assigned by the owner in User Management</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="text-sm text-muted-foreground">{prefects.length} prefect{prefects.length !== 1 ? "s" : ""} active</div>
            <div className="space-y-3">
              {prefects.map((p, i) => (
                <Card key={p.id} className={`border-0 shadow-sm ${i === 0 ? "ring-2 ring-amber-400/40" : ""}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="relative shrink-0">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg
                          ${i === 0 ? "bg-gradient-to-br from-amber-400 to-amber-600" :
                            i === 1 ? "bg-gradient-to-br from-slate-400 to-slate-600" :
                            i === 2 ? "bg-gradient-to-br from-amber-700 to-amber-900" :
                            "bg-gradient-to-br from-primary to-primary/70"}`}>
                          {p.name.charAt(0)}
                        </div>
                        {i < 3 && (
                          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-white text-[10px] font-bold shadow">
                            {i + 1}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-foreground">{p.name}</h3>
                          <Badge className="bg-amber-500/10 text-amber-700 border border-amber-300 text-xs">
                            <Shield className="h-3 w-3 mr-1" />PREFECT
                          </Badge>
                          {p.grade && <Badge variant="outline" className="text-xs">{p.grade}</Badge>}
                          {i === 0 && <Badge className="bg-amber-500 text-white text-xs"><Star className="h-3 w-3 mr-1" />Top Prefect</Badge>}
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <TrendingUp className="h-3 w-3 text-primary" />
                            <strong className="text-foreground">{p.performanceScore ?? 0}</strong> pts
                          </span>
                          <span className="flex items-center gap-1">
                            <Award className="h-3 w-3 text-amber-500" />
                            <strong className="text-foreground">{p.badgeCount ?? 0}</strong> badges
                          </span>
                          <span className="flex items-center gap-1">
                            🔥 <strong className="text-foreground">{p.streakDays ?? 0}</strong> day streak
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-2xl font-bold text-primary">#{i + 1}</p>
                        <p className="text-xs text-muted-foreground">rank</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
