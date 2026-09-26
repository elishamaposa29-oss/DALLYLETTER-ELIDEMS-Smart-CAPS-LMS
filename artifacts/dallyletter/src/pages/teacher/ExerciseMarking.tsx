import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { getApiUrl } from "@workspace/api-client-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface Submission { id:number; learnerId:number; totalScore:string; percentage:string|null; status:string; }
interface Answer { id:number; questionId:number; textAnswer:string|null; selectedValue:string|null; drawData:unknown; awardedMarks:string; correctionNotes:string|null; }
export default function ExerciseMarking(){
 const [,params]=useRoute("/teacher/exercises/:id/mark"); const id=params?.id; const [subs,setSubs]=useState<Submission[]>([]); const [selected,setSelected]=useState<number|null>(null); const [answers,setAnswers]=useState<Answer[]>([]); const [marks,setMarks]=useState<Record<number,string>>({}); const [notes,setNotes]=useState<Record<number,string>>({}); const [message,setMessage]=useState("");
 const token=localStorage.getItem("dallyletter_token"); const headers=token?{Authorization:`Bearer ${token}`}:{};
 useEffect(()=>{if(!id)return;fetch(getApiUrl(`/api/exercises/${id}/submissions`),{headers}).then(r=>r.json()).then(setSubs).catch(()=>setMessage("Could not load submissions."));},[id]);
 const load=async(s:number)=>{setSelected(s);const r=await fetch(getApiUrl(`/api/exercises/${id}/submissions/${s}`),{headers});const d=await r.json();setAnswers(d.answers??[]);setMarks(Object.fromEntries((d.answers??[]).map((a:Answer)=>[a.id,a.awardedMarks])));setNotes(Object.fromEntries((d.answers??[]).map((a:Answer)=>[a.id,a.correctionNotes??""])));};
 const save=async()=>{if(!id||!selected)return;setMessage("");const r=await fetch(getApiUrl(`/api/exercises/${id}/submissions/${selected}/mark`),{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({marks:answers.map(a=>({answerId:a.id,awardedMarks:Number(marks[a.id]??0),correctionNotes:notes[a.id]??""}))})});const d=await r.json();if(!r.ok){setMessage(d.error||"Marking failed");return;}setMessage(`Marked: ${d.submission.totalScore}/${id} • ${d.submission.percentage}%`);setSubs(s=>s.map(x=>x.id===selected?d.submission:x));};
 return <DashboardLayout><div className="mx-auto max-w-4xl space-y-5 p-4"><Card><CardHeader><CardTitle>Exercise submissions</CardTitle></CardHeader><CardContent className="space-y-2">{subs.length?subs.map(s=><Button key={s.id} variant={selected===s.id?"default":"outline"} className="mr-2" onClick={()=>load(s)}>Learner #{s.learnerId} · {s.status} · {s.totalScore}</Button>):<p className="text-sm text-muted-foreground">No learner submissions yet.</p>}</CardContent></Card>{selected&&<Card><CardHeader><CardTitle>Mark submission #{selected}</CardTitle></CardHeader><CardContent className="space-y-4">{answers.map((a,i)=><div key={a.id} className="rounded-lg border p-4 space-y-2"><div className="font-medium">Question {i+1}</div><div className="rounded bg-muted p-3 text-sm whitespace-pre-wrap">{a.textAnswer||a.selectedValue||"No answer"}</div><div className="flex gap-2 items-center"><Input type="number" min="0" step="0.5" value={marks[a.id]??"0"} onChange={e=>setMarks(m=>({...m,[a.id]:e.target.value}))} className="w-28" placeholder="Marks"/><span className="text-sm">✓ / × · 0.5 allowed</span></div><Textarea value={notes[a.id]??""} onChange={e=>setNotes(n=>({...n,[a.id]:e.target.value}))} placeholder="Correction / feedback" /></div>)}<Button onClick={save}>Save marks & return result</Button><span className="ml-3 text-sm text-muted-foreground">{message}</span></CardContent></Card>}</div></DashboardLayout>;
}
