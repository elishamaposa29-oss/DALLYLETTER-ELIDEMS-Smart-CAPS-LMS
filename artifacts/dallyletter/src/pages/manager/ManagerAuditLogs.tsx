import { useEffect,useState } from "react";
import { getApiUrl } from "@workspace/api-client-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw,ClipboardList } from "lucide-react";

type AuditRow={id:number;action:string;category:string;targetType?:string|null;targetId?:number|null;createdAt:string;performerName?:string|null;performerRole?:string|null};
const token=()=>localStorage.getItem("dallyletter_token")??"";
export default function ManagerAuditLogs(){
 const [rows,setRows]=useState<AuditRow[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState("");
 const load=async()=>{setLoading(true);setError("");try{const r=await fetch(getApiUrl("/api/audit-logs?limit=300"),{headers:{Authorization:"Bearer "+token()}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Could not load subordinate audit history.");setRows(Array.isArray(d)?d:[]);}catch(e){setError(e instanceof Error?e.message:"Could not load audit history.");}finally{setLoading(false);}};
 useEffect(()=>{void load();},[]);
 return <DashboardLayout><div className="mx-auto max-w-5xl space-y-5">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold text-[#0f2a5a]"><ClipboardList className="h-6 w-6"/>Subordinate audit history</h1><p className="mt-1 text-sm text-muted-foreground">Academic, attendance, content and moderation events within your authority. Owner, Admin and operational security logs are excluded.</p></div><Button variant="outline" onClick={()=>void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button></div>
  {error&&<div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
  <Card><CardHeader><CardTitle className="text-base">Recent events <Badge variant="secondary" className="ml-2">{rows.length}</Badge></CardTitle></CardHeader><CardContent className="space-y-2">
   {loading?<p className="py-8 text-center text-sm text-muted-foreground">Loading audit history…</p>:rows.length===0?<p className="py-8 text-center text-sm text-muted-foreground">No audit events are available within your current permissions.</p>:rows.map(row=><div key={row.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="font-semibold text-sm">{row.action}</p><p className="mt-1 text-xs text-muted-foreground">{row.performerName||"Unknown user"} · {row.performerRole||"Unknown role"} · {row.targetType||"event"}{row.targetId?" #"+row.targetId:""}</p></div><div className="flex items-center gap-2"><Badge variant="outline">{row.category}</Badge><span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(row.createdAt).toLocaleString()}</span></div></div>)}
  </CardContent></Card>
 </div></DashboardLayout>;
}
