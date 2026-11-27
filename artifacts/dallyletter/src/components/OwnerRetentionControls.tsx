import { useCallback, useEffect, useState } from "react";
import { getApiUrl } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Category = "notifications" | "lessons" | "exercises" | "study_groups" | "messages" | "polls" | "media" | "assignments";
type Policy = { enabled: boolean; categories: Category[]; retentionDays: number; intervalHours: number; nextRunAt: string | null; lastRunAt: string | null };
type Preview = { previewId: string; retentionDays: number; cutoff: string; totalEligible: number; counts: Record<string,{eligible:number;description:string}> };
const options: Array<{id:Category;label:string;detail:string}> = [
  {id:"notifications",label:"Notifications",detail:"Read, non-financial notifications only"},
  {id:"lessons",label:"Lessons",detail:"Old text-only notes without exercises or media"},
  {id:"exercises",label:"Exercises",detail:"Unpublished drafts without submissions or media"},
  {id:"study_groups",label:"Study groups",detail:"Empty groups with no messages, polls or community links"},
  {id:"messages",label:"Messages",detail:"Old group text messages without media attachments"},
  {id:"polls",label:"Polls",detail:"Closed polls that are not auto-marked"},
  {id:"media",label:"Media",detail:"Orphaned exercise-media objects with no activity references"},
  {id:"assignments",label:"Assignments",detail:"Draft/cancelled assignments without learner submissions"},
];
const token=()=>localStorage.getItem("dallyletter_token")??"";
const headers=()=>({"Content-Type":"application/json",Authorization:`Bearer ${token()}`});

export function OwnerRetentionControls() {
  const [policy,setPolicy]=useState<Policy>({enabled:false,categories:[],retentionDays:180,intervalHours:24,nextRunAt:null,lastRunAt:null});
  const [preview,setPreview]=useState<Preview|null>(null);
  const [runs,setRuns]=useState<any[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [confirmation,setConfirmation]=useState("");

  const load=useCallback(async()=>{
    try{
      const [p,r]=await Promise.all([
        fetch(getApiUrl("/api/owner/command-center/retention"),{headers:headers()}),
        fetch(getApiUrl("/api/owner/command-center/retention/runs"),{headers:headers()}),
      ]);
      if(!p.ok||!r.ok)throw new Error("Retention controls are unavailable.");
      const [pd,rd]=await Promise.all([p.json(),r.json()]);
      setPolicy(pd.policy);setRuns(rd.runs??[]);
    }catch(e){setError(e instanceof Error?e.message:"Could not load retention controls.");}
  },[]);
  useEffect(()=>{void load();},[load]);

  const request=async(path:string,method:string,body:unknown)=>{
    const response=await fetch(getApiUrl(path),{method,headers:headers(),body:JSON.stringify(body)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Retention request failed.");
    return data;
  };
  const save=async()=>{
    if(policy.enabled && (!preview?.previewId || preview.retentionDays!==policy.retentionDays || Object.keys(preview.counts).length!==policy.categories.length || policy.categories.some(category=>!preview.counts[category]))) { setError("Preview the current category selection and retention age before enabling scheduled cleanup."); return; }
    setBusy(true);setError("");setNotice("");setPreview(null);
    try{const data=await request("/api/owner/command-center/retention","PUT",{...policy,previewId:preview?.previewId});setPolicy(data.policy);setNotice("Retention policy saved. Scheduled cleanup is now configured.");await load();}
    catch(e){setError(e instanceof Error?e.message:"Could not save policy.");}finally{setBusy(false);}
  };
  const runPreview=async()=>{
    setBusy(true);setError("");setNotice("");
    try{setPreview(await request("/api/owner/command-center/retention/preview","POST",{categories:policy.categories,retentionDays:policy.retentionDays}));}
    catch(e){setError(e instanceof Error?e.message:"Could not preview eligible content.");}finally{setBusy(false);}
  };
  const runNow=async()=>{
    if(confirmation!=="DELETE EXPIRED CONTENT")return;
    setBusy(true);setError("");setNotice("");
    try{const result=await request("/api/owner/command-center/retention/run","POST",{confirmation});setNotice("Cleanup "+String(result.status||"finished")+": "+JSON.stringify(result.deleted)+(Object.keys(result.errors||{}).length?" · Errors: "+JSON.stringify(result.errors):""));setConfirmation("");setPreview(null);await load();}
    catch(e){setError(e instanceof Error?e.message:"Cleanup failed.");}finally{setBusy(false);}
  };
  const toggle=(id:Category,checked:boolean)=>{setPreview(null);setPolicy(current=>({...current,categories:checked?[...new Set([...current.categories,id])]:current.categories.filter(x=>x!==id)}));};

  return <Card>
    <CardHeader><CardTitle>Automatic content cleanup</CardTitle><p className="text-sm text-muted-foreground">Owner-controlled, category-by-category retention with preview, audit history and scheduled execution. No cleanup is enabled by default.</p></CardHeader>
    <CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 rounded-lg border p-3 text-sm font-semibold"><input type="checkbox" checked={policy.enabled} onChange={e=>setPolicy(p=>({...p,enabled:e.target.checked}))}/>Enable scheduled cleanup</label>
        <label className="flex flex-col gap-1 text-sm">Delete eligible content older than
          <select className="rounded-md border bg-background p-2" value={policy.retentionDays} onChange={e=>{setPreview(null);setPolicy(p=>({...p,retentionDays:Number(e.target.value)}));}}>{[30,60,90,180,270,365,540,730,1095,1825,3650].map(d=><option key={d} value={d}>{d} days{d===180?" (about 6 months)":""}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1 text-sm">Run schedule
          <select className="rounded-md border bg-background p-2" value={policy.intervalHours} onChange={e=>setPolicy(p=>({...p,intervalHours:Number(e.target.value)}))}>{[6,12,24,48,72,168].map(h=><option key={h} value={h}>{h===24?"Every day":h===168?"Every week":`Every ${h} hours`}</option>)}</select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={()=>{setPreview(null);setPolicy(current=>({...current,categories:options.map(option=>option.id)}));}}>Select all eligible categories</Button>
        <Button type="button" variant="ghost" size="sm" onClick={()=>{setPreview(null);setPolicy(current=>({...current,categories:[]}));}}>Clear selection</Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map(option=><label key={option.id} className="flex items-start gap-3 rounded-lg border p-3"><input type="checkbox" className="mt-1" checked={policy.categories.includes(option.id)} onChange={e=>toggle(option.id,e.target.checked)}/><span><span className="block text-sm font-semibold">{option.label}</span><span className="block text-xs text-muted-foreground">{option.detail}</span></span></label>)}
      </div>
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">Protected: payments and financial ledgers, attendance, learner submissions and marks, auto-marked poll results, approved reports, transfer letters, teacher approvals and audit logs. Only the safe subsets listed for each category are eligible.</div>
      {error&&<p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice&&<p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy||policy.categories.length===0} onClick={()=>void runPreview()}>Preview eligible content</Button><Button disabled={busy} onClick={()=>void save()}>{busy?"Working…":"Save retention policy"}</Button></div>
      {preview&&<div className="space-y-2 rounded-lg border p-3">
        <p className="text-sm font-semibold">Preview — {preview.totalEligible} eligible item(s)</p><p className="text-xs text-muted-foreground">Cutoff: {new Date(preview.cutoff).toLocaleString()}</p>
        {Object.entries(preview.counts).map(([key,value])=><div key={key} className="flex flex-wrap justify-between gap-2 border-t pt-2 text-sm"><span className="capitalize">{key.replaceAll("_"," ")}</span><span className="font-semibold tabular-nums">{value.eligible} eligible</span><p className="w-full text-xs text-muted-foreground">{value.description}</p></div>)}
        <p className="text-xs text-muted-foreground">Preview does not delete anything. Scheduled cleanup requires the policy to be enabled and saved.</p>
        <label className="block text-sm font-medium">Type DELETE EXPIRED CONTENT to run immediately<input className="mt-1 w-full rounded-md border bg-background p-2" value={confirmation} onChange={e=>setConfirmation(e.target.value)} placeholder="DELETE EXPIRED CONTENT"/></label>
        <Button variant="destructive" disabled={busy||!policy.enabled||confirmation!=="DELETE EXPIRED CONTENT"} onClick={()=>void runNow()}>Run cleanup now</Button>
      </div>}
      <div className="space-y-2"><p className="text-sm font-semibold">Schedule and recent runs</p><p className="text-xs text-muted-foreground">Next run: {policy.nextRunAt?new Date(policy.nextRunAt).toLocaleString():"Not scheduled"} · Last run: {policy.lastRunAt?new Date(policy.lastRunAt).toLocaleString():"No runs yet"}</p>
        {runs.slice(0,5).map(run=><div key={run.id} className="flex flex-wrap justify-between gap-2 border-t pt-2 text-xs"><span>Run #{run.id} · {run.trigger_type} · {run.status}</span><span>{new Date(run.started_at).toLocaleString()}</span><span>{JSON.stringify(run.category_counts||{})}</span>{run.error&&<span className="text-red-700">{run.error}</span>}</div>)}
      </div>
    </CardContent>
  </Card>;
}
