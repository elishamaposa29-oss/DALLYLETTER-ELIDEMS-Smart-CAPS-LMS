import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowRight, BookOpen, GraduationCap, School, Users, Compass, CheckCircle2, Globe2, Building2 } from "lucide-react";
import pageContent from "@/content/public-pages.json";

type PageKey = keyof typeof pageContent;
const SITE = "https://dallyletter-elidems-onlineschoolbye-two.vercel.app";

function pageKey(pathname: string): PageKey {
  const path = pathname.replace(/\/$/, "") || "/";
  if (path === "/about") return "about";
  if (path === "/learners") return "learners";
  if (path === "/educators") return "educators";
  if (path === "/schools") return "schools";
  if (path === "/organisations") return "organisations";
  if (path === "/resources/study-plan") return "study-plan";
  return "resources";
}

export default function PublicContentPage() {
  const key = pageKey(window.location.pathname);
  const page = pageContent[key];
  useEffect(() => {
    const canonicalUrl = SITE + window.location.pathname.replace(/\/$/, "");
    document.title = page.title;
    const setMeta = (selector: string, value: string) => {
      const element = document.querySelector(selector);
      if (element) element.setAttribute("content", value);
    };
    setMeta('meta[name="description"]', page.description);
    setMeta('link[rel="canonical"]', canonicalUrl);
    setMeta('meta[property="og:url"]', canonicalUrl);
    setMeta('meta[property="og:title"]', page.title);
    setMeta('meta[property="og:description"]', page.description);
    setMeta('meta[name="twitter:title"]', page.title);
    setMeta('meta[name="twitter:description"]', page.description);
    setMeta('meta[name="author"]', "Elisha Maposa");
    document.getElementById("dallyletter-page-schema")?.remove();
    const schema = document.createElement("script");
    schema.id = "dallyletter-page-schema";
    schema.type = "application/ld+json";
    schema.text = JSON.stringify({ "@context": "https://schema.org", "@type": "WebPage", name: page.title, description: page.description, url: canonicalUrl, isPartOf: { "@type": "WebSite", name: "Dallyletter Elidems", url: SITE + "/" }, author: { "@type": "Person", name: "Elisha Maposa" } });
    document.head.appendChild(schema);
  }, [page]);

  const cards = [
    { href: "/learners", label: "Learners", icon: GraduationCap },
    { href: "/educators", label: "Educators", icon: Users },
    { href: "/schools", label: "Schools", icon: School },
    { href: "/organisations", label: "Organisations", icon: Building2 },
    { href: "/resources", label: "Study resources", icon: BookOpen },
  ];
  return <main className="min-h-screen bg-[#f7f8fb] text-slate-800">
    <header className="bg-[#0b1e3d] text-white"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5"><Link href="/" className="font-bold tracking-wide">DALLYLETTER <span className="text-[#e2bd54]">ELIDEMS</span></Link><nav className="flex flex-wrap items-center gap-3 text-sm text-blue-100/80"><Link href="/about">About</Link><Link href="/learners">Learners</Link><Link href="/educators">Educators</Link><Link href="/schools">Schools</Link><Link href="/organisations">Organisations</Link><Link href="/resources">Resources</Link></nav></div></header>
    <section className="bg-[#0b1e3d] px-5 pb-16 pt-12 text-white sm:pb-20"><div className="mx-auto max-w-4xl"><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.2em] text-[#e2bd54]"><Globe2 className="h-4 w-4" /> {page.eyebrow}</p><h1 className="mt-4 max-w-4xl font-serif text-4xl font-bold leading-tight sm:text-5xl">{page.title.split("|")[0].trim()}</h1><p className="mt-6 max-w-3xl text-lg leading-8 text-blue-100/80">{page.intro}</p><div className="mt-8 flex flex-wrap gap-3"><Link href="/register" className="inline-flex items-center gap-2 rounded-xl bg-[#d7ad35] px-5 py-3 font-bold text-[#10264a]">Get started <ArrowRight className="h-4 w-4" /></Link><Link href="/" className="rounded-xl border border-white/20 px-5 py-3 font-semibold text-white">Explore the platform</Link></div></div></section>
    <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 lg:grid-cols-[minmax(0,1fr)_280px]"><article className="space-y-5">{page.sections.map((section,index)=><section key={section.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><p className="text-xs font-bold tracking-[.18em] text-[#9a7614]">0{index+1}</p><h2 className="mt-2 text-2xl font-bold text-[#10264a]">{section.title}</h2><p className="mt-3 leading-7 text-slate-600">{section.body}</p>{"bullets" in section && section.bullets && <ul className="mt-4 space-y-3">{section.bullets.map(item=><li key={item} className="flex gap-3 leading-6 text-slate-700"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#9a7614]"/>{item}</li>)}</ul>}</section>)}</article><aside className="space-y-5"><div className="rounded-2xl bg-[#edf2fa] p-6"><h2 className="font-bold text-[#10264a]">Explore Dallyletter</h2><div className="mt-4 space-y-3">{cards.map(({href,label,icon:Icon})=><Link key={href} href={href} className="flex items-center gap-3 rounded-xl bg-white p-3 text-sm font-semibold text-[#10264a] hover:shadow"><Icon className="h-5 w-5 text-[#9a7614]"/>{label}<ArrowRight className="ml-auto h-4 w-4"/></Link>)}</div></div><div className="rounded-2xl border border-slate-200 bg-white p-6"><Compass className="h-6 w-6 text-[#9a7614]"/><h2 className="mt-3 font-bold text-[#10264a]">A practical next step</h2><p className="mt-2 text-sm leading-6 text-slate-600">Choose one useful action, try it consistently and review what changes. Learning improves through steady practice and feedback.</p><Link href="/resources/study-plan" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#0f2a5a]">Use the 7-day plan <ArrowRight className="h-4 w-4"/></Link></div></aside></div>
    <section className="bg-white px-5 py-12"><div className="mx-auto flex max-w-6xl flex-col justify-between gap-5 sm:flex-row sm:items-center"><div><p className="font-bold text-[#10264a]">Learning without borders.</p><p className="mt-1 text-sm text-slate-500">Zimbabwe and South Africa in focus. Open to the world.</p></div><div className="flex flex-wrap gap-4 text-sm font-semibold text-[#0f2a5a]"><Link href="/about">About</Link><Link href="/organisations">Organisations</Link><Link href="/docs">Learner guide</Link><Link href="/login">Sign in</Link><Link href="/register">Register</Link></div></div></section>
    <footer className="bg-[#07162d] px-5 py-6 text-center text-xs text-blue-100/60">Dallyletter Elidems · Founded and solely created by Elisha Maposa · © {new Date().getFullYear()}</footer>
  </main>;
}
