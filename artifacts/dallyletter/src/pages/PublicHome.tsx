import { Link } from "wouter";
import {
  ArrowRight, Award, BookOpen, BriefcaseBusiness, CheckCircle2, ClipboardCheck,
  GraduationCap, Globe2, LockKeyhole, School, ShieldCheck, Smartphone, Users,
} from "lucide-react";

const learnerLinks = [
  { title: "Learner dashboard", detail: "Return to your study overview and current activity.", href: "/login?next=%2F", icon: GraduationCap },
  { title: "Lessons", detail: "Open the learner lesson library and continue studying.", href: "/login?next=%2Fstudent%2Flessons", icon: BookOpen },
  { title: "Classes", detail: "View your classes and upcoming learning sessions.", href: "/login?next=%2Fstudent%2Fclasses", icon: School },
  { title: "Exercises and assignments", detail: "Practise, submit work and review returned feedback.", href: "/login?next=%2Fstudent%2Fexercises", icon: ClipboardCheck },
  { title: "Study groups", detail: "Open your study-group and learner connection workspace.", href: "/login?next=%2Fstudent%2Fstudy-groups", icon: Users },
  { title: "Achievements", detail: "Review achievements recorded for your learner account.", href: "/login?next=%2Fstudent%2Fachievements", icon: Award },
  { title: "Academic record and profile", detail: "Open your authorised academic record and Profile Hub.", href: "/login?next=%2Frecord-book", icon: ShieldCheck },
  { title: "School fee records", detail: "View payment records and any instructions provided by your school.", href: "/login?next=%2Fstudent%2Fpayments", icon: LockKeyhole },
];

const capabilityCards = [
  { title: "Teach and guide", text: "Educator workspaces include lessons, classes, assignments, polls and learner feedback.", icon: BookOpen, href: "/login?next=%2Fteacher" },
  { title: "Measure learning", text: "Exercises, submissions, marks, attendance and achievement records help make progress visible.", icon: Award, href: "/login?next=%2Frecord-book" },
  { title: "Coordinate a school", text: "Role-based management areas support learner, teacher, report and operational workflows.", icon: School, href: "/login?next=%2Fmanager" },
];

export default function PublicHome() {
  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3 md:px-8">
          <Link href="/welcome" className="flex items-center gap-3" aria-label="Dallyletter Elidems home">
            <img src="/icons/icon-192.png" alt="Dallyletter Elidems icon" className="h-11 w-11 rounded-xl object-contain" />
            <span className="leading-tight"><strong className="block text-base font-extrabold tracking-tight text-[#0f2a5a]">Dallyletter</strong><span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#a17b00]">Elidems</span></span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-semibold text-slate-600 md:flex" aria-label="Main navigation">
            <a href="#learning" className="hover:text-[#0f2a5a]">Learning</a>
            <a href="#evidence" className="hover:text-[#0f2a5a]">Evidence</a>
            <a href="#schools" className="hover:text-[#0f2a5a]">Schools</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-xl px-3 py-2 text-sm font-bold text-[#0f2a5a] hover:bg-slate-100">Sign in</Link>
            <Link href="/register" className="rounded-xl bg-[#0f2a5a] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#173d79]">Get started</Link>
          </div>
        </div>
      </header>

      <section className="relative isolate overflow-hidden bg-[#0b1f3d] text-white">
        <div className="absolute inset-0 -z-10 opacity-25" style={{ backgroundImage: "radial-gradient(circle at 78% 18%, #c79a16 0, transparent 26%), radial-gradient(circle at 12% 82%, #245a9e 0, transparent 35%)" }} />
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 md:px-8 md:py-24 lg:grid-cols-[1.08fr_.92fr]">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.15em] text-amber-200">
              <Globe2 className="h-4 w-4" /> Zimbabwe & South Africa in focus · Open to the world
            </div>
            <h1 className="max-w-3xl text-4xl font-black leading-[1.08] tracking-tight md:text-6xl">Learning should leave <span className="text-amber-300">evidence</span>, not just memories.</h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-blue-100/80 md:text-lg">Dallyletter Elidems brings learning, practice, assessment and school activity into one digital environment — designed around African education contexts and welcoming learners, educators and institutions worldwide.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/login?next=%2F" className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-6 py-3.5 font-extrabold text-[#15243a] shadow-lg shadow-black/20 transition hover:bg-amber-300">Open learner dashboard <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/register" className="inline-flex items-center justify-center rounded-xl border border-white/25 bg-white/5 px-6 py-3.5 font-bold text-white transition hover:bg-white/10">Create an account</Link>
            </div>
            <p className="mt-5 text-xs text-blue-100/55">Founded and solely created by Elisha Maposa.</p>
          </div>
          <div className="relative">
            <div className="absolute -inset-5 rounded-[2rem] bg-amber-300/10 blur-2xl" />
            <div className="relative overflow-hidden rounded-[1.7rem] border border-white/15 bg-white p-2 shadow-2xl shadow-black/35">
              <img src="/opengraph.jpg" alt="Dallyletter Elidems brand artwork" className="aspect-[1.45/1] w-full rounded-[1.25rem] object-cover" />
              <div className="flex items-center justify-between gap-3 px-4 py-4 text-slate-800">
                <div><p className="text-sm font-extrabold">One learning environment</p><p className="mt-1 text-xs text-slate-500">Study · Practise · Submit · Improve</p></div>
                <img src="/icons/icon-192.png" alt="" className="h-12 w-12 rounded-xl" />
              </div>
            </div>
            <div className="absolute -bottom-5 -left-3 rounded-2xl border border-white/15 bg-[#102d54] px-4 py-3 shadow-xl md:-left-8"><p className="text-xs font-bold text-amber-300">Built around learning activity</p><p className="mt-1 text-sm font-semibold text-white">Progress you can review</p></div>
          </div>
        </div>
      </section>

      <section id="learning" className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-20">
        <div className="max-w-2xl"><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#a17b00]">A connected learning journey</p><h2 className="mt-3 text-3xl font-black tracking-tight text-[#0f2a5a] md:text-4xl">From the first lesson to meaningful feedback.</h2><p className="mt-4 leading-7 text-slate-600">Learners and educators can move between the real workspaces already present in the platform. Sign in to open the appropriate workspace; access remains protected by account role and server permissions.</p></div>
        <div className="mt-9 grid gap-4 md:grid-cols-3">
          {capabilityCards.map(({ title, text, icon: Icon, href }, index) => (
            <article key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#edf2fa] text-[#0f2a5a]"><Icon className="h-6 w-6" /></div>
              <p className="mt-5 text-xs font-black uppercase tracking-widest text-[#a17b00]">0{index + 1}</p>
              <h3 className="mt-2 text-xl font-extrabold text-[#0f2a5a]">{title}</h3>
              <p className="mt-3 min-h-20 text-sm leading-6 text-slate-600">{text}</p>
              <Link href={href} className="mt-5 inline-flex items-center gap-2 text-sm font-extrabold text-[#0f2a5a] hover:text-[#a17b00]">Open workspace <ArrowRight className="h-4 w-4" /></Link>
            </article>
          ))}
        </div>
      </section>

      <section id="evidence" className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 md:px-8 md:py-20 lg:grid-cols-[.9fr_1.1fr]">
          <div><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#a17b00]">Stage 2 · Educational credibility</p><h2 className="mt-3 text-3xl font-black tracking-tight text-[#0f2a5a] md:text-4xl">Make learning progress understandable and reviewable.</h2><p className="mt-5 leading-7 text-slate-600">A credible learning record is built from real activity: lessons accessed, work submitted, assessments marked, attendance recorded and achievements authorised by the responsible school or educator.</p><Link href="/login?next=%2Frecord-book" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#0f2a5a] px-5 py-3 font-bold text-white hover:bg-[#173d79]">Open academic record workspace <ArrowRight className="h-4 w-4" /></Link></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-[#f8fafc] p-5"><ClipboardCheck className="h-6 w-6 text-[#a17b00]" /><h3 className="mt-4 font-extrabold text-[#0f2a5a]">Assessment evidence</h3><p className="mt-2 text-sm leading-6 text-slate-600">Exercises, assignment submissions, marks and educator feedback create a clearer view of demonstrated learning.</p></div>
            <div className="rounded-2xl border border-slate-200 bg-[#f8fafc] p-5"><CheckCircle2 className="h-6 w-6 text-[#a17b00]" /><h3 className="mt-4 font-extrabold text-[#0f2a5a]">Authorised records</h3><p className="mt-2 text-sm leading-6 text-slate-600">Attendance, reports, transfers and achievements should retain the responsible reviewer and decision history.</p></div>
            <div className="rounded-2xl border border-slate-200 bg-[#f8fafc] p-5"><LockKeyhole className="h-6 w-6 text-[#a17b00]" /><h3 className="mt-4 font-extrabold text-[#0f2a5a]">Privacy by role</h3><p className="mt-2 text-sm leading-6 text-slate-600">Learner information is intended for authorised people. A visible link never replaces server-side permission checks.</p></div>
            <div className="rounded-2xl border border-slate-200 bg-[#f8fafc] p-5"><ShieldCheck className="h-6 w-6 text-[#a17b00]" /><h3 className="mt-4 font-extrabold text-[#0f2a5a]">Honest recognition</h3><p className="mt-2 text-sm leading-6 text-slate-600">Platform records and school-issued achievements are not presented as government accreditation or nationally recognised qualifications.</p></div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-20">
        <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr]">
          <div><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#a17b00]">For learners</p><h2 className="mt-3 text-3xl font-black tracking-tight text-[#0f2a5a]">Go straight to the work.</h2><p className="mt-4 leading-7 text-slate-600">Already have an account? These links take you to sign-in and then return you to the requested learner area when your role permits it.</p><div className="mt-6 flex items-center gap-2 text-sm text-slate-500"><Smartphone className="h-5 w-5 text-[#a17b00]" /> Designed for mobile and desktop access</div></div>
          <div className="grid gap-3">
            {learnerLinks.map(({ title, detail, href, icon: Icon }) => <Link key={title} href={href} className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[#b38b00] hover:shadow-md"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#edf2fa] text-[#0f2a5a]"><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><strong className="block text-sm font-extrabold text-[#0f2a5a]">{title}</strong><span className="mt-1 block text-xs leading-5 text-slate-500">{detail}</span></span><ArrowRight className="h-5 w-5 shrink-0 text-slate-400 transition group-hover:translate-x-1 group-hover:text-[#a17b00]" /></Link>)}
          </div>
        </div>
      </section>

      <section id="schools" className="bg-[#0f2a5a] text-white">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-5 py-16 md:px-8 md:py-20 lg:grid-cols-[1fr_auto]">
          <div><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-amber-300">Stage 3 · Institutional readiness</p><h2 className="mt-3 max-w-3xl text-3xl font-black tracking-tight md:text-4xl">A practical digital foundation for schools and learning organisations.</h2><p className="mt-4 max-w-3xl leading-7 text-blue-100/75">The platform’s direction supports school cohorts, educator workflows, learner records and operational oversight. Commercial onboarding should be agreed against the institution’s actual learner volume, support needs and enabled payment configuration — not a made-up one-size-fits-all price.</p></div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col"><Link href="/register" className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-6 py-3.5 font-extrabold text-[#17263e] hover:bg-amber-300">Create an account <ArrowRight className="h-4 w-4" /></Link><Link href="/docs" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/25 px-6 py-3.5 font-bold text-white hover:bg-white/10">Read platform guidance</Link></div>
        </div>
        <div className="mx-auto grid max-w-7xl gap-4 px-5 pb-14 md:grid-cols-3 md:px-8">
          <div className="rounded-2xl border border-white/15 bg-white/5 p-5"><School className="h-6 w-6 text-amber-300" /><h3 className="mt-3 font-extrabold">Schools</h3><p className="mt-2 text-sm leading-6 text-blue-100/70">Coordinate learner and educator activity with role-appropriate school workflows.</p></div>
          <div className="rounded-2xl border border-white/15 bg-white/5 p-5"><Users className="h-6 w-6 text-amber-300" /><h3 className="mt-3 font-extrabold">Educators</h3><p className="mt-2 text-sm leading-6 text-blue-100/70">Prepare learning activities, collect work and provide feedback through teaching tools.</p></div>
          <div className="rounded-2xl border border-white/15 bg-white/5 p-5"><BriefcaseBusiness className="h-6 w-6 text-amber-300" /><h3 className="mt-3 font-extrabold">Organisations</h3><p className="mt-2 text-sm leading-6 text-blue-100/70">Explore a structured digital learning environment for cohorts and programme delivery.</p></div>
        </div>
      </section>

      <footer className="bg-[#091a32] px-5 py-8 text-blue-100/60 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-xs md:flex-row md:items-center md:justify-between"><p>© {new Date().getFullYear()} Dallyletter Elidems · Founded and solely created by Elisha Maposa.</p><div className="flex flex-wrap gap-5"><Link href="/login" className="hover:text-white">Sign in</Link><Link href="/register" className="hover:text-white">Register</Link><Link href="/docs" className="hover:text-white">Documentation</Link></div></div>
      </footer>
    </main>
  );
}
