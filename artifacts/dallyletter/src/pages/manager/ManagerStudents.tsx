import { getApiUrl } from "@workspace/api-client-react";
import { Link } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Users, Shield, Flame, Star, Search, AlertTriangle, Ban, UserCheck, MessageSquare, Award, UserX, ExternalLink, Loader2, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const token = () => localStorage.getItem("dallyletter_token") ?? "";

export default function ManagerStudents() {
  const [students, setStudents] = useState<any[]>([]);
  const [managerSummary, setManagerSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [monitorUser, setMonitorUser] = useState<any | null>(null);
  const [monitorData, setMonitorData] = useState<any | null>(null);
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [monitorMessage, setMonitorMessage] = useState("");
  const [monitorSending, setMonitorSending] = useState(false);
  const openMonitor = async (student:any) => {
    setMonitorUser(student); setMonitorData(null); setMonitorMessage(""); setMonitorLoading(true);
    try { const r=await fetch(getApiUrl(`/api/manager/users/${student.id}/activity`),{headers:{Authorization:`Bearer ${token()}`}}); const d=await r.json(); if(!r.ok)throw new Error(d.error||"Could not load activity"); setMonitorData(d); } catch(e){toast({variant:"destructive",title:"Monitor failed",description:e instanceof Error?e.message:"Try again."});} finally{setMonitorLoading(false);}
  };
  const previewActivity=(a:any)=>{const routes:Record<string,string>={lesson:a.targetId?`/preview/lesson/${a.targetId}`:"/student/lessons",assignment:a.targetId?`/student/assignments?assignment=${a.targetId}`:"/student/assignments",poll:a.targetId?`/student/polls?poll=${a.targetId}`:"/student/polls",exercise:a.targetId?`/student/exercises/${a.targetId}`:"/student/lessons",attendance:a.targetId?`/student/classes?class=${a.targetId}`:"/student/classes"};const route=routes[a.targetType];if(route)window.open(route,"_blank","noopener,noreferrer");};
  const sendPrivateMessage=async()=>{if(!monitorUser||!monitorMessage.trim())return;setMonitorSending(true);try{const r=await fetch(getApiUrl("/api/messages"),{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token()}`},body:JSON.stringify({content:monitorMessage.trim(),type:"text",groupId:null,recipientId:monitorUser.id})});if(!r.ok)throw new Error((await r.json().catch(()=>null))?.error||"Message failed");toast({title:"Private message sent"});setMonitorMessage("");}catch(e){toast({variant:"destructive",title:"Message failed",description:e instanceof Error?e.message:"Try again."});}finally{setMonitorSending(false);}};
  const toggleSelect=(id:number)=>setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
  const action=async(id:number, actionName:string)=>{setBusy(id);try{const endpoint = actionName === "unblock" ? `/api/manager/users/${id}/unblock` : `/api/manager/users/${id}/action`; const r=await fetch(getApiUrl(endpoint),{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token()}`},body:JSON.stringify(actionName === "unblock" ? {} : {action:actionName})}); const data=await r.json().catch(()=>({})); if(!r.ok)throw new Error(data.error||"Action failed"); toast({title:"Action applied"}); try { const next=await fetch(getApiUrl("/api/manager/students"),{headers:{Authorization:`Bearer ${token()}`}}); if(next.ok){const refreshed=await next.json().catch(()=>null); if(Array.isArray(refreshed)) setStudents(refreshed);} } catch { /* The moderation action already succeeded; keep the success state and allow a later refresh. */ }}catch(e){toast({variant:"destructive",title:"Action failed",description:e instanceof Error?e.message:"Try again."});}finally{setBusy(null);}};

  useEffect(() => {
    fetch(getApiUrl("/api/manager/students"), { headers: { Authorization: "Bearer " + token() } })
      .then(r => r.json()).then(d => { setStudents(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
    fetch(getApiUrl("/api/manager/dashboard"), { headers: { Authorization: "Bearer " + token() } })
      .then(r => r.json()).then(d => { if (d && typeof d === "object") setManagerSummary(d); }).catch(() => undefined);
  }, []);

  const filtered = students.filter(s => s.name?.toLowerCase().includes(search.toLowerCase()) || s.grade?.toLowerCase().includes(search.toLowerCase()));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Users className="h-6 w-6 text-blue-600" /> Monitor Students
            </h1>
            <p className="text-slate-500 mt-1">{students.length} enrolled learner{students.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {selected.length > 0 && <Button size="sm" variant="outline" onClick={async () => {
              const content = window.prompt(`Broadcast to ${selected.length} selected learners:`);
              if (!content?.trim()) return;
              try {
                const response = await fetch(getApiUrl("/api/broadcasts"), { method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token()}` }, body:JSON.stringify({ name:"Learning announcement", content:content.trim(), recipientIds:selected }) });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(data.error || "Broadcast failed");
                toast({ title:"Announcement sent", description:`Delivered to ${data.recipientCount ?? selected.length} learners.` });
                setSelected([]);
              } catch (error) { toast({ variant:"destructive", title:"Broadcast failed", description:error instanceof Error ? error.message : "Try again." }); }
            }}><MessageSquare className="mr-1.5 h-3.5 w-3.5" />Broadcast</Button>}
            <Search className="h-4 w-4 text-slate-400" />
            <Input placeholder="Search students…" value={search} onChange={e => setSearch(e.target.value)} className="w-48 h-9 text-sm" />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-0 shadow-sm"><CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold text-slate-900">Learner-related approvals and reports</h2><Badge variant="secondary">{(managerSummary?.reviewQueue || []).filter((q:any)=>["transfer_request","academic_report"].includes(q.type)).length} pending</Badge></div>
            {(managerSummary?.reviewQueue || []).filter((q:any)=>["transfer_request","academic_report"].includes(q.type)).length===0
              ? <p className="text-sm text-slate-500">No pending learner transfer requests or report reviews.</p>
              : <div className="space-y-2">{(managerSummary?.reviewQueue || []).filter((q:any)=>["transfer_request","academic_report"].includes(q.type)).slice(0,5).map((q:any)=><div key={q.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-3"><div className="min-w-0"><p className="text-sm font-medium">{q.title}</p><p className="text-xs text-slate-500">{q.learnerName} · {q.description}</p></div><Link href={q.href}><Button size="sm" variant="outline">Review</Button></Link></div>)}</div>}
          </CardContent></Card>
          <Card className="border-0 shadow-sm"><CardContent className="p-4">
            <h2 className="mb-3 font-semibold text-slate-900">Highest performing learners</h2>
            {!managerSummary?.topLearners?.length ? <p className="text-sm text-slate-500">No learner activity recorded yet.</p> :
              <div className="space-y-2">{managerSummary.topLearners.map((s:any,index:number)=><div key={s.id} className="flex items-center gap-3 rounded-lg bg-slate-50 p-2"><span className="w-5 text-xs font-bold text-slate-400">#{index+1}</span><div className="min-w-0 flex-1"><p className="text-sm font-medium">{s.name}</p><p className="text-xs text-slate-500">{s.exerciseSubmissions} exercise · {s.assignmentSubmissions} assignment submissions · {s.averageMarkPercentage == null ? "marks pending" : s.averageMarkPercentage + "% average"}</p></div><Badge variant="secondary"><Award className="mr-1 h-3 w-3"/>{s.badgeCount} awards</Badge></div>)}</div>}
          </CardContent></Card>
        </div>

        {loading ? <p className="text-center text-slate-400 py-10">Loading…</p> : (
          <div className="grid gap-3">
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-slate-400"><Users className="h-12 w-12 mx-auto mb-3 opacity-20" /><p>No students found</p></div>
            ) : filtered.map(s => (
              <Card key={s.id} onClick={()=>toggleSelect(s.id)} className={`cursor-pointer border-0 shadow-sm ${selected.includes(s.id)?"ring-2 ring-primary":""} ${s.isSuspended || s.isBlocked ? "border-l-4 border-l-red-400" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Link href={`/profile/${s.id}`} onClick={e=>e.stopPropagation()} aria-label={`Open ${s.name} profile`} className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      {s.name.charAt(0)}
                    </Link>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <Link href={`/profile/${s.id}`} onClick={e=>e.stopPropagation()} className="font-semibold text-slate-800 text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm">{s.name}</Link>
                        {s.isPrefect && <Badge className="bg-amber-100 text-amber-700 text-[10px]"><Shield className="h-2.5 w-2.5 mr-0.5" />Prefect</Badge>}
                        {s.isSuspended && <Badge className="bg-red-100 text-red-700 text-[10px]"><AlertTriangle className="h-2.5 w-2.5 mr-0.5" />Suspended</Badge>}
                        {s.isBlocked && <Badge className="bg-red-100 text-red-700 text-[10px]">Blocked</Badge>}
                        {s.grade && <Badge variant="secondary" className="text-[10px]">{s.grade}</Badge>}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span className="flex items-center gap-0.5"><Flame className="h-3 w-3 text-orange-400" /> {s.streakDays ?? 0}d streak</span>
                        <span className="flex items-center gap-0.5"><Star className="h-3 w-3 text-amber-400" /> {s.performanceScore ?? 0} pts</span>
                        <span>{s.awardsCount ?? s.badgeCount ?? 0} awards</span><Badge variant={s.alertsCount ? "destructive" : "secondary"}>{s.alertsCount ?? 0} alerts</Badge><span>{s.pendingTransferRequests ?? 0} transfer requests</span><span>{s.pendingReportReviews ?? 0} reports to review</span><span>{(s.exerciseSubmissions ?? 0) + (s.assignmentSubmissions ?? 0)} submissions</span>
                        {s.lastActiveDate && <span>Active: {s.lastActiveDate}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 border-t pt-3" onClick={event => event.stopPropagation()}>
                    {s.isBlocked || s.isSuspended ? (
                      <Button size="sm" variant="outline" onClick={() => void action(s.id, "unblock")} disabled={busy === s.id}><UserCheck className="mr-1.5 h-3.5 w-3.5" />Restore access</Button>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => void action(s.id, "warn")} disabled={busy === s.id}><AlertTriangle className="mr-1.5 h-3.5 w-3.5" />Warn</Button>
                        <Button size="sm" variant="outline" onClick={() => void action(s.id, "suspend")} disabled={busy === s.id}><UserX className="mr-1.5 h-3.5 w-3.5" />Suspend</Button>
                        <Button size="sm" variant="outline" onClick={() => void action(s.id, "block")} disabled={busy === s.id}><Ban className="mr-1.5 h-3.5 w-3.5" />Block</Button>
                      </>
                    )}
                    {!s.isPrefect && <Button size="sm" variant="outline" onClick={() => void action(s.id, "promote_prefect")} disabled={busy === s.id}><Shield className="mr-1.5 h-3.5 w-3.5" />Make prefect</Button>}
                    <Button size="sm" variant="outline" onClick={() => void openMonitor(s)}><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Monitor</Button><Button size="sm" variant="outline" onClick={() => window.location.assign("/manager/chat")}><MessageSquare className="mr-1.5 h-3.5 w-3.5" />Open Connect</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={Boolean(monitorUser)} onOpenChange={open=>{if(!open)setMonitorUser(null)}}><DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Monitor {monitorUser?.name}</DialogTitle></DialogHeader>{monitorLoading?<div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin"/></div>:monitorData&&<div className="space-y-4"><div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{Object.entries(monitorData.counts??{}).map(([k,v])=><div key={k} className="rounded-lg border p-3 text-center"><p className="font-bold">{String(v)}</p><p className="text-xs text-muted-foreground capitalize">{k}</p></div>)}<div className="rounded-lg border p-3 text-center"><p className="font-bold">#{monitorData.learning?.leaderboardPosition||"—"}</p><p className="text-xs text-muted-foreground">Leaderboard</p></div></div><Card><CardContent className="p-4 space-y-2"><p className="font-semibold">Recent activity</p>{(monitorData.activities??[]).slice(0,60).map((a:any)=><div key={a.id} className="flex items-center gap-2 rounded border p-2"><div className="flex-1 min-w-0"><p className="text-sm">{a.action}</p><p className="text-xs text-muted-foreground">{a.category} · {a.targetType??"activity"}{a.targetId?` #${a.targetId}`:""} · {new Date(a.createdAt).toLocaleString()}</p></div><Button size="sm" variant="outline" onClick={()=>previewActivity(a)}><ExternalLink className="h-3.5 w-3.5"/></Button></div>)}</CardContent></Card><div className="rounded-lg border p-3 space-y-2"><Textarea value={monitorMessage} onChange={e=>setMonitorMessage(e.target.value)} placeholder="Send the learner a private manager message…"/><Button onClick={()=>void sendPrivateMessage()} disabled={monitorSending||!monitorMessage.trim()}><Bell className="mr-2 h-4 w-4"/>Send privately</Button></div></div>}</DialogContent></Dialog>
      </div>
    </DashboardLayout>
  );
}
