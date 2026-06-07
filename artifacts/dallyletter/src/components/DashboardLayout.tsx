import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useLogoutUser } from "@workspace/api-client-react";
import {
  BookOpen,
  Users,
  Video,
  MessageSquare,
  CreditCard,
  Bell,
  LogOut,
  Home,
  Shield,
  Menu,
  GraduationCap,
  Settings,
} from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const roleColors: Record<string, string> = {
  student: "from-blue-600 to-blue-800",
  teacher: "from-emerald-600 to-emerald-800",
  owner: "from-amber-600 to-amber-800",
};

const roleLabels: Record<string, string> = {
  student: "Learner",
  teacher: "Educator",
  owner: "Administrator",
};

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const logoutMutation = useLogoutUser();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  if (!user) return null;

  const handleLogout = () => {
    logoutMutation.mutate(undefined, { onSettled: () => logout() });
  };

  let navItems: NavItem[] = [];

  if (user.role === "student") {
    navItems = [
      { label: "Dashboard", href: "/", icon: Home },
      { label: "Lessons", href: "/student/lessons", icon: BookOpen },
      { label: "Live Classes", href: "/student/classes", icon: Video },
      { label: "Study Groups", href: "/student/study-groups", icon: Users },
      { label: "Chat", href: "/student/chat", icon: MessageSquare },
      { label: "Payments", href: "/student/payments", icon: CreditCard },
      { label: "Notifications", href: "/student/notifications", icon: Bell },
    ];
  } else if (user.role === "teacher") {
    navItems = [
      { label: "Dashboard", href: "/teacher", icon: Home },
      { label: "My Lessons", href: "/teacher/lessons", icon: BookOpen },
      { label: "My Classes", href: "/teacher/classes", icon: Video },
      { label: "Chat", href: "/teacher/chat", icon: MessageSquare },
      { label: "Student Payments", href: "/teacher/payments", icon: CreditCard },
    ];
  } else if (user.role === "owner") {
    navItems = [
      { label: "Overview", href: "/admin", icon: Home },
      { label: "Users", href: "/admin/users", icon: Users },
      { label: "All Lessons", href: "/admin/lessons", icon: BookOpen },
      { label: "All Classes", href: "/admin/classes", icon: Video },
      { label: "Payments", href: "/admin/payments", icon: CreditCard },
      { label: "Chat", href: "/admin/chat", icon: MessageSquare },
      { label: "Notifications", href: "/admin/notifications", icon: Bell },
      { label: "Settings", href: "/admin/settings", icon: Settings },
    ];
  }

  const homeHref = user.role === "student" ? "/" : user.role === "teacher" ? "/teacher" : "/admin";

  const NavLinks = ({ onNav }: { onNav?: () => void }) => (
    <div className="space-y-0.5">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          location === item.href ||
          (item.href !== "/" && item.href !== "/teacher" && item.href !== "/admin" && location.startsWith(item.href));
        return (
          <Link key={item.href} href={item.href} onClick={onNav}>
            <div
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group ${
                isActive
                  ? "bg-white/15 text-white shadow-sm"
                  : "text-white/60 hover:text-white hover:bg-white/10"
              }`}
            >
              <Icon className={`h-4.5 w-4.5 shrink-0 ${isActive ? "text-white" : "text-white/50 group-hover:text-white/80"}`} />
              <span>{item.label}</span>
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white/80" />
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );

  const SidebarContent = ({ onNav }: { onNav?: () => void }) => (
    <div className="flex flex-col h-full bg-gradient-to-b from-[#0a1628] via-[#0d1e38] to-[#0a1628]">
      {/* Brand */}
      <div className="px-5 pt-6 pb-4">
        <Link href={homeHref}>
          <div className="flex items-center gap-2.5 cursor-pointer group">
            <div className="bg-gradient-to-br from-amber-400 to-amber-600 p-2 rounded-xl shadow-lg group-hover:shadow-amber-500/30 transition-shadow">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="text-white font-bold text-lg leading-none tracking-tight font-serif block">
                Dallyletter
              </span>
              <span className="text-amber-400/80 text-[10px] uppercase tracking-widest font-medium">
                Elidems
              </span>
            </div>
          </div>
        </Link>
      </div>

      {/* User Profile Card */}
      <div className="mx-4 mb-5">
        <div className="bg-white/8 border border-white/10 rounded-xl p-3 flex items-center gap-3">
          <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${roleColors[user.role] || "from-slate-600 to-slate-800"} flex items-center justify-center text-white font-bold text-base shadow-lg shrink-0`}>
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover rounded-xl" />
            ) : (
              user.name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{user.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs text-white/50">{roleLabels[user.role] || user.role}</span>
              {user.isPrefect && (
                <span className="inline-flex items-center text-[9px] font-bold bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full border border-amber-500/30">
                  <Shield className="w-2.5 h-2.5 mr-0.5" />
                  PREFECT
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Divider label */}
      <div className="px-5 mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Navigation</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-4">
        <NavLinks onNav={onNav} />
      </nav>

      {/* Footer */}
      <div className="p-4 mt-4">
        <div className="border-t border-white/10 pt-4">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/50 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile Header */}
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

      {/* Desktop Sidebar */}
      <aside className="hidden md:block w-64 h-screen sticky top-0 shrink-0 shadow-2xl shadow-black/30">
        <SidebarContent />
      </aside>

      {/* Main Content */}
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
