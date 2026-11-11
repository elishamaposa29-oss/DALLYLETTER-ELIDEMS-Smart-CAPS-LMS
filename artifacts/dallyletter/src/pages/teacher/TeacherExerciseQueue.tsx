import { useEffect, useState } from "react";
import { Link } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getApiUrl } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { ClipboardCheck, RefreshCw, BookOpen } from "lucide-react";

type Lesson={id:number;title:string;subject?:string;teacherId?:number};
type Exercise={id:number;title:string;status?:string;totalMarks?:number|string};
export default function TeacherExerciseQueue(){
 const {user}=useAuth(); const [lessons,setLessons]=useState<Lesson[]>([]); const [items,setItems]=useState<Array<{lesson:Lesson;exercises:Exercise[]}>>([]);
 const [loading,setLoading]=useState(true); const [error,setError]=useState("");
 const load=async()=>{setLoading(true);setError("");try{
  const token=localStorage.getItem("dallyletter_token")||"";const headers={Authorization:"Bearer "+token};
  const lr=await fetch(getApiUrl("/api/lessons"),{headers,cache:"no-store"});const ld=await lr.json().catch(()=>[]);if(!lr.ok)throw new Error(ld.error||"Lessons could not be loaded");
  const own=(Array.isArray(ld)?ld:[]).filter((l:Lesson)=>String(user?.role||"").toLowerCase()!=="teacher"||Number(l.teacherId)===Number(user?.id));
  setLessons(own);
  const rows=await Promise.all(own.map(async lesson=>{const r=await fetch(getApiUrl(`/api/exercises/lessons/${lesson.id}/exercises`),{headers,cache:"no-store"});const d=await r.json().catch(()=>[]);if(!r.ok)throw new Error(d.error||`Exercises for ${lesson.title} could not be loaded`);return {lesson,exercises:Array.isArray(d)?d:[]};}));
  setItems(rows);
 }catch(e){setError(e instanceof Error?e.message:"Unable to load exercise queue");}finally{setLoading(false);}};
 useEffect(()=>{void load();},[user?.id]);
 const published=items.flatMap(x=>x.exercises.filter(e=>e.status==="published").map(e=>({...e,lesson:x.lesson})));
 return <DashboardLayout><div className="mx-auto max-w-6xl space-y-6">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold uppercase tracking-widest text-[#b38b00]">Teacher workspace</p><h1 className="text-3xl font-bold text-[#0f2a5a]">Exercise marking queue</h1><p className="mt-1 text-sm text-muted-foreground">Find published exercises across your lessons, open learner submissions and return marked work.</p></div><Button variant="outline" onClick={()=>void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading?"animate-spin":""}`}/>Refresh</Button></div>
  <div className="grid gap-3 sm:grid-cols-3"><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Lessons</p><p className="text-2xl font-bold">{lessons.length}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Published exercises</p><p className="text-2xl font-bold">{published.length}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Draft / archived</p><p className="text-2xl font-bold">{items.reduce((n,x)=>n+x.exercises.filter(e=>e.status!=="published").length,0)}</p></CardContent></Card></div>
  {error&&<p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  {loading?<p role="status" className="p-8 text-center text-sm text-muted-foreground">Loading exercises…</p>:items.length===0?<Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No lessons are available for this account yet. Create a lesson first.</CardContent></Card>:items.map(({lesson,exercises})=><Card key={lesson.id}><CardHeader><div className="flex items-start gap-3"><BookOpen className="mt-1 h-5 w-5 text-[#0f2a5a]"/><div><CardTitle>{lesson.title}</CardTitle><CardDescription>{lesson.subject||"General subject"} · Lesson #{lesson.id}</CardDescription></div></div></CardHeader><CardContent className="space-y-2">{exercises.length===0?<p className="text-sm text-muted-foreground">No exercises have been created for this lesson.</p>:exercises.map(ex=><div key={ex.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><p className="font-semibold">{ex.title}</p><p className="text-xs text-muted-foreground">{ex.totalMarks??"—"} marks · Exercise #{ex.id}</p></div><div className="flex items-center gap-2"><Badge variant={ex.status==="published"?"default":"outline"}>{ex.status||"draft"}</Badge>{ex.status==="published"?<Link href={`/teacher/exercises/${ex.id}/mark`}><Button size="sm"><ClipboardCheck className="mr-2 h-4 w-4"/>Open marking</Button></Link>:<span className="text-xs text-muted-foreground">Publish to enable marking</span>}</div></div>)}</CardContent></Card>)}
  <div className="flex flex-wrap gap-2"><Link href="/teacher/lessons"><Button variant="outline">Manage lessons & build exercises</Button></Link><Link href="/record-book"><Button variant="outline">Open RecordBook</Button></Link></div>
 </div></DashboardLayout>;
}
