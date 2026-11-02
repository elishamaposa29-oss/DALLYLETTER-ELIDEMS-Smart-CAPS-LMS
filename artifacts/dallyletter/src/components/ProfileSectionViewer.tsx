import { useEffect, useState } from "react";
import { getApiUrl } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, LockKeyhole } from "lucide-react";

type SectionKey = "qualifications"|"subjects"|"enrollments"|"achievements"|"reports"|"payments"|"transfers"|"teacher_documents"|"groups"|"activity";
type Props = { profileId:number; section:SectionKey; title:string };

function labelFor(item:any,section:SectionKey):string {
  return String(item?.term_label||item?.name||item?.class_title||item?.title||item?.file_name||item?.reason||([item?.month,item?.year].filter(Boolean).join(" "))||section.replace(/_/g," "));
}
function detailFor(item:any):string {
  return [
    item?.subject,
    item?.status,
    item?.progress_percent!=null?Number(item.progress_percent)+"% progress":null,
    item?.amount!=null?String(item.amount):null,
    item?.reviewed_at?"Reviewed "+new Date(item.reviewed_at).toLocaleDateString():null,
    item?.created_at?"Recorded "+new Date(item.created_at).toLocaleDateString():null,
  ].filter(Boolean).join(" · ");
}

export function ProfileSectionViewer({profileId,section,title}:Props) {
  const [data,setData]=useState<any[]|Record<string,any>>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    const load=async()=>{
      try{
        const token=localStorage.getItem("dallyletter_token");
        const response=await fetch(getApiUrl("/api/profile/"+profileId+"/section/"+section),{headers:token?{Authorization:"Bearer "+token}:{},cache:"no-store"});
        const payload=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(payload.error||"This section is unavailable.");
        if(active)setData(payload.data??[]);
      }catch(e){if(active)setError(e instanceof Error?e.message:"This section could not be loaded.");}
      finally{if(active)setLoading(false);}
    };
    setLoading(true);setError("");void load();
    return()=>{active=false;};
  },[profileId,section]);

  const rows=Array.isArray(data)?data:[data];
  return <Card className="border-primary/15 shadow-sm">
    <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary"/>{title}</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      {loading?<p className="text-sm text-muted-foreground">Loading shared records…</p>:error?<p role="alert" className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><LockKeyhole className="h-4 w-4 shrink-0"/>{error}</p>:rows.length===0?<p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">No saved records have been shared in this section.</p>:rows.map((item:any,index:number)=>{
        const report=item?.draft_content&&typeof item.draft_content==="object"?item.draft_content:{};
        return <article key={item?.id??index} className="rounded-xl border p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0"><h4 className="break-words font-semibold">{labelFor(item,section)}</h4>{detailFor(item)&&<p className="mt-1 text-xs text-muted-foreground">{detailFor(item)}</p>}</div>
            {item?.status&&<Badge variant="outline">{String(item.status).replace(/_/g," ")}</Badge>}
          </div>
          {item?.description&&<p className="mt-2 text-sm text-muted-foreground">{item.description}</p>}
          {report?.commentary&&<p className="mt-2 whitespace-pre-wrap text-sm">{String(report.commentary)}</p>}
          {item?.review_note&&<p className="mt-2 text-sm"><strong>Review note:</strong> {item.review_note}</p>}
          {item?.reason&&section==="transfers"&&<p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{item.reason}</p>}
          {item?.subjects&&Array.isArray(item.subjects)&&<p className="mt-2 text-sm">{item.subjects.join(", ")}</p>}
          {item?.lesson_requests!=null&&<p className="mt-1 text-sm">Lesson requests: {item.lesson_requests}</p>}
          {item?.days_present!=null&&<p className="mt-1 text-sm">Recorded presence days: {item.days_present}</p>}
        </article>;
      })}
    </CardContent>
  </Card>;
}
