import { DashboardLayout } from "@/components/DashboardLayout";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, BookOpen, Video, Star, TrendingUp } from "lucide-react";

const token = () => localStorage.getItem("dallyletter_token") ?? "";

export default function ManagerTeachers() {
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/manager/teachers", { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json()).then(d => { setTeachers(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-emerald-600" /> Monitor Teachers
          </h1>
          <p className="text-slate-500 mt-1">{teachers.length} teacher{teachers.length !== 1 ? "s" : ""} on the platform</p>
        </div>

        {loading ? <p className="text-center text-slate-400 py-10">Loading…</p> : (
          <div className="space-y-3">
            {teachers.length === 0 ? (
              <div className="text-center py-16 text-slate-400"><GraduationCap className="h-12 w-12 mx-auto mb-3 opacity-20" /><p>No teachers found</p></div>
            ) : teachers.sort((a: any, b: any) => (b.performanceScore ?? 0) - (a.performanceScore ?? 0)).map((t, i) => (
              <Card key={t.id} className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white font-bold text-lg shrink-0">
                      {t.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {i < 3 && <Star className="h-3.5 w-3.5 text-amber-500" />}
                        <h3 className="font-semibold text-slate-800">{t.name}</h3>
                        {t.subject && <Badge variant="outline" className="text-xs">{t.subject}</Badge>}
                      </div>
                      <p className="text-xs text-slate-500 mb-2">{t.email}</p>
                      <div className="flex items-center gap-4 text-xs text-slate-400">
                        <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" /> {t.lessonsCount ?? 0} lessons</span>
                        <span className="flex items-center gap-1"><Video className="h-3 w-3" /> {t.classesCount ?? 0} classes</span>
                        <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" /> {t.performanceScore ?? 0} pts</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
