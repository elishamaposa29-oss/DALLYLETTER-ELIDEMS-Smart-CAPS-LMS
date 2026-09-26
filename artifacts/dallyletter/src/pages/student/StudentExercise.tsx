import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { getApiUrl } from "@workspace/api-client-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

interface Question { id:number; prompt:string; type:"input"|"poll"|"drawbox"; marksAllocated:string; position:number; config:Record<string,unknown>; }
interface Option { id:number; questionId:number; label:string; value:string; position:number; }
interface Exercise { id:number; title:string; instructions:string|null; totalMarks:string; }

export default function StudentExercise() {
  const [, params] = useRoute("/student/exercises/:id");
  const [, navigate] = useLocation();
  const id = params?.id;
  const [data, setData] = useState<{exercise:Exercise;questions:Question[];options:Option[]} | null>(null);
  const [answers, setAnswers] = useState<Record<number,{textAnswer?:string;selectedValue?:string;drawData?:Record<string,unknown>}>>({});
  const [message,setMessage] = useState("");
  const [busy,setBusy] = useState(false);

  useEffect(()=>{ if(!id)return; const token=localStorage.getItem("dallyletter_token"); fetch(getApiUrl(`/api/exercises/${id}`),{headers:token?{Authorization:`Bearer ${token}`}:undefined}).then(async r=>{if(!r.ok)throw new Error("Exercise unavailable");return r.json()}).then(setData).catch(e=>setMessage(e.message)); },[id]);
  const optionsByQuestion = useMemo(()=>Object.groupBy?.(data?.options??[],o=>String(o.questionId)) ?? (data?.options??[]).reduce<Record<string,Option[]>>((a,o)=>(a[o.questionId]??=[]).push(o),a),[data]);
  const update=(qid:number, patch:Record<string,unknown>)=>setAnswers(a=>({...a,[qid]:{...a[qid],...patch}}));
  const submit=async()=>{ if(!data)return; setBusy(true);setMessage(""); try { const token=localStorage.getItem("dallyletter_token"); const r=await fetch(getApiUrl(`/api/exercises/${data.exercise.id}/submit`),{method:"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({answers:Object.entries(answers).map(([questionId,a])=>({questionId:Number(questionId),...a}))})}); if(!r.ok)throw new Error((await r.json().catch(()=>null))?.error||"Submission failed"); setMessage("Submitted. Your teacher can now mark it."); } catch(e){setMessage(e instanceof Error?e.message:"Submission failed");} finally{setBusy(false);} };
  if(!data)return <DashboardLayout><div className="p-6">{message||"Loading exercise…"}</div></DashboardLayout>;
  return <DashboardLayout><div className="mx-auto max-w-3xl space-y-5 p-4"><Card><CardHeader><CardTitle>{data.exercise.title}</CardTitle>{data.exercise.instructions&&<p className="text-sm text-muted-foreground">{data.exercise.instructions}</p>}<Badge variant="outline">{data.exercise.totalMarks} marks</Badge></CardHeader></Card>
    {data.questions.map((q,i)=><Card key={q.id}><CardHeader><CardTitle className="text-base">Q{i+1}. {q.prompt}</CardTitle><Badge variant="secondary" className="w-fit">{q.marksAllocated} marks · {q.type}</Badge></CardHeader><CardContent>{q.type==="input"&&<Textarea value={answers[q.id]?.textAnswer??""} onChange={e=>update(q.id,{textAnswer:e.target.value})} placeholder="Type your answer…" />}{q.type==="poll"&&<div className="space-y-2">{(optionsByQuestion[String(q.id)]??[]).map(o=><label key={o.id} className="flex cursor-pointer gap-3 rounded-lg border p-3"><input type="radio" name={`q-${q.id}`} checked={answers[q.id]?.selectedValue===o.value} onChange={()=>update(q.id,{selectedValue:o.value})}/><span>{o.label}</span></label>)}</div>}{q.type==="drawbox"&&<Textarea value={answers[q.id]?.textAnswer??""} onChange={e=>update(q.id,{textAnswer:e.target.value,drawData:{mode:"text-drawing-placeholder",content:e.target.value}})} placeholder="Describe or sketch your working here…" className="min-h-40" />} </CardContent></Card>)}
    <div className="flex items-center justify-between gap-3"><span className="text-sm text-muted-foreground">{message}</span><Button onClick={submit} disabled={busy}>{busy?"Submitting…":"Submit Exercise"}</Button></div><Button variant="ghost" onClick={()=>navigate("/student/lessons")}>Back to lessons</Button>
  </div></DashboardLayout>;
}
