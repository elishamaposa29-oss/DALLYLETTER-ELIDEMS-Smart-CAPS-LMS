import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { getApiUrl } from "@workspace/api-client-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); setError("");
    const normalized = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) { setError("Enter an email address in the format name@example.com."); return; }
    setBusy(true); setStartedAt(Date.now());
    try {
      const response = await fetch(getApiUrl("/api/auth/password-reset/request"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: normalized }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "We couldn't send the recovery email. Please try again.");
      setMessage(data.message || "If an account matches that email, recovery instructions will be sent.");
    } catch (e) { setError(e instanceof Error ? e.message : "Email sending failed. Check your connection and try again."); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-4 py-10">
    <section className="w-full max-w-md overflow-hidden rounded-3xl border border-white/15 bg-white shadow-2xl">
      <header className="bg-gradient-to-r from-[#0a1628] to-indigo-900 px-7 py-6 text-white"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-xl font-black">D</div><div><p className="font-bold tracking-wide">Dallyletter Elidems</p><p className="text-xs text-white/70">Secure account recovery</p></div></div></header>
      <div className="p-7 sm:p-8"><Link href="/login" className="text-sm font-semibold text-slate-600 hover:text-indigo-700">← Back to sign in</Link>
        <div className="mt-6 mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-2xl">🔐</div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reset your password</h1>
        <p className="mt-2 mb-6 text-sm leading-6 text-slate-600">Enter the email on your account or a previously verified recovery email. We'll show you the sending result here.</p>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-semibold text-slate-700">Email address<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-3 font-normal outline-none transition focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100" placeholder="you@example.com" /></label>
          {busy && <div role="status" className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-800"><span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-indigo-700 border-t-transparent align-middle"/>Sending recovery email… Please keep this page open.</div>}
          {message && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><p className="font-bold">✓ Request accepted</p><p className="mt-1">{message}</p><p className="mt-2 text-xs text-emerald-800">Check your inbox and spam folder. The link expires after 30 minutes and can be used once. If no email arrives, request again or contact support.</p>{startedAt!==null&&<p className="mt-2 text-xs text-emerald-700">Request completed in {((Date.now()-startedAt)/1000).toFixed(1)} seconds.</p>}</div>}
          {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><p className="font-bold">✕ Email could not be sent</p><p className="mt-1">{error}</p><p className="mt-2 text-xs">No password was changed. Check the address or try again later.</p></div>}
          <button disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 font-semibold text-white shadow-lg shadow-indigo-900/20 transition hover:bg-indigo-800 disabled:cursor-wait disabled:opacity-60">{busy?"Sending…":"Send recovery link"}</button>
        </form>
        <p className="mt-5 text-center text-xs text-slate-500">For your security, a request does not change your password. It changes only after you open the link and save a new password.</p>
      </div>
    </section>
  </main>;
}
