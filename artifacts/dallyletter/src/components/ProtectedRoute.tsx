import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { useEffect } from "react";

export function ProtectedRoute({
  children,
  allowedRoles,
  allowManagerStaff = false
}: {
  children: React.ReactNode;
  allowedRoles?: string[];
  allowManagerStaff?: boolean;
}) {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();
  const restrictedTeacher = String(user?.role || "").toLowerCase() === "teacher" && ["draft","pending_review","rejected_pending_conversion"].includes(String((user as any)?.teacherApplicationStatus || "").toLowerCase());
  const restrictedTeacherAllowed = location === "/profile-hub" || location.startsWith("/profile/") || location === "/teacher/qualifications" || location === "/teacher/chat";

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        setLocation(`/login?next=${encodeURIComponent(location)}`);
      } else if (restrictedTeacher && !restrictedTeacherAllowed) {
        setLocation("/profile-hub");
      } else {
        // The generated API role model is student/teacher/owner.
        // Keep only the legacy platform_owner alias at the runtime boundary.
        const role = String(user.role).toLowerCase().replace(/[ -]+/g, "_");

        if (allowedRoles && !allowedRoles.includes(role) && !((["platform_owner"].includes(role)) && allowedRoles.includes("owner")) && !(allowManagerStaff && role === "teacher" && user.isManager === true) && !(role === "junior_manager" && allowedRoles.some(value => ["manager","senior_manager"].includes(value)))) {
          if (role === "student" || role === "prefect") setLocation("/");
          else if (role === "teacher") setLocation("/teacher");
          else if (["manager","senior_manager","junior_manager"].includes(role)) setLocation("/manager");
          else if (["owner","platform_owner"].includes(role)) setLocation("/admin");
          else if (role === "admin") setLocation("/features");
        } else if (user.isBlocked) {
          setLocation("/suspended");
        }
      }
    }
  }, [user, isLoading, allowedRoles, allowManagerStaff, setLocation, restrictedTeacher, restrictedTeacherAllowed]);

  const role = user ? String(user.role).toLowerCase().replace(/[ -]+/g, "_") : undefined;
  const hasAllowedRole =
    !allowedRoles ||
    (role !== undefined &&
      (allowedRoles.includes(role) || (["platform_owner"].includes(role) && allowedRoles.includes("owner")) || (allowManagerStaff && role === "teacher" && user?.isManager === true) || (role === "junior_manager" && allowedRoles.some(value => ["manager","senior_manager"].includes(value)))));

  if (isLoading || !user || !hasAllowedRole || user.isBlocked || (restrictedTeacher && !restrictedTeacherAllowed)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
