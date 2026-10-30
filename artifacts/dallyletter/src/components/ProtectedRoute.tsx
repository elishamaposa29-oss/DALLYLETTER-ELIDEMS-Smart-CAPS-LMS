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
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        setLocation("/login");
      } else {
        // The generated API role model is student/teacher/owner.
        // Keep the existing legacy "admin" compatibility at the runtime boundary
        // without adding an unsupported role to the generated frontend type.
        const role = String(user.role).toLowerCase().replace(/[ -]+/g, "_");

        if (allowedRoles && !allowedRoles.includes(role) && !((["admin","platform_owner"].includes(role)) && allowedRoles.includes("owner")) && !(allowManagerStaff && role === "teacher" && user.isManager === true)) {
          if (role === "student" || role === "prefect") setLocation("/");
          else if (role === "teacher") setLocation("/teacher");
          else if (["manager","senior_manager"].includes(role)) setLocation("/manager");
          else if (["owner","admin","platform_owner"].includes(role)) setLocation("/admin");
        } else if (user.isBlocked) {
          setLocation("/suspended");
        }
      }
    }
  }, [user, isLoading, allowedRoles, allowManagerStaff, setLocation]);

  const role = user ? String(user.role).toLowerCase().replace(/[ -]+/g, "_") : undefined;
  const hasAllowedRole =
    !allowedRoles ||
    (role !== undefined &&
      (allowedRoles.includes(role) || (["admin","platform_owner"].includes(role) && allowedRoles.includes("owner")) || (allowManagerStaff && role === "teacher" && user?.isManager === true)));

  if (isLoading || !user || !hasAllowedRole || user.isBlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
