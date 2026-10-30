import { SystemNotificationBridge } from "@/components/SystemNotificationBridge";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { getApiUrl, useLogoutUser } from "@workspace/api-client-react";
import {
  BookOpen, Users, Video, MessageSquare, CreditCard, Bell, LogOut, Home, FileCheck2,
  Shield, Menu, GraduationCap, Settings, Sparkles, ClipboardList, Star, EllipsisVertical,
  ScrollText, Trophy, AlertTriangle, DollarSign, BarChart3, Briefcase,
  Flame, Send, ImagePlus,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  section?: string;
  accent?: string;
}

const roleColors: Record<string, string> = {
  student: "from-blue-600 to-blue-800",
  prefect: "from-blue-600 to-blue-800",
  teacher: "from-emerald-600 to-emerald-800",
  owner: "from-amber-600 to-amber-800",
  admin: "from-amber-600 to-amber-800",
  platform_owner: "from-amber-600 to-amber-800",
  manager: "from-purple-600 to-purple-800",
  senior_manager: "from-purple-600 to-purple-800",
};

const roleLabels: Record<string, string> = {
  student: "Learner",
  prefect: "Prefect learner",
  teacher: "Educator",
  owner: "Administrator",
  admin: "Administrator",
  platform_owner: "Platform owner",
  manager: "Manager",
  senior_manager: "Senior manager",
};

function AuthenticatedAvatar({ url, name }: { url: string; name: string }) {
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    if (/^https:\/\//i.test(url)) { setSource(url); return; }
    let active=true; let objectUrl:string|undefined;
    const token=localStorage.getItem("dallyletter_token") ?? "";
    void fetch(getApiUrl(url),{headers:{Authorization:"Bearer "+token}}).then(response=>{if(!response.ok) throw new Error("Avatar fetch failed"); return response.blob();}).then(blob=>{objectUrl=URL.createObjectURL(blob); if(active)setSource(objectUrl);}).catch(()=>{if(active)setSource(null);});
    return ()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[url]);
  return source ? <img src={source} alt={name} className="h-full w-full rounded-xl object-cover" /> : <span>{name.charAt(0).toUpperCase()}</span>;
}

function ProfileImageUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const upload = async (file?: File) => {
    setUploadError("");
    if (!file) return;
    if (!["image/jpeg","image/png","image/webp"].includes(file.type)) { window.alert("Choose a JPG, PNG, or WebP image."); return; }
    if (file.size > 8 * 1024 * 1024) { window.alert("Choose an image smaller than 8 MB."); return; }
    setBusy(true);
    try {
      const image = await new Promise<HTMLImageElement>((resolve,reject) => { const url=URL.createObjectURL(file); const img=new Image(); img.onload=()=>{URL.revokeObjectURL(url);resolve(img)}; img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("Image could not be read"))}; img.src=url; });
      const canvas=document.createElement("canvas"); const scale=Math.min(1,320/Math.max(image.naturalWidth,image.naturalHeight)); canvas.width=Math.max(1,Math.round(image.naturalWidth*scale)); canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const ctx=canvas.getContext("2d"); if(!ctx) throw new Error("Image processing is unavailable"); ctx.drawImage(image,0,0,canvas.width,canvas.height);
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error("Image compression failed")),"image/jpeg",0.78));
      const token=localStorage.getItem("dallyletter_token");
      const formData=new FormData(); formData.append("file",blob,"profile.jpg");
      const response=await fetch(getApiUrl("/api/users/me/avatar"),{method:"POST",headers:token?{Authorization:`Bearer ${token}`}:{},body:formData});
      const result=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(result.error || result.message || `Upload failed (HTTP ${response.status}). ${result.detail || "Check server media storage and retry."}`);
      window.location.reload();
    } catch(error) { setUploadError(error instanceof Error ? error.message : "Profile image upload failed. Check your connection and retry."); }
    finally { setBusy(false); if(inputRef.current) inputRef.current.value=""; }
  };
  return <div className="mt-1"><input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Choose profile image" onChange={e=>void upload(e.target.files?.[0])}/><button type="button" disabled={busy} onClick={()=>inputRef.current?.click()} className="inline-flex min-h-8 items-center gap-1 rounded-md border border-amber-400/30 px-2 text-xs font-medium text-amber-200 hover:bg-white/10 disabled:opacity-50"><ImagePlus className="h-3.5 w-3.5"/>{busy?"Saving image…":"Upload profile photo"}</button>{uploadError && <p role="alert" className="mt-1 max-w-56 text-[11px] text-rose-300">{uploadError}</p>}</div>;
}

function PushDeliveryTest() {
  const [busy, setBusy] = useState(false);
  const [testId, setTestId] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const runTest = async () => {
    setBusy(true);
    try {
      const token=localStorage.getItem("dallyletter_token") ?? "";
      const response=await fetch(getApiUrl("/api/push/test"),{method:"POST",headers:{Authorization:"Bearer "+token}});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error||"Could not queue push test");
      setTestId(Number(data.notificationId));
      setStatus("Test queued. For a true background-push check, close Dallyletter now, then check system notifications. Reopen later to inspect provider status.");
    } catch(error) { window.alert(error instanceof Error?error.message:"Push test failed"); }
    finally { setBusy(false); }
  };
  const checkStatus = async () => {
    if(!testId) return;
    setBusy(true);
    try {
      const token=localStorage.getItem("dallyletter_token") ?? "";
      const response=await fetch(getApiUrl("/api/push/test/"+testId),{headers:{Authorization:"Bearer "+token}});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error||"Could not read push status");
      setStatus(data.acceptedByPushService ? "Push service accepted the test. This confirms provider acceptance, not device display; close the app before the next test to avoid in-app polling notifications." : "Not delivered yet. Attempts: "+data.attempts+". "+(data.lastError||"Waiting for the next retry."));
    } catch(error) { window.alert(error instanceof Error?error.message:"Could not check push status"); }
    finally { setBusy(false); }
  };
  return <div className="mt-2 space-y-1">
    <button type="button" disabled={busy} onClick={() => void runTest()} className="inline-flex items-center gap-1 text-[11px] text-amber-300 hover:text-white disabled:opacity-50"><Bell className="h-3 w-3"/>{busy?"Working…":"Test push delivery"}</button>
    {testId !== null && <button type="button" disabled={busy} onClick={() => void checkStatus()} className="block text-[11px] text-white/70 underline disabled:opacity-50">Check test #{testId}</button>}
    {status && <p className="max-w-[210px] text-[10px] leading-4 text-white/60" aria-live="polite">{status}</p>}
  </div>;
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const logoutMutation = useLogoutUser();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  if (!user) return null;

  const handleLogout = () => {
    logoutMutation.mutate(undefined, { onSettled: () => logout() });
  };

  const normalizedRole = String(user.role||"").toLowerCase().replace(/[ -]+/g,"_");

  let navItems: NavItem[] = [];

  if (["student","prefect"].includes(normalizedRole)) {
    navItems = [
      { label: "Dashboard", href: "/", icon: Home, section: "Main" },
      { label: "Profile Hub", href: "/profile-hub", icon: Users },
      { label: "Feature Preview Center", href: "/features", icon: Sparkles },
      { label: "Lessons", href: "/student/lessons", icon: BookOpen },
      { label: "Exercises & Drawing", href: "/student/exercises", icon: ClipboardList },
      { label: "Live Classes", href: "/student/classes", icon: Video },
      { label: "Assignments", href: "/student/assignments", icon: ClipboardList },
      { label: "Study Groups", href: "/student/study-groups", icon: Users },
      { label: "Polls & Quizzes", href: "/student/polls", icon: BarChart3 },
      { label: "Chat", href: "/student/chat", icon: MessageSquare },
      { label: "Achievements", href: "/student/achievements", icon: Trophy, section: "My Progress" },
      { label: "BREAK-ELIDEMS", href: "/student/break-elidems", icon: Star, accent: "text-amber-400" },
      { label: "Payments", href: "/student/payments", icon: CreditCard, section: "Account" },
      { label: "Notifications", href: "/student/notifications", icon: Bell },
      { label: "Report to Owner", href: "/student/report", icon: AlertTriangle, accent: "text-red-400" },
    ];
    if (user.isPrefect) {
      navItems.splice(navItems.findIndex(n => n.href === "/student/achievements"), 0,
        { label: "Prefect Panel", href: "/student/prefect", icon: Shield, accent: "text-amber-400" }
      );
    }
  } else if (normalizedRole === "teacher") {
    navItems = [
      { label: "Dashboard", href: "/teacher", icon: Home, section: "Main" },
      { label: "Profile Hub", href: "/profile-hub", icon: Users },
      { label: "Feature Preview Center", href: "/features", icon: Sparkles },
      { label: "My Lessons", href: "/teacher/lessons", icon: BookOpen },
      { label: "Qualifications & CV", href: "/teacher/qualifications", icon: GraduationCap },
      { label: "My Classes", href: "/teacher/classes", icon: Video },
      { label: "Assignments", href: "/teacher/assignments", icon: ClipboardList },
      { label: "Study Groups", href: "/student/study-groups", icon: Users },
      { label: "Polls & Quizzes", href: "/teacher/polls", icon: BarChart3 },
      { label: "Chat", href: "/teacher/chat", icon: MessageSquare },
      { label: "Student Payments", href: "/teacher/payments", icon: CreditCard },
      ...((user as any).isManager ? [
        { label: "Manager Panel", href: "/manager", icon: Briefcase, section: "Management", accent: "text-purple-400" },
        { label: "Monitor Teachers", href: "/manager/teachers", icon: GraduationCap },
        { label: "Monitor Students", href: "/manager/students", icon: Users },
        { label: "Assignments", href: "/manager/assignments", icon: ClipboardList },
        { label: "Connect", href: "/manager/chat", icon: MessageSquare },
        { label: "Reports", href: "/manager/reports", icon: ScrollText },
        { label: "Notifications", href: "/manager/notifications", icon: Bell },
        { label: "Prefect Management", href: "/manager/prefects", icon: Shield },
      { label: "Transfer Requests", href: "/manager/transfer-requests", icon: FileCheck2, section: "Approvals", accent: "text-amber-300" },
      ] : []),
    ];
  } else if (["manager","senior_manager"].includes(normalizedRole)) {
    navItems = [
      { label: "Manager Dashboard", href: "/manager", icon: Home, section: "Management" },
      { label: "Profile Hub", href: "/profile-hub", icon: Users },
      { label: "Feature Preview Center", href: "/features", icon: Sparkles },
      { label: "Monitor Teachers", href: "/manager/teachers", icon: GraduationCap },
      { label: "Monitor Students", href: "/manager/students", icon: Users },
      { label: "Assignments", href: "/manager/assignments", icon: ClipboardList },
      { label: "Connect", href: "/manager/chat", icon: MessageSquare },
      { label: "Reports", href: "/manager/reports", icon: ScrollText },
      { label: "Notifications", href: "/manager/notifications", icon: Bell },
      { label: "Prefect Management", href: "/manager/prefects", icon: Shield },
    ];
  } else if (["owner","admin","platform_owner"].includes(normalizedRole)) {
    navItems = [
      { label: "Overview", href: "/admin", icon: Home, section: "Platform" },
      { label: "Profile Hub", href: "/profile-hub", icon: Users },
      { label: "Feature Preview Center", href: "/features", icon: Sparkles },
      { label: "Owner Command Center", href: "/admin/command-center", icon: Briefcase },
      { label: "Transfer Requests", href: "/manager/transfer-requests", icon: FileCheck2, section: "Approvals", accent: "text-amber-300" },
      { label: "Users", href: "/admin/users", icon: Users },
      { label: "All Lessons", href: "/admin/lessons", icon: BookOpen },
      { label: "All Classes", href: "/admin/classes", icon: Video },
      { label: "Assignments", href: "/admin/assignments", icon: ClipboardList },
      { label: "Study Groups", href: "/student/study-groups", icon: Users },
      { label: "Chat", href: "/admin/chat", icon: MessageSquare },
      { label: "Notifications", href: "/admin/notifications", icon: Bell },
      { label: "Financial Dashboard", href: "/admin/financial", icon: DollarSign, section: "Finance" },
      { label: "Payments (Fees)", href: "/admin/payments", icon: CreditCard },
      { label: "Staff Payments", href: "/admin/staff-payments", icon: Briefcase },
      { label: "ELIDEMS AI", href: "/admin/ai", icon: Sparkles, section: "AI & Automation", accent: "text-purple-400" },
      { label: "Polls & Quizzes", href: "/admin/polls", icon: BarChart3 },
      { label: "BREAK-ELIDEMS", href: "/admin/break-elidems", icon: Star, accent: "text-amber-400" },
      { label: "Achievements", href: "/admin/achievements", icon: Trophy },
      { label: "Owner Alerts", href: "/admin/alerts", icon: AlertTriangle, accent: "text-red-400" },
      { label: "Content Safety", href: "/admin/safety", icon: Shield },
      { label: "Audit Logs", href: "/admin/audit-logs", icon: ScrollText },
      { label: "Settings", href: "/admin/settings", icon: Settings, section: "System" },
      { label: "AI Settings", href: "/admin/ai/settings", icon: Sparkles },
    ];
  }

  const homeHref = ["student","prefect"].includes(normalizedRole) ? "/" : normalizedRole === "teacher" ? "/teacher" : ["manager","senior_manager"].includes(normalizedRole) ? "/manager" : "/admin";

  const NavLinks = ({ onNav }: { onNav?: () => void }) => {
    let lastSection: string | undefined;
    return (
      <div className="space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            location === item.href ||
            (item.href !== "/" && item.href !== "/teacher" && item.href !== "/admin" && item.href !== "/manager" && location.startsWith(item.href));

          const sectionEl = item.section && item.section !== lastSection ? (
            <p key={`s-${item.section}`} className="text-[10px] font-semibold uppercase tracking-widest text-white/25 px-3 pt-4 pb-1">
              {item.section}
            </p>
          ) : null;
          lastSection = item.section ?? lastSection;

          return (
            <div key={item.href}>
              {sectionEl}
              <Link href={item.href} onClick={onNav}>
                <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group ${isActive ? "bg-white/15 text-white shadow-sm" : "text-white/60 hover:text-white hover:bg-white/10"}`}>
                  <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-white" : item.accent ? item.accent + " opacity-80" : "text-white/50 group-hover:text-white/80"}`} />
                  <span className="truncate">{item.label}</span>
                  {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white/80 shrink-0" />}
                </div>
              </Link>
            </div>
          );
        })}
      </div>
    );
  };

  const SidebarContent = ({ onNav }: { onNav?: () => void }) => (
    <div className="flex flex-col h-full bg-gradient-to-b from-[#0a1628] via-[#0d1e38] to-[#0a1628]">
      <div className="px-5 pt-6 pb-4">
        <Link href={homeHref}>
          <div className="flex items-center gap-2.5 cursor-pointer group">
            <div className="bg-gradient-to-br from-amber-400 to-amber-600 p-2 rounded-xl shadow-lg group-hover:shadow-amber-500/30 transition-shadow">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="text-white font-bold text-lg leading-none tracking-tight font-serif block">Dallyletter</span>
              <span className="text-amber-400/80 text-[10px] uppercase tracking-widest font-medium">Elidems</span>
            </div>
          </div>
        </Link>
      </div>

      <div className="mx-4 mb-4">
        <div className="bg-white/8 border border-white/10 rounded-xl p-3 flex items-center gap-3">
          <Link href="/profile-hub" aria-label="Open your Profile Hub" title="Open your Profile Hub" className={`h-10 w-10 overflow-hidden rounded-xl bg-gradient-to-br ${roleColors[normalizedRole] || "from-slate-600 to-slate-800"} flex items-center justify-center text-white font-bold text-base shadow-lg shrink-0 ring-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300`}>
            {user.avatarUrl ? <AuthenticatedAvatar url={user.avatarUrl} name={user.name} /> : user.name.charAt(0).toUpperCase()}
          </Link>
          <div className="flex-1 min-w-0">
            <Link href="/profile-hub" className="block text-sm font-semibold text-white truncate hover:text-amber-200 focus-visible:underline">{user.name}</Link>
            <div className="flex items-center justify-between gap-2"><ProfileImageUpload /><Link href="/profile-hub" aria-label="More profile actions" title="Open Profile Hub" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/75 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"><EllipsisVertical className="h-5 w-5" /></Link></div>
            <PushDeliveryTest />
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-xs text-white/50">{roleLabels[normalizedRole] || user.role}</span>
              {user.isPrefect && (
                <span className="inline-flex items-center text-[9px] font-bold bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full border border-amber-500/30">
                  <Shield className="w-2.5 h-2.5 mr-0.5" />PREFECT
                </span>
              )}
              {(user as any).isManager && (
                <span className="inline-flex items-center text-[9px] font-bold bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full border border-purple-500/30">
                  <Briefcase className="w-2.5 h-2.5 mr-0.5" />MGR
                </span>
              )}
            </div>
            {["student","prefect"].includes(String(user.role||"").toLowerCase().replace(/[ -]+/g,"_")) && (user as any).performanceScore != null && (
              <div className="flex items-center gap-1 mt-1">
                <Flame className="h-2.5 w-2.5 text-orange-400" />
                <span className="text-[9px] text-white/40">{(user as any).streakDays ?? 0}d · </span>
                <Star className="h-2.5 w-2.5 text-amber-400" />
                <span className="text-[9px] text-white/40">{(user as any).performanceScore ?? 0} pts</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 scrollbar-none">
        <NavLinks onNav={onNav} />
      </nav>

      <div className="p-4 mt-2">
        <div className="border-t border-white/10 pt-4">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/50 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150">
            <LogOut className="h-4 w-4 shrink-0" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <SystemNotificationBridge />
      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b bg-[#0a1628] sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <div className="bg-gradient-to-br from-amber-400 to-amber-600 p-1.5 rounded-lg">
            <GraduationCap className="h-4 w-4 text-white" />
          </div>
          <span className="text-white font-bold font-serif text-lg">Dallyletter</span>
        </div>
        <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-white/70 hover:text-white hover:bg-white/10">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 border-0">
            <SidebarContent onNav={() => setIsMobileOpen(false)} />
          </SheetContent>
        </Sheet>
      </header>

      <aside className="hidden md:block w-64 h-screen sticky top-0 shrink-0 shadow-2xl shadow-black/30">
        <SidebarContent />
      </aside>

      <main className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full overflow-y-auto bg-slate-50 dark:bg-background">
          <div className="max-w-6xl mx-auto p-4 md:p-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
