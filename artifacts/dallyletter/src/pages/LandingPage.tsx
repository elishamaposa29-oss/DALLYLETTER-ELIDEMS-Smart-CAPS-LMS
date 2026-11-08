import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowRight, BookOpen, BrainCircuit, CalendarDays, CheckCircle2, ClipboardCheck, GraduationCap, Landmark, MessageCircle, NotebookTabs, ShieldCheck, Users, Video, Globe2, Sparkles } from "lucide-react";

const learningTools = [
  { icon: BookOpen, title: "Curriculum-aware lessons", text: "Open teacher-published lesson notes and learning media.", href: "/student/lessons", action: "Explore lessons" },
  { icon: BrainCircuit, title: "Exercises & practice", text: "Practise concepts, submit answers and review returned feedback.", href: "/student/exercises", action: "Start practising" },
  { icon: ClipboardCheck, title: "Assignments", text: "Keep track of assigned work and submissions.", href: "/student/assignments", action: "View assignments" },
  { icon: Video, title: "Classes & learning groups", text: "Find scheduled classes and collaborate with peers.", href: "/student/classes", action: "View classes" },
  { icon: Users, title: "Study groups", text: "Learn together through school and subject communities.", href: "/student/study-groups", action: "Open study groups" },
  { icon: NotebookTabs, title: "Record Book & progress", text: "Access academic records, saved activity and attendance evidence.", href: "/record-book", action: "Open Record Book" },
  { icon: CalendarDays, title: "Achievements", text: "See recorded achievements and learner milestones.", href: "/student/achievements", action: "View achievements" },
  { icon: MessageCircle, title: "Learner communication", text: "Keep up with messages and notifications in one workspace.", href: "/student/chat", action: "Open Connect" },
];

const educatorTools = [
  { icon: GraduationCap, title: "Teacher workspace", text: "Manage lessons, classes, assignments and learner feedback.", href: "/teacher" },
  { icon: ShieldCheck, title: "CV & qualifications", text: "Submit qualifications and supporting evidence for review.", href: "/teacher/qualifications" },
  { icon: Landmark, title: "School management", text: "Role-controlled views for authorised managers and school leaders.", href: "/manager" },
];

function dashboardFor(role: string) {
  const normalized = role.toLowerCase().replace(/[ -]+/g, "_");
  if (normalized === "owner" || normalized === "platform_owner") return "/admin";
  if (normalized === "admin") return "/features";
  if (normalized.includes("manager")) return "/manager";
  if (normalized === "teacher") return "/teacher";
  return "/student";
}

export default function LandingPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (user?.role) setLocation(dashboardFor(String(user.role)));
  }, [user?.role, setLocation]);

  if (isLoading || user?.role) {
    return <div className="min-h-screen grid place-items-center bg-[#0b1e3d] text-white"><div className="flex items-center gap-3 text-sm"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#d7ad35]" />Opening your Dallyletter workspace…</div></div>;
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f8fb] text-slate-900">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b1e3d]/95 text-white backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <img src="/icons/icon-192.png" alt="Dallyletter Elidems app icon" className="h-11 w-11 rounded-xl border border-white/15 object-cover" />
            <span><strong className="block text-base leading-tight tracking-tight">Dallyletter</strong><span className="text-[10px] font-semibold uppercase tracking-[.24em] text-[#e2bd54]">ELIDEMS</span></span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-white/75 md:flex">
            <Link href="/about" className="transition hover:text-white">About</Link>
            <Link href="/learners" className="transition hover:text-white">Learners</Link>
            <Link href="/educators" className="transition hover:text-white">Educators</Link>
            <Link href="/schools" className="transition hover:text-white">Schools</Link>
            <Link href="/resources" className="transition hover:text-white">Resources</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden rounded-full px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 sm:inline-flex">Sign in</Link>
            <Link href="/register" className="inline-flex items-center gap-2 rounded-full bg-[#d7ad35] px-4 py-2.5 text-sm font-bold text-[#10264a] shadow-lg shadow-black/10 transition hover:bg-[#e6c45f]">Get started <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </header>

      <section className="relative isolate overflow-hidden bg-[#0b1e3d] text-white">
        <div className="absolute inset-0 -z-10 opacity-20" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.08) 1px,transparent 1px)", backgroundSize: "52px 52px" }} />
        <div className="absolute -right-40 -top-48 -z-10 h-[34rem] w-[34rem] rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute -bottom-64 left-1/4 -z-10 h-[34rem] w-[34rem] rounded-full bg-amber-500/10 blur-3xl" />
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1.1fr_.9fr]">
          <div className="max-w-3xl">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.06] px-4 py-2 text-xs font-semibold tracking-wide text-[#f0d27a]"><Globe2 className="h-4 w-4" /> Zimbabwe first · South Africa and Africa welcome · Open to the world</div>
            <h1 className="font-serif text-5xl font-bold leading-[1.04] tracking-tight sm:text-6xl lg:text-7xl">Learning that moves <span className="text-[#e2bd54]">you forward.</span></h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-blue-100/75">A connected learning environment for learners, educators and schools — bringing lessons, practice, assignments, classes and academic progress into one place.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/register" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#d7ad35] px-6 py-4 font-bold text-[#10264a] shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:bg-[#e6c45f]">Create your learner account <ArrowRight className="h-5 w-5" /></Link>
              <Link href="/login" className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/[.06] px-6 py-4 font-semibold text-white transition hover:bg-white/10">Sign in to your dashboard</Link>
            </div>
            <div className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-blue-100/60"><span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[#e2bd54]" /> Learner and teacher workspaces</span><span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[#e2bd54]" /> Web and mobile-ready experience</span></div>
          </div>
          <div className="relative mx-auto w-full max-w-xl">
            <div className="absolute -inset-5 rounded-[2.5rem] bg-gradient-to-br from-[#d7ad35]/20 to-blue-400/10 blur-2xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-white/[.08] p-3 shadow-2xl shadow-black/30 backdrop-blur">
              <img src="/opengraph.jpg" alt="Dallyletter Elidems learning platform preview artwork" className="aspect-[1.48/1] w-full rounded-[1.4rem] object-cover" />
              <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3">
                {[["01","Learn","Lessons & media"],["02","Practise","Exercises & tasks"],["03","Progress","Records & feedback"]].map(([n,t,d]) => <div key={n} className="rounded-xl border border-white/10 bg-[#081a35]/80 p-3"><span className="text-[10px] font-bold tracking-widest text-[#d7ad35]">{n}</span><p className="mt-1 font-semibold text-white">{t}</p><p className="mt-1 text-[11px] text-blue-100/60">{d}</p></div>)}
              </div>
            </div>
            <div className="absolute -bottom-6 -left-5 hidden items-center gap-3 rounded-2xl border border-white/10 bg-white p-4 text-slate-900 shadow-xl sm:flex"><div className="rounded-xl bg-[#f5edda] p-3 text-[#0f2a5a]"><Sparkles className="h-5 w-5" /></div><div><p className="text-sm font-bold">One connected workspace</p><p className="text-xs text-slate-500">Study · Submit · Review · Improve</p></div></div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8" id="learning">
        <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[.22em] text-[#9a7614]">The learning experience</p><h2 className="mt-3 font-serif text-3xl font-bold tracking-tight text-[#10264a] sm:text-4xl">More than a place to open notes.</h2><p className="mt-4 leading-7 text-slate-600">Learning tools work best when they connect. Dallyletter brings study materials, practice, submissions, teacher feedback and progress records into a single learner journey.</p></div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{learningTools.map(({icon:Icon,title,text,href,action}) => <article key={title} className="group flex min-h-56 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-[#d7ad35]/60 hover:shadow-xl hover:shadow-slate-900/5"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#edf2fa] text-[#0f2a5a]"><Icon className="h-5 w-5" /></div><h3 className="mt-5 font-bold text-[#10264a]">{title}</h3><p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{text}</p><Link href={href} className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#0f2a5a] group-hover:text-[#9a7614]">{action} <ArrowRight className="h-4 w-4" /></Link></article>)}</div>
        <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-2xl bg-[#edf2fa] p-6 sm:flex-row sm:items-center"><div><p className="font-bold text-[#10264a]">Already part of Dallyletter?</p><p className="mt-1 text-sm text-slate-600">Go straight to your learner dashboard and continue where you left off.</p></div><Link href="/student" className="inline-flex items-center gap-2 rounded-xl bg-[#0f2a5a] px-5 py-3 text-sm font-bold text-white hover:bg-[#173a72]">Open learner dashboard <ArrowRight className="h-4 w-4" /></Link></div>
      </section>

      <section className="border-y border-slate-200 bg-white py-20" id="educators">
        <div className="mx-auto max-w-7xl px-5 sm:px-8"><div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[.22em] text-[#9a7614]">For educators</p><h2 className="mt-3 font-serif text-3xl font-bold tracking-tight text-[#10264a] sm:text-4xl">Teach, support and track learning.</h2><p className="mt-4 leading-7 text-slate-600">Educator workspaces connect lesson delivery, classes, assignments and learner support. Teacher applications and qualifications have a review workflow; platform access remains subject to approval and permissions.</p></div><div className="mt-9 grid gap-4 md:grid-cols-3">{educatorTools.map(({icon:Icon,title,text,href})=><Link key={title} href={href} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-6 transition hover:border-[#d7ad35] hover:shadow-lg"><Icon className="h-6 w-6 text-[#9a7614]" /><h3 className="mt-4 font-bold text-[#10264a]">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p><span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#0f2a5a]">Open workspace <ArrowRight className="h-4 w-4" /></span></Link>)}</div></div>
      </section>

      <section className="border-y border-slate-200 bg-white py-16" id="support">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 sm:px-8 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div><p className="text-xs font-bold uppercase tracking-[.22em] text-[#9a7614]">Help & support</p><h2 className="mt-3 font-serif text-3xl font-bold tracking-tight text-[#10264a]">Clear guidance. A route to a real person.</h2><p className="mt-4 max-w-xl leading-7 text-slate-600">Read the learner guide for help using Dallyletter. Signed-in learners can use Connect to message an available teacher or the platform Owner. If you cannot sign in, start with password recovery.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/docs" className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-5 transition hover:border-[#d7ad35]"><BookOpen className="h-6 w-6 text-[#0f2a5a]" /><h3 className="mt-3 font-bold text-[#10264a]">Learner guide</h3><p className="mt-1 text-sm text-slate-600">Find instructions for lessons, assignments and communication.</p></Link>
            <Link href="/login?next=%2Fstudent%2Fchat" className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-5 transition hover:border-[#d7ad35]"><MessageCircle className="h-6 w-6 text-[#0f2a5a]" /><h3 className="mt-3 font-bold text-[#10264a]">Contact a teacher or Owner</h3><p className="mt-1 text-sm text-slate-600">Sign in, open Connect and choose People to start a conversation.</p></Link>
            <Link href="/forgot-password" className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-5 transition hover:border-[#d7ad35] sm:col-span-2"><ShieldCheck className="h-6 w-6 text-[#0f2a5a]" /><h3 className="mt-3 font-bold text-[#10264a]">Account access help</h3><p className="mt-1 text-sm text-slate-600">Recover access if you have forgotten your password.</p></Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[.9fr_1.1fr]" id="schools">
        <div><p className="text-xs font-bold uppercase tracking-[.22em] text-[#9a7614]">For schools</p><h2 className="mt-3 font-serif text-3xl font-bold tracking-tight text-[#10264a] sm:text-4xl">A stronger operating layer for schools.</h2><p className="mt-4 leading-7 text-slate-600">School leadership tools bring authorised oversight closer to teaching and learner activity — including staff and learner workspaces, academic records, review queues and financial administration.</p><p className="mt-4 text-sm leading-6 text-slate-500">Institutional access and commercial terms are arranged through authorised platform administration. We do not publish unverified prices, promise integrations that are not configured, or claim government accreditation.</p><div className="mt-7 flex flex-wrap gap-3"><Link href="/login" className="inline-flex items-center gap-2 rounded-xl bg-[#0f2a5a] px-5 py-3 text-sm font-bold text-white hover:bg-[#173a72]">School administrator sign in <ArrowRight className="h-4 w-4" /></Link><Link href="/docs" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-[#10264a] hover:bg-white">Read platform guide</Link></div></div>
        <div className="grid gap-3 sm:grid-cols-2">{[["Role-based access","Separate learner, teacher, manager and Owner workspaces."],["Academic oversight","Record Book, attendance, reporting and review tools."],["Operational workflows","Teacher applications, qualifications and transfer reviews."],["Financial visibility","Fee records and payment administration, subject to provider configuration."]].map(([title,body],i)=><div key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><span className="text-xs font-bold tracking-widest text-[#a17c19]">0{i+1}</span><h3 className="mt-3 font-bold text-[#10264a]">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{body}</p></div>)}</div>
      </section>

      <section className="border-b border-slate-200 bg-[#f7f8fb] py-16" id="organisations">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 sm:px-8 md:grid-cols-[1fr_auto] md:items-center"><div><p className="text-xs font-bold uppercase tracking-[.22em] text-[#9a7614]">For educational organisations</p><h2 className="mt-3 font-serif text-3xl font-bold tracking-tight text-[#10264a] sm:text-4xl">Support learning beyond one classroom.</h2><p className="mt-4 max-w-2xl leading-7 text-slate-600">Tutoring centres, community programmes, education providers and training teams can explore how Dallyletter's developing learning workflows may fit their programmes. Scope, enabled features, access, support and commercial terms are confirmed before onboarding.</p></div><Link href="/organisations" className="inline-flex items-center gap-2 rounded-xl bg-[#0f2a5a] px-5 py-3 text-sm font-bold text-white hover:bg-[#173a72]">Explore organisation solutions <ArrowRight className="h-4 w-4" /></Link></div>
      </section>

      <section className="bg-[#0b1e3d] px-5 py-16 text-center text-white sm:px-8"><div className="mx-auto max-w-3xl"><p className="text-xs font-bold uppercase tracking-[.22em] text-[#e2bd54]">Your next step</p><h2 className="mt-3 font-serif text-3xl font-bold sm:text-4xl">Make your next learning move count.</h2><p className="mx-auto mt-4 max-w-xl leading-7 text-blue-100/70">Create an account to explore the learner experience, or sign in to return to your existing workspace.</p><div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><Link href="/register" className="rounded-xl bg-[#d7ad35] px-6 py-3.5 font-bold text-[#10264a] hover:bg-[#e6c45f]">Create an account</Link><Link href="/login" className="rounded-xl border border-white/20 px-6 py-3.5 font-semibold text-white hover:bg-white/10">Sign in</Link></div></div></section>
      <footer className="bg-[#07162d] px-5 py-8 text-center text-xs text-blue-100/50"><p className="font-semibold tracking-wide text-white/80">DALLYLETTER ELIDEMS</p><p className="mt-2">Created by Elisha Maposa · Zimbabwe first · South Africa and Africa welcome · Welcoming learners worldwide</p><p className="mt-2">© {new Date().getFullYear()} Dallyletter Elidems. All rights reserved.</p><div className="mt-4 flex justify-center gap-5"><Link href="/about" className="hover:text-white">About</Link><Link href="/learners" className="hover:text-white">Learners</Link><Link href="/educators" className="hover:text-white">Educators</Link><Link href="/schools" className="hover:text-white">Schools</Link><Link href="/organisations" className="hover:text-white">Organisations</Link><Link href="/resources" className="hover:text-white">Resources</Link><Link href="/docs" className="hover:text-white">Learner guide</Link><Link href="/login" className="hover:text-white">Sign in</Link><Link href="/register" className="hover:text-white">Register</Link></div></footer>
    </main>
  );
}
