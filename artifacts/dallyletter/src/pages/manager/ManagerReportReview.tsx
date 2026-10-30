import { useCallback, useEffect, useState } from "react";
import { getApiUrl } from "@workspace/api-client-react";
import { Link } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FileCheck2, RefreshCw, CheckCircle2, XCircle, FileDown } from "lucide-react";

type Draft = { id:number; learner_id:number; learner_name?:string; report_type:string; term_label:string; draft_content:any; status:string; review_note?:string|null; created_at:string; reviewed_at?:string|null };
const token = () => localStorage.getItem("dallyletter_token") ?? "";

export default function ManagerReportReview() {
  const [rows,setRows] = useState<Draft[]>([]);
  const [notes,setNotes] = useState<Record<number,string>>({});
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState<number|null>(null);
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");
  const load = useCallback(async()=>{
    setLoading(true);setError("");
    try {
      const r=await fetch(getApiUrl("/api/academic-records/reports/drafts"),{headers:{Authorization:"Bearer "+token()}});
      const d=await r.json().catch(()=>[]);
      if(!r.ok) throw new Error(d.error||"Could not load academic report drafts.");
      if(!Array.isArray(d)) throw new Error("Invalid report draft response.");
      setRows(d);
    } catch(e){setError(e instanceof Error?e.message:"Could not load reports.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);
  const decide=async(row:Draft,status:"approved"|"rejected")=>{
    const note=(notes[row.id]||"").trim();
    if(status==="rejected"&&note.length<3){setError("Enter a rejection reason of at least 3 characters.");return;}
    if(!window.confirm(`Confirm ${status} for report #${row.id}?`))return;
    setBusy(row.id);setError("");setMessage("");
    try{
      const r=await fetch(getApiUrl(`/api/academic-records/reports/drafts/${row.id}/review`),{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token()},body:JSON.stringify({status,note})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||"Review decision failed.");
      setMessage(`Report #${row.id} ${status}.`);await load();
    }catch(e){setError(e instanceof Error?e.message:"Review failed.");}
    finally{setBusy(null);}
  };
  const download=async(row:Draft)=>{
    setBusy(row.id);setError("");
    try{
      const r=await fetch(getApiUrl(`/api/academic-records/reports/drafts/${row.id}/download`),{headers:{Authorization:"Bearer "+token()}});
      if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||"Download failed.");}
      const blob=await r.blob();const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`dallyletter-report-${row.id}.json`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
    }catch(e){setError(e instanceof Error?e.message:"Download failed.");}
    finally{setBusy(null);}
  };
  const pending=rows.filter(r=>r.status==="pending_review");
  return <DashboardLayout><div className="mx-auto max-w-6xl space-y-5">
    <div className="rounded-2xl bg-gradient-to-r from-violet-700 to-indigo-800 p-6 text-white"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Academic report review</h1><p className="mt-1 text-sm text-violet-100">Review record-based or AI-assisted drafts before learners can access approved reports.</p></div><Button variant="secondary" onClick={()=>void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading?"animate-spin":""}`}/>Refresh</Button></div><div className="mt-4 flex gap-2"><Badge className="bg-amber-400 text-slate-900">{pending.length} awaiting review</Badge><Badge variant="secondary">{rows.filter(r=>r.status==="approved").length} approved</Badge><Badge variant="secondary">{rows.filter(r=>r.status==="rejected").length} rejected</Badge></div></div>
    {error&&<div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    {message&&<div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
    {loading?<p className="py-12 text-center text-muted-foreground">Loading reports…</p>:rows.length===0?<Card><CardContent className="py-12 text-center text-muted-foreground">No academic report drafts have been created.</CardContent></Card>:
    <div className="space-y-4">{rows.map(row=><Card key={row.id}><CardHeader className="pb-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-base"><FileCheck2 className="h-5 w-5"/>Report #{row.id} · {row.learner_name||`Learner #${row.learner_id}`}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{row.report_type.replaceAll("_"," ")} · {row.term_label} · Created {new Date(row.created_at).toLocaleString()}</p></div><Badge variant={row.status==="approved"?"default":row.status==="rejected"?"destructive":"secondary"}>{row.status}</Badge></div></CardHeader><CardContent className="space-y-3">
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-xs">{JSON.stringify(row.draft_content,null,2)}</pre>
      {row.review_note&&<p className="text-sm"><strong>Review note:</strong> {row.review_note}</p>}
      {row.status==="pending_review"?<><label className="block text-sm font-medium" htmlFor={`report-note-${row.id}`}>Review note / rejection reason</label><Textarea id={`report-note-${row.id}`} value={notes[row.id]||""} onChange={e=>setNotes(v=>({...v,[row.id]:e.target.value}))} maxLength={2000} placeholder="Record review feedback; required when rejecting."/><div className="flex flex-wrap gap-2"><Button disabled={busy===row.id} onClick={()=>void decide(row,"approved")}><CheckCircle2 className="mr-2 h-4 w-4"/>Approve report</Button><Button variant="destructive" disabled={busy===row.id} onClick={()=>void decide(row,"rejected")}><XCircle className="mr-2 h-4 w-4"/>Reject report</Button></div></>:row.status==="approved"?<Button variant="outline" disabled={busy===row.id} onClick={()=>void download(row)}><FileDown className="mr-2 h-4 w-4"/>Download approved report</Button>:null}
    </CardContent></Card>)}</div>}
    <p className="text-sm"><Link href="/manager" className="underline">Return to Manager Dashboard</Link></p>
  </div></DashboardLayout>;
}
