import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { useEffect } from "react";

export function ProtectedRoute({
  children,
  allowedRoles
}: {
  children: React.ReactNode;
  allowedRoles?: string[];
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
        const rawRole = String(user.role).toLowerCase().replace(/[ -]+/g, "_");
        const role = rawRole === "jnr_manager" ? "junior_manager" : rawRole === "snr_manager" ? "senior_manager" : rawRole;

        if (allowedRoles && !allowedRoles.includes(role) && !((["admin","platform_owner"].includes(role)) && allowedRoles.includes("owner"))) {
          if (role === "student" || role === "prefect") setLocation("/");
          else if (role === "teacher") setLocation("/teacher");
          else if (["manager","junior_manager","senior_manager"].includes(role)) setLocation("/manager");
          else if (["owner","admin","platform_owner"].includes(role)) setLocation("/admin");
        } else if (user.isBlocked) {
          setLocation("/suspended");
        }
      }
    }
  }, [user, isLoading, allowedRoles, setLocation]);

  const rawRole = user ? String(user.role).toLowerCase().replace(/[ -]+/g, "_") : undefined;
  const role = rawRole === "jnr_manager" ? "junior_manager" : rawRole === "snr_manager" ? "senior_manager" : rawRole;
  const hasAllowedRole =
    !allowedRoles ||
    (role !== undefined &&
      (allowedRoles.includes(role) || (["admin","platform_owner"].includes(role) && allowedRoles.includes("owner"))));

  if (isLoading || !user || !hasAllowedRole || user.isBlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
