import { useEffect, useState } from "react";
import { getApiUrl } from "@workspace/api-client-react";
import { Link } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, ClipboardCheck, ArrowLeft } from "lucide-react";
const token=()=>localStorage.getItem("dallyletter_token")??"";
export default function ManagerReviewQueue(){
  const [data,setData]=useState<any>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState("");
  const load=async()=>{setLoading(true);setError("");try{const r=await fetch(getApiUrl("/api/manager/dashboard"),{headers:{Authorization:"Bearer "+token()}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Could not load review queue.");setData(d);}catch(e){setError(e instanceof Error?e.message:"Could not load review queue.");}finally{setLoading(false);}};
  useEffect(()=>{void load();},[]);
  const rows=Array.isArray(data?.reviewQueue)?data.reviewQueue:[];
  return <DashboardLayout><div className="mx-auto max-w-6xl space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold"><ClipboardCheck className="h-6 w-6"/>Manager Review Queue</h1><p className="mt-1 text-sm text-muted-foreground">All currently open alerts, transfer requests, report reviews, and other verification items available to your role.</p></div><Button variant="outline" onClick={()=>void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading?"animate-spin":""}`}/>Refresh</Button></div>
    {error&&<div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[{label:"All items",value:rows.length},{label:"Transfer approvals",value:data?.reviewCounts?.transferRequests??0},{label:"Report reviews",value:data?.reviewCounts?.performanceReports??0},{label:"Award recommendations",value:data?.reviewCounts?.awardRecommendations??0},{label:"Open alerts",value:data?.reviewCounts?.alerts??0}, {label:"Content moderation",value:data?.reviewCounts?.contentFlags??0}, {label:"Teacher applications",value:data?.reviewCounts?.teacherApplications??0}].map(x=><Card key={x.label}><CardContent className="p-4"><p className="text-2xl font-bold">{x.value}</p><p className="text-xs text-muted-foreground">{x.label}</p></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle>Items requiring attention</CardTitle></CardHeader><CardContent className="space-y-3">
      {loading?<p className="py-8 text-center text-muted-foreground">Loading queue…</p>:rows.length===0?<p className="py-8 text-center text-muted-foreground">No open alerts or pending reviews.</p>:rows.map((row:any)=><div key={row.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{row.title}</p><Badge variant={row.type==="alert"?"destructive":"secondary"}>{String(row.type||"review").replaceAll("_"," ")}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{row.learnerName||"Platform"} · {row.description||"No additional description"}</p><p className="mt-1 text-xs text-muted-foreground">Created {row.createdAt?new Date(row.createdAt).toLocaleString():"date not recorded"} · Status: {row.status}</p></div><Link href={row.href||"/manager/notifications"}><Button>Open review</Button></Link></div>)}
    </CardContent></Card><Link href="/manager" className="inline-flex items-center gap-2 text-sm underline"><ArrowLeft className="h-4 w-4"/>Return to manager dashboard</Link>
  </div></DashboardLayout>;
}
