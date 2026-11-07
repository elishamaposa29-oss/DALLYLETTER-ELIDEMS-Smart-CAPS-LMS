import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowRight, BookOpen, GraduationCap, School, Users, Compass, CheckCircle2, Globe2, Lightbulb, CalendarDays, ShieldCheck } from "lucide-react";

type PageKey = "about" | "learners" | "educators" | "schools" | "resources" | "study-plan";
const SITE = "https://dallyletter-elidems-onlineschoolbye-two.vercel.app";
const pages: Record<PageKey, { title: string; description: string; eyebrow: string; intro: string; sections: { title: string; body: string; bullets?: string[] }[] }> = {
  about: {
    title: "About Dallyletter Elidems | African Learning, Open to the World",
    description: "Learn about Dallyletter Elidems, its Zimbabwe-first and internationally welcoming education technology mission, and its founder and sole creator, Elisha Maposa.",
    eyebrow: "About the platform",
    intro: "Dallyletter Elidems is an education-technology initiative being built to bring useful learning and teaching workflows into one connected digital environment. Zimbabwe and South Africa are the initial focus; learners, educators and educational organisations elsewhere are welcome.",
    sections: [
      { title: "Why it is being built", body: "Learning often involves disconnected materials, assignments, communication and progress records. Dallyletter's direction is to make those activities easier to access and manage in one place, while keeping the needs of learners and educators at the centre." },
      { title: "An African starting point, a global outlook", body: "The initial market focus is Zimbabwe and South Africa. The longer-term ambition is to support diverse African educational contexts and welcome international participation. Curriculum availability must be checked against the subjects and materials actually published on the platform; we do not claim complete coverage of every syllabus." },
      { title: "Founder and authorship", body: "Dallyletter Elidems was founded and solely created by Elisha Maposa. The project is being developed with an emphasis on practical education workflows, transparent progress and continuous improvement." },
      { title: "What we believe", body: "Digital education should be useful, understandable and honest about its limits. We aim to show what is available, identify what is still being improved and listen to learners, teachers and institutions before expanding claims or commitments." }
    ]
  },
  learners: {
    title: "Online Learning for Learners in Zimbabwe and Beyond | Dallyletter",
    description: "Explore practical digital learning workflows with Dallyletter Elidems: lessons, practice, assignments, classes, study support and progress tools for learners.",
    eyebrow: "For learners",
    intro: "Make your study time more organised. Dallyletter brings learning materials, practice, assignments and communication into a connected learner workspace, with Zimbabwe and South Africa in focus and an international welcome.",
    sections: [
      { title: "Build a repeatable study routine", body: "Choose one topic, set a small target and return to it consistently. A useful routine is more valuable than a complicated timetable that is difficult to maintain.", bullets: ["Write down the topic and what you need to understand.", "Study a short section, then close the notes and recall the main ideas.", "Practise with questions and mark the points you could not explain.", "Return to difficult ideas after a gap instead of cramming everything at once."] },
      { title: "Keep learning activities connected", body: "The learner workspace is designed to bring together lessons and media, exercises, assignments, classes, study groups, notifications and communication. Availability depends on your account role and the tools enabled for your learning space." },
      { title: "Use feedback to improve", body: "Treat corrections as information about what to practise next. Keep a short error list, redo questions without looking at the answer and ask for clarification when an explanation is unclear." },
      { title: "Start with the right next step", body: "Create an account to begin the learner journey, or sign in if you already have access. For navigation help, use the learner guide." }
    ]
  },
  educators: {
    title: "Digital Teaching Tools for Educators | Dallyletter Elidems",
    description: "Discover Dallyletter's educator direction: lesson delivery, classes, assignments, learner engagement, feedback and connected teaching workflows.",
    eyebrow: "For educators",
    intro: "Teaching involves much more than presenting content. Dallyletter is developing a connected educator workspace to support lesson delivery, class activity, assignments, learner communication and academic follow-through.",
    sections: [
      { title: "Plan and share learning", body: "Use a clear lesson objective, a short explanation, an example and a task that lets learners demonstrate understanding. Digital materials work best when they are organised around what learners should be able to do." },
      { title: "Connect teaching to practice", body: "The platform's educator workflows include lesson and class spaces, assignments, learner engagement and assessment-related tools. Use the features available to your approved account; do not assume every workflow is enabled for every school or user." },
      { title: "Make feedback actionable", body: "Useful feedback identifies what is correct, what needs attention and what the learner should try next. Encourage learners to revisit corrected work and explain their reasoning." },
      { title: "Teacher access and professional review", body: "Teacher registration and teaching access are distinct. Where an application or qualification review is required, complete the requested information and wait for the platform's decision before relying on teaching permissions." }
    ]
  },
  schools: {
    title: "Digital Learning and School Workflows | Dallyletter Elidems",
    description: "Explore Dallyletter Elidems for schools and educational organisations: role-based workspaces, academic oversight, teacher workflows and operational visibility.",
    eyebrow: "For schools and organisations",
    intro: "Schools need tools that connect classroom activity with responsible administration. Dallyletter's direction is to support learning communities through role-based workspaces and connected academic and operational workflows.",
    sections: [
      { title: "Role-aware workspaces", body: "Different people need different levels of access. Learners, teachers, managers and platform owners should see only the workspaces and actions permitted for their accounts." },
      { title: "Academic operations", body: "The platform includes workflows for classes, lessons, attendance, learner records, assignments and review activity. The exact availability of each workflow should be confirmed during an institutional discussion and tested in the relevant environment." },
      { title: "Staff and learner administration", body: "Teacher applications, qualifications and transfer-related reviews are intended to follow controlled review processes. Approval authority and access should remain limited to appropriately authorised accounts." },
      { title: "Fees and payment visibility", body: "Financial workflows depend on the institution's configured fee rules and the payment providers enabled for its account. Do not treat a learner's payment notification as proof of settlement; verified transaction status is the source of truth." },
      { title: "Start a conversation", body: "Schools and educational organisations can create an account or sign in to explore the available platform pathways. Institutional scope, access and commercial terms must be confirmed with authorised platform administration; no unverified partnership, accreditation or price is implied." }
    ]
  },
  resources: {
    title: "Study Resources and Practical Learning Guides | Dallyletter",
    description: "Read practical study guidance from Dallyletter Elidems: active recall, spaced practice, weekly planning, assignment habits and exam preparation.",
    eyebrow: "Learning resource hub",
    intro: "Good study advice should be specific enough to use today. This resource hub focuses on practical habits learners can apply across subjects, schools and learning environments.",
    sections: [
      { title: "Study with active recall", body: "After reading a section, put the notes aside and write or say what you remember. Check the source, correct gaps and repeat. Recalling information strengthens understanding more than repeatedly rereading without testing yourself." },
      { title: "Space your practice", body: "Return to important material over several days. Short sessions separated by time help reveal what you can remember independently and what still needs work." },
      { title: "Turn assignments into steps", body: "Read the task, identify the deliverable, list the smaller actions, start with the first action and check the final work against the instructions before submitting." },
      { title: "Plan a realistic week", body: "A useful plan includes specific topics, manageable study blocks, breaks and time to revisit difficult questions. Leave room for school, family responsibilities and unexpected changes." }
    ]
  },
  "study-plan": {
    title: "A Simple 7-Day Study Plan for Learners | Dallyletter",
    description: "Use this practical seven-day study plan to organise topics, practise recall, solve questions and review difficult areas without last-minute cramming.",
    eyebrow: "Practical study guide",
    intro: "A study plan should help you start, not make you feel behind. Use this seven-day framework for one subject or one topic, then adapt the time and workload to your real schedule.",
    sections: [
      { title: "Day 1 — Choose a clear target", body: "Write the topic, the reason it matters and three questions you want to be able to answer by the end of the week. Gather the notes and learning materials you need." },
      { title: "Day 2 — Understand the foundations", body: "Study one small section. Explain it in your own words and write down any terms or steps you cannot yet explain." },
      { title: "Day 3 — Practise without looking", body: "Close your notes and answer questions from memory. Check your answers and record mistakes without judging yourself." },
      { title: "Day 4 — Fix the gaps", body: "Return to the two or three ideas that caused difficulty. Find another explanation or example, then try a fresh question." },
      { title: "Day 5 — Mix and apply", body: "Combine questions from earlier sections. Explain why each method or answer is appropriate, not only what the answer is." },
      { title: "Day 6 — Complete a short check", body: "Set a reasonable time limit and complete a small practice set. Review accuracy, understanding and the questions that took longest." },
      { title: "Day 7 — Review and plan forward", body: "Summarise what improved, list remaining gaps and choose the next topic. Keep the plan flexible enough to fit your school and home responsibilities." }
    ]
  }
};

function pageKey(pathname: string): PageKey {
  const path = pathname.replace(/\/$/, "") || "/";
  if (path === "/about") return "about";
  if (path === "/learners") return "learners";
  if (path === "/educators") return "educators";
  if (path === "/schools") return "schools";
  if (path === "/resources/study-plan") return "study-plan";
  return "resources";
}

export default function PublicContentPage() {
  const key = pageKey(window.location.pathname);
  const page = pages[key];
  useEffect(() => {
    document.title = page.title;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.setAttribute("content", page.description);
    const canonicalUrl = SITE + (window.location.pathname === "/" ? "" : window.location.pathname);
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute("href", canonicalUrl);
    const setMeta = (selector: string, value: string) => {
      const element = document.querySelector(selector);
      if (element) element.setAttribute("content", value);
    };
    setMeta('meta[property="og:url"]', canonicalUrl);
    setMeta('meta[property="og:title"]', page.title);
    setMeta('meta[property="og:description"]', page.description);
    setMeta('meta[name="twitter:title"]', page.title);
    setMeta('meta[name="twitter:description"]', page.description);
    setMeta('meta[name="author"]', "Elisha Maposa");
    const existing = document.getElementById("dallyletter-page-schema");
    existing?.remove();
    const schema = document.createElement("script");
    schema.id = "dallyletter-page-schema";
    schema.type = "application/ld+json";
    schema.text = JSON.stringify({ "@context": "https://schema.org", "@type": "WebPage", name: page.title, description: page.description, url: canonicalUrl, isPartOf: { "@type": "WebSite", name: "Dallyletter Elidems", url: SITE }, author: { "@type": "Person", name: "Elisha Maposa" } });
    document.head.appendChild(schema);
  }, [page]);

  const cards = [
    { href: "/learners", label: "Learners", icon: GraduationCap },
    { href: "/educators", label: "Educators", icon: Users },
    { href: "/schools", label: "Schools", icon: School },
    { href: "/resources", label: "Study resources", icon: BookOpen },
  ];
  return <main className="min-h-screen bg-[#f7f8fb] text-slate-800">
    <header className="bg-[#0b1e3d] text-white"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5"><Link href="/" className="font-bold tracking-wide">DALLYLETTER <span className="text-[#e2bd54]">ELIDEMS</span></Link><nav className="flex flex-wrap items-center gap-3 text-sm text-blue-100/80"><Link href="/about">About</Link><Link href="/learners">Learners</Link><Link href="/educators">Educators</Link><Link href="/schools">Schools</Link><Link href="/resources">Resources</Link></nav></div></header>
    <section className="bg-[#0b1e3d] px-5 pb-16 pt-12 text-white sm:pb-20"><div className="mx-auto max-w-4xl"><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.2em] text-[#e2bd54]"><Globe2 className="h-4 w-4" /> {page.eyebrow}</p><h1 className="mt-4 max-w-4xl font-serif text-4xl font-bold leading-tight sm:text-5xl">{page.title.split("|")[0].trim()}</h1><p className="mt-6 max-w-3xl text-lg leading-8 text-blue-100/80">{page.intro}</p><div className="mt-8 flex flex-wrap gap-3"><Link href="/register" className="inline-flex items-center gap-2 rounded-xl bg-[#d7ad35] px-5 py-3 font-bold text-[#10264a]">Get started <ArrowRight className="h-4 w-4" /></Link><Link href="/" className="rounded-xl border border-white/20 px-5 py-3 font-semibold text-white">Explore the platform</Link></div></div></section>
    <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 lg:grid-cols-[minmax(0,1fr)_280px]"><article className="space-y-5">{page.sections.map((section,index)=><section key={section.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><p className="text-xs font-bold tracking-[.18em] text-[#9a7614]">0{index+1}</p><h2 className="mt-2 text-2xl font-bold text-[#10264a]">{section.title}</h2><p className="mt-3 leading-7 text-slate-600">{section.body}</p>{section.bullets && <ul className="mt-4 space-y-3">{section.bullets.map(item=><li key={item} className="flex gap-3 leading-6 text-slate-700"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#9a7614]"/>{item}</li>)}</ul>}</section>)}</article><aside className="space-y-5"><div className="rounded-2xl bg-[#edf2fa] p-6"><h2 className="font-bold text-[#10264a]">Explore Dallyletter</h2><div className="mt-4 space-y-3">{cards.map(({href,label,icon:Icon})=><Link key={href} href={href} className="flex items-center gap-3 rounded-xl bg-white p-3 text-sm font-semibold text-[#10264a] hover:shadow"><Icon className="h-5 w-5 text-[#9a7614]"/>{label}<ArrowRight className="ml-auto h-4 w-4"/></Link>)}</div></div><div className="rounded-2xl border border-slate-200 bg-white p-6"><Compass className="h-6 w-6 text-[#9a7614]"/><h2 className="mt-3 font-bold text-[#10264a]">A practical next step</h2><p className="mt-2 text-sm leading-6 text-slate-600">Choose one useful action, try it consistently and review what changes. Learning improves through steady practice and feedback.</p><Link href="/resources/study-plan" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#0f2a5a]">Use the 7-day plan <ArrowRight className="h-4 w-4"/></Link></div></aside></div>
    <section className="bg-white px-5 py-12"><div className="mx-auto flex max-w-6xl flex-col justify-between gap-5 sm:flex-row sm:items-center"><div><p className="font-bold text-[#10264a]">Learning without borders.</p><p className="mt-1 text-sm text-slate-500">Zimbabwe and South Africa in focus. Open to the world.</p></div><div className="flex flex-wrap gap-4 text-sm font-semibold text-[#0f2a5a]"><Link href="/about">About</Link><Link href="/docs">Learner guide</Link><Link href="/login">Sign in</Link><Link href="/register">Register</Link></div></div></section>
    <footer className="bg-[#07162d] px-5 py-6 text-center text-xs text-blue-100/60">Dallyletter Elidems · Founded and solely created by Elisha Maposa · © {new Date().getFullYear()}</footer>
  </main>;
}
