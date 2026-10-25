import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { getApiUrl } from "@workspace/api-client-react";

export default function ForgotPassword() {
  const [email,setEmail]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setMessage("");setError("");
    const normalized=email.trim().toLowerCase();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)){setError("Enter a valid email address.");return;}
    setBusy(true);
    try{
      const response=await fetch(getApiUrl("/api/auth/password-reset/request"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:normalized})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||"Password recovery is temporarily unavailable.");
      setMessage(data.message||"If an account matches that email, recovery instructions will be sent.");
    }catch(e){setError(e instanceof Error?e.message:"Please try again later.");}
    finally{setBusy(false);}
  }
  return <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12"><section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
    <Link href="/login" className="text-sm font-semibold text-slate-700 hover:underline">← Back to sign in</Link>
    <div className="mt-8 mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-xl">🔐</div>
    <h1 className="text-2xl font-bold text-slate-900">Reset your password</h1>
    <p className="mt-2 mb-6 text-sm leading-6 text-slate-600">Enter the email address on your account. If it matches an account, we’ll send a secure reset link.</p>
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm font-semibold text-slate-700">Email address<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-slate-700" placeholder="you@example.com"/></label>
      {message?<p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{message}</p>:null}
      {error?<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>:null}
      <button disabled={busy} className="h-11 w-full rounded-lg bg-[#0a1628] font-semibold text-white disabled:opacity-60">{busy?"Sending…":"Send reset link"}</button>
    </form>
  </section></main>;
}
