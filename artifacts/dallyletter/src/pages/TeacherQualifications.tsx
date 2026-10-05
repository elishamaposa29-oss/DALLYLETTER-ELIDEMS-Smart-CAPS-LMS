import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Upload, ShieldCheck, Clock3 } from "lucide-react";

export default function TeacherQualifications() {
 const { user } = useAuth(); const [docs,setDocs]=useState<any[]>([]); const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
 const load=async()=>{if(!user)return;const t=localStorage.getItem("dallyletter_token");const r=await fetch(getApiUrl("/api/users/"+user.id+"/teacher-documents"),{headers:t?{Authorization:"Bearer "+t}:{}});if(r.ok)setDocs(await r.json())};
 useEffect(()=>{void load()},[user?.id]);
 const upload=async(type:string,file:File)=>{setBusy(true);setMessage("");try{const t=localStorage.getItem("dallyletter_token");const body=new FormData();body.append("file",file);body.append("documentType",type);const r=await fetch(getApiUrl("/api/users/me/teacher-documents"),{method:"POST",headers:t?{Authorization:"Bearer "+t}:{},body});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Upload failed");setMessage(type+" uploaded successfully.");await load()}catch(e){setMessage(e instanceof Error?e.message:"Upload failed")}finally{setBusy(false)}};
 return <DashboardLayout><div className="mx-auto max-w-3xl space-y-5 p-4">
  <Card className="overflow-hidden border-0 shadow-lg"><div className="bg-[#0a1628] p-6 text-white"><p className="text-xs font-semibold uppercase tracking-widest text-amber-300">Teacher verification</p><h1 className="mt-2 text-3xl font-bold">Qualifications & proof</h1><p className="mt-2 text-sm text-white/70">Submit your resume, certificates and supporting proof for manager/owner review.</p></div>
  <CardContent className="space-y-5 p-5"><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border p-4"><Clock3 className="h-5 w-5 text-amber-600"/><p className="mt-2 font-semibold">Review window</p><p className="text-sm text-muted-foreground">New teacher accounts have 14 days to receive approval. Approved accounts keep teaching access.</p></div><div className="rounded-xl border p-4"><ShieldCheck className="h-5 w-5 text-emerald-600"/><p className="mt-2 font-semibold">What to provide</p><p className="text-sm text-muted-foreground">Resume/CV, teaching certificate and previous teaching proof where applicable.</p></div></div>
  <div className="grid gap-3 sm:grid-cols-3">{(["resume","certificate","proof"] as const).map(type=><label key={type} className="cursor-pointer rounded-xl border-2 border-dashed p-5 text-center hover:border-primary"><Upload className="mx-auto h-6 w-6 text-primary"/><p className="mt-2 font-semibold capitalize">{type}</p><p className="text-xs text-muted-foreground">PDF, Word, JPG or PNG · 10 MB max</p><input className="sr-only" type="file" accept=".pdf,.doc,.docx,image/jpeg,image/png" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(type,f);e.currentTarget.value=""}}/></label>)}</div>
  {message&&<p className="rounded-lg bg-muted p-3 text-sm">{message}</p>}
  <div><h2 className="mb-3 font-semibold">Submitted documents</h2>{docs.length?<div className="space-y-2">{docs.map(d=><div key={d.id} className="flex items-center gap-3 rounded-lg border p-3"><FileText className="h-5 w-5 text-primary"/><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{d.file_name}</p><p className="text-xs text-muted-foreground">{d.document_type} · {Math.round(Number(d.size_bytes)/1024)} KB</p></div><Badge variant="outline">Submitted</Badge></div>)}</div>:<p className="text-sm text-muted-foreground">No qualification documents submitted yet.</p>}</div>
  </CardContent></Card>
 </div></DashboardLayout>
}
