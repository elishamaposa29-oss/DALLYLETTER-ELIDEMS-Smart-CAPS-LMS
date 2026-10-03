import { getApiUrl } from "@workspace/api-client-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Users, Shield, Flame, Star, Search, AlertTriangle, Ban, UserCheck, MessageSquare, Award, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const token = () => localStorage.getItem("dallyletter_token") ?? "";

export default function ManagerStudents() {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const toggleSelect=(id:number)=>setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
  const action=async(id:number, actionName:string)=>{setBusy(id);try{const r=await fetch(getApiUrl(`/api/manager/users/${id}/action`),{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token()}`},body:JSON.stringify({action:actionName})});if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||"Action failed");toast({title:"Action applied"});const next=await fetch(getApiUrl("/api/manager/students"),{headers:{Authorization:`Bearer ${token()}`}});setStudents(await next.json());}catch(e){toast({variant:"destructive",title:"Action failed",description:e instanceof Error?e.message:"Try again."});}finally{setBusy(null);}};

  useEffect(() => {
    fetch(getApiUrl("/api/manager/students"), { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json()).then(d => { setStudents(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
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
            <Search className="h-4 w-4 text-slate-400" />
            <Input placeholder="Search students…" value={search} onChange={e => setSearch(e.target.value)} className="w-48 h-9 text-sm" />
          </div>
        </div>

        {loading ? <p className="text-center text-slate-400 py-10">Loading…</p> : (
          <div className="grid gap-3">
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-slate-400"><Users className="h-12 w-12 mx-auto mb-3 opacity-20" /><p>No students found</p></div>
            ) : filtered.map(s => (
              <Card key={s.id} onClick={()=>toggleSelect(s.id)} className={`cursor-pointer border-0 shadow-sm ${selected.includes(s.id)?"ring-2 ring-primary":""} ${s.isSuspended || s.isBlocked ? "border-l-4 border-l-red-400" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold shrink-0">
                      {s.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <p className="font-semibold text-slate-800 text-sm">{s.name}</p>
                        {s.isPrefect && <Badge className="bg-amber-100 text-amber-700 text-[10px]"><Shield className="h-2.5 w-2.5 mr-0.5" />Prefect</Badge>}
                        {s.isSuspended && <Badge className="bg-red-100 text-red-700 text-[10px]"><AlertTriangle className="h-2.5 w-2.5 mr-0.5" />Suspended</Badge>}
                        {s.isBlocked && <Badge className="bg-red-100 text-red-700 text-[10px]">Blocked</Badge>}
                        {s.grade && <Badge variant="secondary" className="text-[10px]">{s.grade}</Badge>}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span className="flex items-center gap-0.5"><Flame className="h-3 w-3 text-orange-400" /> {s.streakDays ?? 0}d streak</span>
                        <span className="flex items-center gap-0.5"><Star className="h-3 w-3 text-amber-400" /> {s.performanceScore ?? 0} pts</span>
                        <span>{s.badgeCount ?? 0} badges</span>
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
                    <Button size="sm" variant="outline" onClick={() => window.location.assign("/student/chat")}><MessageSquare className="mr-1.5 h-3.5 w-3.5" />Open Connect</Button>
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
