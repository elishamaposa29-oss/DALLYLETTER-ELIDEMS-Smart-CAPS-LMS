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
  Menu
} from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const logoutMutation = useLogoutUser();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  if (!user) return null;

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        logout();
      }
    });
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
    ];
  }

  const NavLinks = () => (
    <div className="space-y-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = location === item.href || (item.href !== "/" && item.href !== "/teacher" && item.href !== "/admin" && location.startsWith(item.href));
        return (
          <Link key={item.href} href={item.href}>
            <div className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
              isActive 
                ? "bg-primary text-primary-foreground" 
                : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            }`}>
              <Icon className="h-5 w-5" />
              {item.label}
            </div>
          </Link>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between p-4 border-b bg-card">
        <div className="flex items-center gap-2 text-primary font-serif font-bold text-xl">
          <BookOpen className="h-6 w-6" />
          <span>Dallyletter</span>
        </div>
        <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 flex flex-col bg-sidebar">
            <div className="p-4 border-b border-sidebar-border">
              <div className="flex items-center gap-2 text-sidebar-primary font-serif font-bold text-xl">
                <BookOpen className="h-6 w-6" />
                <span>Dallyletter</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto py-4 px-3">
              <NavLinks />
            </div>
            <div className="p-4 border-t border-sidebar-border">
              <Button variant="outline" className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
                Log Out
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar border-r border-sidebar-border h-screen sticky top-0">
        <div className="p-6">
          <Link href={user.role === "student" ? "/" : user.role === "teacher" ? "/teacher" : "/admin"}>
            <div className="flex items-center gap-2 text-sidebar-primary font-serif font-bold text-2xl cursor-pointer">
              <div className="bg-primary text-primary-foreground p-1.5 rounded-lg">
                <BookOpen className="h-6 w-6" />
              </div>
              <span>Dallyletter</span>
            </div>
          </Link>
        </div>

        <div className="px-6 pb-6">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-sidebar-accent/50 border border-sidebar-border">
            <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold overflow-hidden">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
              ) : (
                user.name.charAt(0).toUpperCase()
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate text-sidebar-foreground">{user.name}</p>
              <div className="flex items-center gap-1.5">
                <p className="text-xs text-sidebar-foreground/60 capitalize truncate">{user.role}</p>
                {user.isPrefect && (
                  <span className="inline-flex items-center text-[10px] font-medium bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded-full">
                    <Shield className="w-3 h-3 mr-0.5" />
                    Prefect
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-2">
          <NavLinks />
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <Button variant="ghost" className="w-full justify-start gap-2 text-sidebar-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Log Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto bg-background p-4 md:p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
