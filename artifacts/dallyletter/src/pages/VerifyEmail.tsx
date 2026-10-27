import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { getApiUrl } from "@workspace/api-client-react";

export default function VerifyEmail() {
  const [location, setLocation] = useLocation();
  const [status, setStatus] = useState<"working" | "success" | "error">("working");
  const [message, setMessage] = useState("Confirming your email address…");
  useEffect(() => {
    const token = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("token") || "" : "";
    const endpoint = location.startsWith("/confirm-email-change")
      ? "/api/auth/email-change/confirm"
      : "/api/auth/email-verification/confirm";
    if (!/^[a-f0-9]{64}$/i.test(token)) {
      setStatus("error");
      setMessage("This confirmation link is missing or invalid. Sign in and request a fresh email.");
      return;
    }
    let active = true;
    fetch(getApiUrl(endpoint), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).then(async response => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "The confirmation link could not be used.");
      if (active) {
        setStatus("success");
        setMessage(data.message || "Email confirmed successfully.");
        if (endpoint === "/api/auth/email-change/confirm") window.history.replaceState({}, "", "/confirm-email-change");
      }
    }).catch(error => {
      if (active) {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Please request a new confirmation email.");
      }
    });
    return () => { active = false; };
  }, [location]);
  return <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
    <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-xl" aria-hidden="true">{status === "working" ? "…" : status === "success" ? "✓" : "!"}</div>
      <h1 className="text-2xl font-bold text-slate-900">{location.startsWith("/confirm-email-change") ? "Confirm email change" : "Verify your email"}</h1>
      <p role={status === "error" ? "alert" : "status"} className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
      <div className="mt-6 flex flex-col gap-3">
        <Link href="/login" className="rounded-lg bg-[#0a1628] px-4 py-3 text-center font-semibold text-white">Go to sign in</Link>
        {status === "error" && <button type="button" onClick={() => setLocation("/login")} className="text-sm underline">Return to sign in</button>}
      </div>
    </section>
  </main>;
}
