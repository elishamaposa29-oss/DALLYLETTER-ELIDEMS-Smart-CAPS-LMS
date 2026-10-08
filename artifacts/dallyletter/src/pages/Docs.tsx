import { BookOpen, ClipboardList, Bell, Users, ShieldCheck, WifiOff, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { getApiUrl } from "@workspace/api-client-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const sections = [
  ["Getting started","Sign in, choose your grade/form, explore Lessons, Exercises, Assignments and Study Groups.",BookOpen],
  ["Lessons & media","Open lesson notes, video, audio, images and documents. If a resource is missing, use Try again or contact your teacher.",BookOpen],
  ["Exercises & assignments","Complete work, submit answers, review marks per question and read teacher corrections when returned.",ClipboardList],
  ["Notifications","Tap a notification to go directly to the activity it describes. Enable device notifications when prompted if you want alerts.",Bell],
  ["Study groups","Join the groups you are allowed to access, read posts, participate in polls and follow educators where available.",Users],
  ["Privacy & safety","Your access depends on your role. Managers receive restricted monitoring views and must not see owner, payment, security or system audit data.",ShieldCheck],
  ["Offline / installed app","Use Add to Home Screen to install DallyLetter. Some previously visited app pages can remain available offline; live data still requires a connection.",WifiOff],
];

export default function Docs() {
 const [docsUrl, setDocsUrl] = useState("/docs");
 useEffect(() => { const token = localStorage.getItem("dallyletter_token"); fetch(getApiUrl("/api/settings"), { headers:{ Authorization:`Bearer ${token}` } }).then(r=>r.ok?r.json():null).then(d=>{ if(d?.docs_url) setDocsUrl(d.docs_url); }).catch(()=>undefined); }, []);
 return <DashboardLayout><div className="mx-auto max-w-4xl space-y-6 p-2 sm:p-4">
   <div className="rounded-3xl bg-[#0a1628] p-7 text-white"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">DALLYLETTER ELIDEMS</p><h1 className="mt-2 text-3xl font-bold">Learner Guide</h1><p className="mt-2 max-w-2xl text-sm text-white/70">A simple, read-only guide to learning, communication, assignments, notifications and installed-app use.</p></div>
   <div className="grid gap-4 sm:grid-cols-2">{sections.map(([title,body,Icon]:any)=><Card key={title as string} className="border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Icon className="h-5 w-5 text-primary"/>{title as string}</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-muted-foreground">{body as string}</p></CardContent></Card>)}</div>
   <p className="text-center text-xs text-muted-foreground">Read-only documentation. Content can be expanded by authorized platform administrators.</p>
 <div className="flex justify-center"><a href={docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-[#0A1931] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"><ExternalLink className="h-4 w-4"/>Open full docs</a></div></div></DashboardLayout>;
}
