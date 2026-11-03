import { useEffect, useState } from "react";
import { getApiUrl } from "@workspace/api-client-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, RefreshCw, FileCheck2, History, FileText } from "lucide-react";

type Qualification = {
  id: number; user_id: number; teacher_name: string; title: string;
  institution?: string | null; year?: number | null; verification_status: string;
  document_id?: number | null; document_file_name?: string | null; document_mime_type?: string | null;
  created_at: string;
};
type HistoryEntry = { id: number; previous_status: string; new_status: string; review_note?: string | null; reviewer_name?: string; created_at: string };
const token = () => localStorage.getItem("dallyletter_token") ?? "";
const headers = () => ({ Authorization: "Bearer " + token() });

export default function ManagerQualifications() {
  const [rows,setRows]=useState<Qualification[]>([]);
  const [permissions,setPermissions]=useState<Record<string,boolean>>({});
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState<number|null>(null);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [notes,setNotes]=useState<Record<number,string>>({});
  const [history,setHistory]=useState<Record<number,HistoryEntry[]>>({});
  const [historyBusy,setHistoryBusy]=useState<number|null>(null);

  const load=async()=>{
    setLoading(true);setError("");setNotice("");
    try{
      const p=await fetch(getApiUrl("/api/manager-permissions/me"),{headers:headers()});
      const pd=await p.json().catch(()=>({}));
      if(!p.ok)throw new Error(pd.error||"Could not load manager permissions.");
      const effective=pd.isOwner?{"*":true}:(pd.permissions??{});
      setPermissions(effective);
      if(!pd.isOwner&&effective["qualifications.view"]!==true){setRows([]);setError("The Owner has not granted qualification viewing to this account.");return;}
      const r=await fetch(getApiUrl("/api/qualifications/pending"),{headers:headers()});
      const data=await r.json().catch(()=>[]);
      if(!r.ok)throw new Error(data.error||"Could not load pending qualifications.");
      setRows(Array.isArray(data)?data:[]);
    }catch(e){setError(e instanceof Error?e.message:"Could not load qualifications.");}
    finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[]);
  const can=(key:string)=>permissions["*"]===true||permissions[key]===true;

  const openDocument=async(row:Qualification)=>{
    if(!row.document_id){setError("No certificate document has been uploaded for this qualification.");return;}
    try{
      const r=await fetch(getApiUrl("/api/qualifications/"+row.document_id+"/document"),{headers:headers()});
      if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||"Could not open certificate.");}
      const blob=await r.blob();const url=URL.createObjectURL(blob);window.open(url,"_blank","noopener,noreferrer");
      window.setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(e){setError(e instanceof Error?e.message:"Could not open certificate.");}
  };

  const showHistory=async(row:Qualification)=>{
    setHistoryBusy(row.id);setError("");
    try{
      const r=await fetch(getApiUrl("/api/qualifications/"+row.id+"/review-history"),{headers:headers()});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||"Could not load review history.");
      setHistory(current=>({...current,[row.id]:d.history??[]}));
    }catch(e){setError(e instanceof Error?e.message:"Could not load review history.");}
    finally{setHistoryBusy(null);}
  };

  const decide=async(row:Qualification,status:"verified"|"rejected")=>{
    const note=(notes[row.id]??"").trim();
    if(status==="rejected"&&note.length<3){setError("A rejection reason of at least 3 characters is required.");return;}
    setBusy(row.id);setError("");setNotice("");
    try{
      const r=await fetch(getApiUrl("/api/qualifications/"+row.id+"/verify"),{
        method:"PATCH",headers:{...headers(),"Content-Type":"application/json"},
        body:JSON.stringify({status,reviewNote:note}),
      });
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||"Could not save qualification decision.");
      setRows(current=>current.filter(item=>item.id!==row.id));
      setNotice(status==="verified"?"Qualification verified.":"Qualification rejected with an audit record.");
    }catch(e){setError(e instanceof Error?e.message:"Could not save qualification decision.");}
    finally{setBusy(null);}
  };

  return <DashboardLayout><div className="mx-auto max-w-5xl space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-2xl font-bold text-[#0f2a5a]"><FileCheck2 className="h-6 w-6"/>Qualification verification</h1><p className="mt-1 text-sm text-muted-foreground">Review each teacher qualification and its supporting certificate separately.</p></div>
      <Button variant="outline" onClick={()=>void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button>
    </div>
    {error&&<div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    {notice&&<div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
    <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{rows.length} pending</Badge><Badge variant="outline">{can("qualifications.verify")?"Verification enabled":"View only"}</Badge></div>
    {loading?<div className="flex justify-center p-12"><Loader2 className="h-7 w-7 animate-spin"/></div>:rows.length===0?<Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No pending qualifications are available to this account.</CardContent></Card>:rows.map(row=><Card key={row.id}>
      <CardHeader className="pb-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><CardTitle className="text-base">{row.title}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{row.teacher_name} · Account #{row.user_id}</p><p className="text-xs text-muted-foreground">{row.institution||"Institution not supplied"}{row.year?" · "+row.year:""}</p></div><Badge variant="outline">{row.verification_status}</Badge></div></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={()=>void openDocument(row)} disabled={!row.document_id}><FileText className="mr-2 h-4 w-4"/>{row.document_file_name||"Open certificate"}</Button>
          <Button size="sm" variant="ghost" onClick={()=>void showHistory(row)} disabled={historyBusy===row.id}><History className="mr-2 h-4 w-4"/>{historyBusy===row.id?"Loading history":"Review history"}</Button>
        </div>
        {history[row.id]&&<div className="rounded-lg bg-muted/40 p-3 text-xs space-y-2">{history[row.id].length?history[row.id].map(item=><div key={item.id} className="border-b pb-2 last:border-0"><p className="font-semibold">{item.previous_status} → {item.new_status}</p><p className="text-muted-foreground">{item.reviewer_name||"Reviewer"} · {new Date(item.created_at).toLocaleString()}</p>{item.review_note&&<p>{item.review_note}</p>}</div>):<p>No review history recorded.</p>}</div>}
        {can("qualifications.verify")&&<div className="space-y-2 border-t pt-3"><Textarea rows={2} value={notes[row.id]??""} onChange={e=>setNotes(current=>({...current,[row.id]:e.target.value}))} placeholder="Reviewer note (required when rejecting)"/><div className="flex flex-wrap gap-2"><Button size="sm" className="bg-[#0f2a5a]" onClick={()=>void decide(row,"verified")} disabled={busy===row.id||!row.document_id}>{busy===row.id?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:null}Verify qualification</Button><Button size="sm" variant="destructive" onClick={()=>void decide(row,"rejected")} disabled={busy===row.id}>Reject qualification</Button></div></div>}
      </CardContent>
    </Card>)}
  </div></DashboardLayout>;
}
