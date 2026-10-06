import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "wouter";
import type { LucideIcon } from "lucide-react";
import { Bell, BookOpen, ClipboardList, CreditCard, FileCheck2, FileText, Headphones, Mail, MessageSquare, PenTool, ShieldCheck, Smartphone, Users, Video, WalletCards } from "lucide-react";

type Feature = { title:string; description:string; href:string; icon:LucideIcon; tone:string; tag:string; roles?:string[] };

const features:Feature[] = [
 {title:"Clickable notifications",description:"Recent alerts route to the exact lesson, assignment, class, poll or activity instead of a dead end.",href:"/student/notifications",icon:Bell,tone:"bg-amber-50 text-amber-700",tag:"Interactive",roles:["student"]},
 {title:"Voice & media",description:"Open the authenticated chat/media experience and test playback without replacing the existing message flow.",href:"/student/chat",icon:Headphones,tone:"bg-indigo-50 text-indigo-700",tag:"Media",roles:["student"]},
 {title:"Lessons & preview",description:"Preview current lessons, video, audio, images and notes before publishing or sharing.",href:"/teacher/lessons",icon:Video,tone:"bg-blue-50 text-blue-700",tag:"Preview",roles:["teacher","owner"]},
 {title:"Missing resource recovery + Docs",description:"Broken lesson links land on a friendly recovery page with read-only documentation access.",href:"/docs",icon:FileText,tone:"bg-slate-50 text-slate-700",tag:"Recovery"},
 {title:"Interactive assignments",description:"Create assignments, attach reference media, collect submissions and grade returned work.",href:"/teacher/assignments",icon:ClipboardList,tone:"bg-emerald-50 text-emerald-700",tag:"Live UI",roles:["teacher"]},
 {title:"Exercise marking",description:"Open exercise marking, learner results, per-question marks and correction feedback.",href:"/teacher/exercises/1/mark",icon:FileCheck2,tone:"bg-purple-50 text-purple-700",tag:"Marking",roles:["teacher","owner"]},
 {title:"Teacher qualifications",description:"Submit CV/resume, certificates and supporting proof for the approval workflow.",href:"/teacher/qualifications",icon:ShieldCheck,tone:"bg-cyan-50 text-cyan-700",tag:"Verification",roles:["teacher"]},
 {title:"Drawing / answer workspace",description:"Open the learner exercise workspace with touch drawing and media answers. Existing drawing data is preserved.",href:"/student/lessons",icon:PenTool,tone:"bg-rose-50 text-rose-700",tag:"Touch",roles:["student"]},
 {title:"Study groups & Connect",description:"Use group permissions, member previews and the Connect communication experience.",href:"/student/study-groups",icon:Users,tone:"bg-orange-50 text-orange-700",tag:"Social",roles:["student"]},
 {title:"Payments",description:"Open the learner payment flow or staff financial dashboard. Provider-backed payouts remain gated until credentials are configured.",href:"/student/payments",icon:CreditCard,tone:"bg-green-50 text-green-700",tag:"Provider-ready",roles:["student"]},
 {title:"PWA / install",description:"Use the install experience and test the app shell across supported mobile and desktop browsers.",href:"/docs",icon:Smartphone,tone:"bg-sky-50 text-sky-700",tag:"PWA"},
 {title:"Email notifications",description:"Managers and owners can opt an in-app notification into server-side email delivery.",href:"/admin/notifications",icon:Mail,tone:"bg-violet-50 text-violet-700",tag:"Manager / Owner",roles:["teacher","owner"]},
];

export default function FeatureCenter(){
 const {user}=useAuth();
 const visible=features.filter(f=>!f.roles || (user && f.roles.includes(user.role)));
 return <DashboardLayout>
  <div className="space-y-6">
   <div className="rounded-3xl bg-gradient-to-br from-[#0a1628] via-[#10294a] to-[#0a1628] p-6 md:p-8 text-white shadow-xl">
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
     <div><Badge className="bg-amber-400 text-[#0a1628] hover:bg-amber-400">DALLYLETTER ELIDEMS · Preview Center</Badge><h1 className="mt-3 text-3xl md:text-4xl font-black tracking-tight">Everything in one place.</h1><p className="mt-2 max-w-3xl text-sm md:text-base text-white/70">A mobile-first control room for the requested upgrades. Open each area and test the real interface before merging.</p></div>
     <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm"><span className="text-white/50">Signed in as</span><div className="font-semibold">{user?.name}</div></div>
    </div>
   </div>
   <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
    {visible.map((f)=>{
      const Icon=f.icon;
      return <Card key={f.title} className="group flex h-full flex-col overflow-hidden border-slate-200/80 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
       <CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div className={`rounded-2xl p-3 ${f.tone}`}><Icon className="h-5 w-5"/></div><Badge variant="outline">{f.tag}</Badge></div><CardTitle className="mt-2 text-lg">{f.title}</CardTitle><CardDescription className="leading-relaxed">{f.description}</CardDescription></CardHeader>
       <CardContent className="mt-auto pt-0"><Link href={f.href}><Button className="w-full gap-2">Open & test <span aria-hidden>→</span></Button></Link></CardContent>
      </Card>
    })}
   </div>
   <Card className="border-amber-200 bg-amber-50/60"><CardContent className="p-5"><div className="flex gap-3"><WalletCards className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"/><div><p className="font-semibold text-amber-950">Provider-backed features are deliberately honest</p><p className="mt-1 text-sm text-amber-900/80">Email, push, cloud media and real payouts only show successful delivery when the required server credentials/provider configuration actually exists. No fake payment or fake notification success is used.</p></div></div></CardContent></Card>
  </div>
 </DashboardLayout>
}
