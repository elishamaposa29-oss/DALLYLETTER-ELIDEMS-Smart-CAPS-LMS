import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl } from "@workspace/api-client-react";
import { useLocation } from "wouter";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void;
          renderButton: (element: HTMLElement, options: Record<string, string | number | boolean>) => void;
        };
      };
    };
  }
}

export default function GoogleSignInButton() {
  const buttonRef = useRef<HTMLDivElement>(null);
  const handlers = useRef({ login: useAuth, toast: useToast });
  const auth = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const clientId = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();
  handlers.current = { login: auth.login, toast };

  useEffect(() => {
    if (!clientId || !buttonRef.current) return;
    let mounted = true;
    const render = () => {
      if (!mounted || !window.google || !buttonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          void (async () => {
            try {
              const result = await fetch(getApiUrl("/api/auth/google"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ credential: response.credential }),
              });
              const data = await result.json().catch(() => ({}));
              if (!result.ok || !data.token || !data.user) throw new Error(data.error || "Google sign-in failed.");
              handlers.current.login(data.token, data.user);
              const role = String(data.user.role || "").toLowerCase().replace(/[ -]+/g, "_");
              if (role === "owner" || role === "admin") setLocation("/admin");
              else if (role === "teacher") setLocation("/teacher");
              else if (["manager", "senior_manager"].includes(role)) setLocation("/manager");
              else setLocation("/");
            } catch (error) {
              handlers.current.toast({
                variant: "destructive",
                title: "Google sign-in failed",
                description: error instanceof Error ? error.message : "Please try again.",
              });
            }
          })();
        },
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        width: Math.min(360, Math.max(260, buttonRef.current.clientWidth || 320)),
        logo_alignment: "left",
      });
    };
    const existing = document.getElementById("google-identity-services") as HTMLScriptElement | null;
    if (window.google) render();
    else if (existing) existing.addEventListener("load", render, { once: true });
    else {
      const script = document.createElement("script");
      script.id = "google-identity-services";
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", render, { once: true });
      script.addEventListener("error", () => handlers.current.toast({
        variant: "destructive",
        title: "Google sign-in unavailable",
        description: "Could not load Google's sign-in service.",
      }), { once: true });
      document.head.appendChild(script);
    }
    return () => { mounted = false; };
  }, [clientId, setLocation]);

  if (!clientId) {
    return <div className="space-y-2"><button type="button" disabled className="h-11 w-full rounded-lg border border-slate-300 bg-white font-semibold text-slate-500 opacity-80">Continue with Google</button><p role="status" className="text-xs text-slate-500">Google sign-in needs VITE_GOOGLE_CLIENT_ID on the web deployment and GOOGLE_CLIENT_ID on the API.</p></div>;
  }
  return <div ref={buttonRef} className="flex min-h-11 w-full justify-center" aria-label="Continue with Google" />;
}
