import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { getApiUrl } from "@workspace/api-client-react";

export default function ForgotPassword() {
  const [email,setEmail]=useState("");
  const [busy,setBusy]=useState(false);
  const [elapsed,setElapsed]=useState(0);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setMessage("");setError("");setElapsed(0);
    const normalized=email.trim().toLowerCase();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)){setError("Enter an email address in the correct format.");return;}
    setBusy(true);
    const started=Date.now();
    const timer=window.setInterval(()=>setElapsed(Math.floor((Date.now()-started)/1000)),250);
    try{
      const response=await fetch(getApiUrl("/api/auth/password-reset/request"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:normalized})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||"Dallyletter could not send the recovery email. Please try again.");
      setMessage(data.message||"If an account matches that email, recovery instructions will be sent.");
    }catch(e){setError(e instanceof Error?e.message:"Dallyletter could not contact the email service. Please try again.");}
    finally{window.clearInterval(timer);setElapsed(Math.floor((Date.now()-started)/1000));setBusy(false);}
  }
  return <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12"><section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xl">
    <Link href="/login" className="text-sm font-semibold text-slate-700 hover:underline">← Back to sign in</Link>
    <div className="mt-7 mb-5 flex items-center gap-3"><div className={"flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0A1931] text-lg font-black text-[#FFF8E1] "+(busy?"animate-pulse":"")}>D</div><div><p className="font-bold text-slate-900">Dallyletter Elidems</p><p className="text-xs text-slate-500">Secure account recovery</p></div></div>
    <h1 className="text-2xl font-bold text-slate-900">Reset your password</h1>
    <p className="mt-2 mb-6 text-sm leading-6 text-slate-600">Enter the email address on your account or a previously verified recovery email. Reset links expire after 30 minutes and work only once.</p>
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm font-semibold text-slate-700">Email address<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} disabled={busy} className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-slate-700 disabled:opacity-60" placeholder="you@example.com"/></label>
      {busy&&<div role="status" aria-live="polite" className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-800"/><span>Sending recovery request… {elapsed}s</span></div>}
      {message&&<div role="status" aria-live="polite" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><p className="font-semibold">Request accepted</p><p className="mt-1">{message}</p><p className="mt-1">Check your inbox and spam/junk folder. If no email arrives after a few minutes, try again or check the address.</p></div>}
      {error&&<div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><p className="font-semibold">Email could not be sent</p><p className="mt-1">{error}</p></div>}
      <button disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#0a1628] font-semibold text-white disabled:cursor-wait disabled:opacity-60">{busy?<><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"/>Sending…</>:"Send reset link"}</button>
      {!busy&&!message&&!error&&<p className="text-center text-xs text-slate-500">Dallyletter will show a clear error if the email service rejects the request.</p>}
    </form>
  </section></main>;
}
