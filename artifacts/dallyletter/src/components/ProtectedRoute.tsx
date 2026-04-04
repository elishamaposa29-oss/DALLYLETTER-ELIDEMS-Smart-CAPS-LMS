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
      } else if (allowedRoles && !allowedRoles.includes(user.role)) {
        // Redirect to their respective dashboard
        if (user.role === "student") setLocation("/");
        else if (user.role === "teacher") setLocation("/teacher");
        else if (user.role === "owner") setLocation("/admin");
      } else if (user.isBlocked) {
        setLocation("/suspended");
      }
    }
  }, [user, isLoading, allowedRoles, setLocation]);

  if (isLoading || !user || (allowedRoles && !allowedRoles.includes(user.role)) || user.isBlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
