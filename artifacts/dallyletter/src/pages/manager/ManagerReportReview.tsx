import { useCallback, useEffect, useState } from "react";
import { getApiUrl } from "@workspace/api-client-react";
import { Link } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileCheck2, RefreshCw, CheckCircle2, XCircle, FileDown } from "lucide-react";

type Draft = { id:number; learner_id:number; learner_name?:string; report_type:string; term_label:string; period_start?:string|null; period_end?:string|null; draft_content:any; status:string; review_note?:string|null; created_at:string; reviewed_at?:string|null };
const token = () => localStorage.getItem("dallyletter_token") ?? "";

export default function ManagerReportReview() {
  const [rows,setRows] = useState<Draft[]>([]);
  const [notes,setNotes] = useState<Record<number,string>>({});
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState<number|null>(null);
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");
  const [learners,setLearners] = useState<Array<{id:number;name:string;grade?:string|null}>>([]);
  const [learnerId,setLearnerId] = useState("");
  const [reportType,setReportType] = useState<"attendance_register"|"term_performance">("attendance_register");
  const [termLabel,setTermLabel] = useState("");
  const [periodStart,setPeriodStart] = useState("");
  const [periodEnd,setPeriodEnd] = useState("");
  const [creating,setCreating] = useState(false);
  const load = useCallback(async()=>{
    setLoading(true);setError("");
    try {
      const [r,usersResponse]=await Promise.all([
        fetch(getApiUrl("/api/academic-records/reports/drafts"),{headers:{Authorization:"Bearer "+token()}}),
        fetch(getApiUrl("/api/users"),{headers:{Authorization:"Bearer "+token()}}),
      ]);
      const d=await r.json().catch(()=>[]);
      const users=await usersResponse.json().catch(()=>[]);
      if(!r.ok) throw new Error(d.error||"Could not load academic report drafts.");
      if(!Array.isArray(d)) throw new Error("Invalid report draft response.");
      setRows(d);
      setLearners(Array.isArray(users)?users.filter((u:any)=>["student","learner"].includes(String(u.role||"").toLowerCase())&&!u.isBlocked):[]);
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
      const r=await fetch(getApiUrl(`/api/academic-records/reports/drafts/${row.id}/download/pdf`),{headers:{Authorization:"Bearer "+token()}});
      if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||"Download failed.");}
      const blob=await r.blob();const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`dallyletter-report-${row.id}.pdf`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
    }catch(e){setError(e instanceof Error?e.message:"Download failed.");}
    finally{setBusy(null);}
  };
  const createDraft=async()=>{
    if(!learnerId||!termLabel.trim()||!periodStart||!periodEnd){setError("Choose a learner, enter the term label, and set both inclusive period dates.");return;}
    if(periodStart>periodEnd){setError("The period end date must be on or after the start date.");return;}
    setCreating(true);setError("");setMessage("");
    try{
      const r=await fetch(getApiUrl("/api/academic-records/reports/drafts"),{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token()},body:JSON.stringify({learnerId:Number(learnerId),reportType,termLabel:termLabel.trim(),periodStart,periodEnd})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||"Could not create the academic report draft.");
      setMessage(`Draft #${d.id} created for ${periodStart} to ${periodEnd}; it is awaiting manager review.`);
      setTermLabel("");await load();
    }catch(e){setError(e instanceof Error?e.message:"Report creation failed.");}
    finally{setCreating(false);}
  };
  const pending=rows.filter(r=>r.status==="pending_review");
  return <DashboardLayout><div className="mx-auto max-w-6xl space-y-5">
    <div className="rounded-2xl bg-gradient-to-r from-violet-700 to-indigo-800 p-6 text-white"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Academic report review</h1><p className="mt-1 text-sm text-violet-100">Review record-based or AI-assisted drafts before learners can access approved reports.</p></div><Button variant="secondary" onClick={()=>void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading?"animate-spin":""}`}/>Refresh</Button></div><div className="mt-4 flex gap-2"><Badge className="bg-amber-400 text-slate-900">{pending.length} awaiting review</Badge><Badge variant="secondary">{rows.filter(r=>r.status==="approved").length} approved</Badge><Badge variant="secondary">{rows.filter(r=>r.status==="rejected").length} rejected</Badge></div></div>
    <Card><CardHeader><CardTitle>Create a period-scoped academic report</CardTitle><p className="text-sm text-muted-foreground">Both dates are required. Records outside this inclusive range are excluded from the report snapshot and mark totals.</p></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">
      <div className="space-y-1"><label className="text-sm font-medium">Learner</label><Select value={learnerId} onValueChange={setLearnerId}><SelectTrigger><SelectValue placeholder="Select learner"/></SelectTrigger><SelectContent>{learners.map(learner=><SelectItem key={learner.id} value={String(learner.id)}>{learner.name}{learner.grade?\` (\${learner.grade})\`: ""}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><label className="text-sm font-medium">Report type</label><Select value={reportType} onValueChange={v=>setReportType(v as "attendance_register"|"term_performance")}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="attendance_register">Attendance register</SelectItem><SelectItem value="term_performance">Term performance (live AI required)</SelectItem></SelectContent></Select></div>
      <div className="space-y-1"><label className="text-sm font-medium">Term / period label</label><Input value={termLabel} onChange={e=>setTermLabel(e.target.value)} maxLength={80} placeholder="e.g. Term 1 2026"/></div>
      <div className="grid grid-cols-2 gap-2"><div className="space-y-1"><label className="text-sm font-medium">Start date</label><Input type="date" value={periodStart} onChange={e=>setPeriodStart(e.target.value)}/></div><div className="space-y-1"><label className="text-sm font-medium">End date</label><Input type="date" value={periodEnd} onChange={e=>setPeriodEnd(e.target.value)}/></div></div>
      <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Maximum period: 370 days. Drafts are not visible to learners until approved.</p><Button onClick={()=>void createDraft()} disabled={creating||learners.length===0}>{creating?"Creating draft…":"Create report draft"}</Button></div>
    </CardContent></Card>
    {error&&<div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    {message&&<div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
    {loading?<p className="py-12 text-center text-muted-foreground">Loading reports…</p>:rows.length===0?<Card><CardContent className="py-12 text-center text-muted-foreground">No academic report drafts have been created.</CardContent></Card>:
    <div className="space-y-4">{rows.map(row=><Card key={row.id}><CardHeader className="pb-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-base"><FileCheck2 className="h-5 w-5"/>Report #{row.id} · {row.learner_name||`Learner #${row.learner_id}`}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{row.report_type.replaceAll("_"," ")} · {row.term_label} · {row.period_start?new Date(row.period_start).toLocaleDateString():"period missing"} – {row.period_end?new Date(row.period_end).toLocaleDateString():"period missing"} · Created {new Date(row.created_at).toLocaleString()}</p></div><Badge variant={row.status==="approved"?"default":row.status==="rejected"?"destructive":"secondary"}>{row.status}</Badge></div></CardHeader><CardContent className="space-y-3">
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-xs">{JSON.stringify(row.draft_content,null,2)}</pre>
      {row.review_note&&<p className="text-sm"><strong>Review note:</strong> {row.review_note}</p>}
      {row.status==="pending_review"?<><label className="block text-sm font-medium" htmlFor={`report-note-${row.id}`}>Review note / rejection reason</label><Textarea id={`report-note-${row.id}`} value={notes[row.id]||""} onChange={e=>setNotes(v=>({...v,[row.id]:e.target.value}))} maxLength={2000} placeholder="Record review feedback; required when rejecting."/><div className="flex flex-wrap gap-2"><Button disabled={busy===row.id} onClick={()=>void decide(row,"approved")}><CheckCircle2 className="mr-2 h-4 w-4"/>Approve report</Button><Button variant="destructive" disabled={busy===row.id} onClick={()=>void decide(row,"rejected")}><XCircle className="mr-2 h-4 w-4"/>Reject report</Button></div></>:row.status==="approved"?<Button variant="outline" disabled={busy===row.id} onClick={()=>void download(row)}><FileDown className="mr-2 h-4 w-4"/>Download approved report</Button>:null}
    </CardContent></Card>)}</div>}
    <p className="text-sm"><Link href="/manager" className="underline">Return to Manager Dashboard</Link></p>
  </div></DashboardLayout>;
}
