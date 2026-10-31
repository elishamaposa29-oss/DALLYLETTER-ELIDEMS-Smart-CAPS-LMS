import { getApiUrl } from "@workspace/api-client-react";
import { Link } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, BookOpen, Video, Star, TrendingUp, ExternalLink, MessageSquare, Bell, Loader2 } from "lucide-react";

const token = () => localStorage.getItem("dallyletter_token") ?? "";

export default function ManagerTeachers() {
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeacher, setSelectedTeacher] = useState<any | null>(null);
  const [activity, setActivity] = useState<any | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch(getApiUrl("/api/manager/teachers"), { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json()).then(d => { setTeachers(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const openMonitor = async (teacher: any) => {
    setSelectedTeacher(teacher); setActivity(null); setComment(""); setActivityLoading(true);
    try {
      const r = await fetch(getApiUrl(`/api/manager/users/${teacher.id}/activity`), { headers: { Authorization: `Bearer ${token()}` } });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Could not load activity"); setActivity(d);
    } catch (e) { window.alert(e instanceof Error ? e.message : "Could not load activity"); }
    finally { setActivityLoading(false); }
  };
  const preview = (item: any) => {
    const routes: Record<string,string> = { lesson: item.targetId ? `/preview/lesson/${item.targetId}` : "/teacher/lessons", assignment: item.targetId ? `/student/assignments?assignment=${item.targetId}` : "/student/assignments", poll: item.targetId ? `/student/polls?poll=${item.targetId}` : "/student/polls", exercise: item.targetId ? `/student/exercises/${item.targetId}` : "/student/lessons", class: item.targetId ? `/student/classes?class=${item.targetId}` : "/student/classes" };
    const route = routes[item.targetType]; if (route) window.open(route, "_blank", "noopener,noreferrer");
  };
  const sendComment = async () => {
    if (!selectedTeacher || !comment.trim()) return;
    setSending(true);
    try {
      const r = await fetch(getApiUrl("/api/content-comments"), { method: "POST", headers: { "Content-Type":"application/json", Authorization:`Bearer ${token()}` }, body: JSON.stringify({ contentType:"activity", contentId:selectedTeacher.id, body:comment.trim() }) });
      if (!r.ok) throw new Error((await r.json().catch(()=>null))?.error || "Comment failed");
      setComment(""); window.alert("Comment sent to the teacher.");
    } catch (e) { window.alert(e instanceof Error ? e.message : "Comment failed"); }
    finally { setSending(false); }
  };
  const notifyTeacher = async () => {
    if (!selectedTeacher || !comment.trim()) return;
    setSending(true);
    try {
      const r = await fetch(getApiUrl("/api/messages"), { method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token()}` }, body:JSON.stringify({ content:comment.trim(),type:"text",groupId:null,recipientId:selectedTeacher.id }) });
      if (!r.ok) throw new Error((await r.json().catch(()=>null))?.error || "Private message failed");
      setComment(""); window.alert("Private message sent.");
    } catch(e) { window.alert(e instanceof Error ? e.message : "Private message failed"); }
    finally { setSending(false); }
  };

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
            ) : teachers.sort((a: any, b: any) => (b.activityScore ?? 0) - (a.activityScore ?? 0)).map((t, i) => (
              <Card key={t.id} className="border-0 shadow-sm" onClick={() => void openMonitor(t)}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <Link href={`/profile/${t.id}`} onClick={e=>e.stopPropagation()} aria-label={`Open ${t.name} profile`} className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white font-bold text-lg shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      {t.name.charAt(0)}
                    </Link>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {i < 3 && <Star className="h-3.5 w-3.5 text-amber-500" />}
                        <Link href={`/profile/${t.id}`} onClick={e=>e.stopPropagation()} className="font-semibold text-slate-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm">{t.name}</Link>
                        {t.subject && <Badge variant="outline" className="text-xs">{t.subject}</Badge>}
                        <Badge variant={t.alertsCount ? "destructive" : "secondary"}>{t.alertsCount ?? 0} alerts</Badge>
                      </div>
                      <p className="text-xs text-slate-500 mb-2">{t.email}</p>
                      <Button size="sm" variant="outline" className="mt-3 gap-1" onClick={() => void openMonitor(t)}><ExternalLink className="h-3.5 w-3.5" />Monitor activity</Button>
                      <div className="flex items-center gap-4 text-xs text-slate-400">
                        <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" /> {t.lessonsCount ?? 0} lessons</span>
                        <span className="flex items-center gap-1"><Video className="h-3 w-3" /> {t.classesCount ?? 0} classes</span>
                        <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" /> {t.activityScore ?? 0} activity</span>
                        <span>{t.exercisesCount ?? 0} exercises</span><span>{t.assignmentsCount ?? 0} assignments</span><span>{t.markedCount ?? 0} marked</span><span>{t.learnersJoined ?? 0} learners</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={Boolean(selectedTeacher)} onOpenChange={open => { if (!open) setSelectedTeacher(null); }}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Monitor {selectedTeacher?.name}</DialogTitle></DialogHeader>
            <Card><CardHeader><CardTitle className="text-base">Open teacher alerts ({selectedTeacher?.alertsCount ?? 0})</CardTitle></CardHeader><CardContent className="space-y-2">
              {!selectedTeacher?.alerts?.length ? <p className="text-sm text-muted-foreground">No open alerts are linked to this teacher.</p> : selectedTeacher.alerts.map((alert:any)=><div key={alert.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-semibold">{alert.title}</p><p className="mt-1 text-xs text-slate-600">{alert.description}</p><p className="mt-1 text-xs text-slate-500">{alert.severity} · {new Date(alert.createdAt).toLocaleString()}</p></div>)}
            </CardContent></Card>
            {activityLoading ? <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin" /></div> : activity && <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">{Object.entries(activity.counts ?? {}).map(([k,v]) => <div key={k} className="rounded-lg border p-3 text-center"><p className="text-lg font-bold">{String(v)}</p><p className="text-xs text-muted-foreground capitalize">{k}</p></div>)}</div>
              <Card><CardHeader><CardTitle className="text-base">Recent activity</CardTitle></CardHeader><CardContent className="space-y-2">{(activity.activities ?? []).slice(0,50).map((a:any)=><div key={a.id} className="flex items-center gap-2 rounded-lg border p-2"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{a.action}</p><p className="text-xs text-muted-foreground">{a.category} · {a.targetType ?? "activity"}{a.targetId ? ` #${a.targetId}`:""} · {new Date(a.createdAt).toLocaleString()}</p></div><Button size="sm" variant="outline" onClick={()=>preview(a)}><ExternalLink className="h-3.5 w-3.5" /></Button></div>)}</CardContent></Card>
              <div className="rounded-lg border p-3 space-y-2"><Textarea value={comment} onChange={e=>setComment(e.target.value)} placeholder="Comment or message the teacher…" /><div className="flex flex-wrap gap-2"><Button onClick={()=>void sendComment()} disabled={sending||!comment.trim()}><MessageSquare className="mr-2 h-4 w-4" />Comment</Button><Button variant="outline" onClick={()=>void notifyTeacher()} disabled={sending||!comment.trim()}><Bell className="mr-2 h-4 w-4" />Private message</Button></div></div>
            </div>}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
