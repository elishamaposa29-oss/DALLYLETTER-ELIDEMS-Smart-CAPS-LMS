import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { getApiUrl } from "@workspace/api-client-react";

export default function ResetPassword() {
  const [,setLocation]=useLocation();
  const token=typeof window!=="undefined"?new URLSearchParams(window.location.search).get("token")||"":"";
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setMessage("");setError("");
    if(!/^[a-f0-9]{64}$/i.test(token)){setError("This reset link is missing or invalid. Request a new link.");return;}
    if(password.length<8){setError("Use at least 8 characters for your new password.");return;}
    if(password!==confirm){setError("The passwords do not match.");return;}
    setBusy(true);
    try{
      const response=await fetch(getApiUrl("/api/auth/password-reset/confirm"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token,newPassword:password})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||"This reset link could not be used.");
      setMessage(data.message||"Password reset successfully. Sign in with your new password.");
    }catch(e){setError(e instanceof Error?e.message:"Please request a new reset link and try again.");}
    finally{setBusy(false);}
  }
  return <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12"><section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
    <Link href="/login" className="text-sm font-semibold text-slate-700 hover:underline">← Back to sign in</Link>
    <div className="mt-8 mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-xl">🛡️</div>
    <h1 className="text-2xl font-bold text-slate-900">Choose a new password</h1>
    <p className="mt-2 mb-6 text-sm leading-6 text-slate-600">Reset links expire after 30 minutes and can only be used once.</p>
    {message?<div><p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{message}</p><button onClick={()=>setLocation("/login")} className="mt-4 h-11 w-full rounded-lg bg-[#0a1628] font-semibold text-white">Go to sign in</button></div>:<form onSubmit={submit} className="space-y-4">
      <label className="block text-sm font-semibold text-slate-700">New password<input type="password" required autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-slate-700" placeholder="At least 8 characters"/></label>
      <label className="block text-sm font-semibold text-slate-700">Confirm new password<input type="password" required autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-slate-700" placeholder="Re-enter password"/></label>
      {error?<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>:null}
      <button disabled={busy} className="h-11 w-full rounded-lg bg-[#0a1628] font-semibold text-white disabled:opacity-60">{busy?"Updating…":"Update password"}</button>
    </form>}
  </section></main>;
}
