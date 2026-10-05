import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { getApiUrl } from "@workspace/api-client-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, BookOpen, Video, Headphones, Image as ImageIcon, FileText } from "lucide-react";
import { AuthenticatedMedia } from "@/components/AuthenticatedMedia";

export default function LessonPreview() {
 const [,params]=useRoute("/preview/lesson/:id");
 const [lesson,setLesson]=useState<any>(null); const [error,setError]=useState("");
 useEffect(()=>{const token=localStorage.getItem("dallyletter_token"); if(!params?.id)return; fetch(getApiUrl("/api/lessons/"+params.id),{headers:token?{Authorization:"Bearer "+token}:{}}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Lesson not found");setLesson(d)}).catch(e=>setError(e instanceof Error?e.message:"Lesson not found"));},[params?.id]);
 if(error)return <DashboardLayout><div className="mx-auto max-w-xl p-6"><Card><CardContent className="p-8 text-center"><BookOpen className="mx-auto h-12 w-12 text-muted-foreground"/><h1 className="mt-4 text-xl font-bold">Lesson not found</h1><p className="mt-2 text-sm text-muted-foreground">{error}</p></CardContent></Card></div></DashboardLayout>;
 if(!lesson)return <DashboardLayout><div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin"/></div></DashboardLayout>;
 const mediaType=lesson.type==="audio"?"audio":lesson.type==="video"?"video":lesson.type==="image"?"image":"document";
 return <DashboardLayout><div className="mx-auto max-w-4xl space-y-5 p-2 sm:p-4">
  <Card className="overflow-hidden border-0 shadow-lg"><div className="bg-[#0a1628] p-6 text-white"><div className="flex flex-wrap gap-2"><Badge className="bg-amber-400 text-slate-950">{lesson.subject}</Badge>{lesson.grade&&<Badge variant="outline" className="border-white/30 text-white">{lesson.grade}</Badge>}<Badge variant="outline" className="border-white/30 text-white">Preview only</Badge></div><h1 className="mt-3 text-3xl font-bold">{lesson.title}</h1><p className="mt-1 text-sm text-white/60">Created by {lesson.teacherName}</p></div>
  <CardContent className="space-y-5 p-5">{lesson.description&&<div className="rounded-xl border bg-muted/30 p-4"><p className="text-sm leading-6">{lesson.description}</p></div>}
  {lesson.mediaUrl&&lesson.mediaUrl.startsWith("/api/lessons/media/")&&<AuthenticatedMedia url={lesson.mediaUrl} type={mediaType as any} title={lesson.title}/>}
  {lesson.mediaUrl&&lesson.mediaUrl.startsWith("http")&&lesson.type==="video"&&<iframe className="aspect-video w-full rounded-xl" src={lesson.mediaUrl} title={lesson.title} allowFullScreen/>}
  {lesson.content&&<div className="rounded-xl border p-5"><div className="mb-3 flex items-center gap-2 font-semibold"><FileText className="h-5 w-5 text-primary"/>Lesson content</div><div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{__html:lesson.content}}/></div>}
  </CardContent></Card>
 </div></DashboardLayout>;
}
