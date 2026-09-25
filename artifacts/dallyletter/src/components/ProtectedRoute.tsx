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
        const role = String(user.role);

        if (allowedRoles && !allowedRoles.includes(role) && !(role === "admin" && allowedRoles.includes("owner"))) {
          if (role === "student") setLocation("/");
          else if (role === "teacher") setLocation("/teacher");
          else if (role === "owner" || role === "admin") setLocation("/admin");
        } else if (user.isBlocked) {
          setLocation("/suspended");
        }
      }
    }
  }, [user, isLoading, allowedRoles, setLocation]);

  const role = user ? String(user.role) : undefined;
  const hasAllowedRole =
    !allowedRoles ||
    (role !== undefined &&
      (allowedRoles.includes(role) || (role === "admin" && allowedRoles.includes("owner"))));

  if (isLoading || !user || !hasAllowedRole || user.isBlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
