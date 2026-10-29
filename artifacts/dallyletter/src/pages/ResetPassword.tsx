import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { getApiUrl } from "@workspace/api-client-react";

export default function ResetPassword() {
  const [,setLocation]=useLocation();
  const token=typeof window!=="undefined"?new URLSearchParams(window.location.search).get("token")||"":"";
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [securityAnswer,setSecurityAnswer]=useState("");
  const [securityQuestion,setSecurityQuestion]=useState("");
  const [requiresSecurityAnswer,setRequiresSecurityAnswer]=useState(false);
  const [detailsLoading,setDetailsLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    if(!/^[a-f0-9]{64}$/i.test(token)){setDetailsLoading(false);setError("This reset link is missing or invalid. Request a new link.");return;}
    fetch(getApiUrl("/api/auth/password-reset/details?token="+encodeURIComponent(token)))
      .then(async response=>{const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"This reset link is invalid or expired.");return data;})
      .then(data=>{if(!active)return;setRequiresSecurityAnswer(Boolean(data.requiresSecurityAnswer));setSecurityQuestion(String(data.securityQuestion||""));})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:"Could not validate this reset link.");})
      .finally(()=>{if(active)setDetailsLoading(false);});
    return()=>{active=false;};
  },[token]);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setMessage("");setError("");
    if(!/^[a-f0-9]{64}$/i.test(token)){setError("This reset link is missing or invalid. Request a new link.");return;}
    if(password.length<8){setError("Use at least 8 characters for your new password.");return;}
    if(password.length>256){setError("Your password must be 256 characters or fewer.");return;}
    if(password!==confirm){setError("The passwords do not match.");return;}
    if(requiresSecurityAnswer&&!securityAnswer.trim()){setError("Answer your saved security question to continue backup-email recovery.");return;}
    setBusy(true);
    try{
      const response=await fetch(getApiUrl("/api/auth/password-reset/confirm"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token,newPassword:password,securityAnswer})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||"Dallyletter could not confirm the password change.");
      setMessage(data.message||"Password reset successfully. Sign in with your new password.");
      setPassword("");setConfirm("");setSecurityAnswer("");
    }catch(e){setError(e instanceof Error?e.message:"Dallyletter could not save your new password. Please request a fresh link and try again.");}
    finally{setBusy(false);}
  }
  return <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12"><section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xl">
    <Link href="/login" className="text-sm font-semibold text-slate-700 hover:underline">← Back to sign in</Link>
    <div className="mt-7 mb-5 flex items-center gap-3"><div className={"flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0A1931] text-lg font-black text-[#FFF8E1] "+(busy?"animate-pulse":"")}>D</div><div><p className="font-bold text-slate-900">Dallyletter Elidems</p><p className="text-xs text-slate-500">Secure account recovery</p></div></div>
    <h1 className="text-2xl font-bold text-slate-900">Choose a new password</h1>
    <p className="mt-2 mb-6 text-sm leading-6 text-slate-600">Your reset link expires after 30 minutes and can only be used once. Dallyletter verifies that the new password was saved before reporting success.</p>
    {message?<div><div role="status" aria-live="polite" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><div className="flex items-center gap-2 font-bold"><span aria-hidden="true">✓</span>Password update confirmed</div><p className="mt-2">{message}</p><p className="mt-2">Next, sign in with the new password. Your previous sessions have been revoked.</p></div><button onClick={()=>setLocation("/login")} className="mt-4 h-11 w-full rounded-lg bg-[#0a1628] font-semibold text-white">Continue to sign in</button></div>:<form onSubmit={submit} className="space-y-4">
      {requiresSecurityAnswer&&<div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-semibold text-amber-950">Backup-email security check</p><p className="text-sm text-amber-900">{securityQuestion||"Answer the security question you created in Profile Hub."}</p><label className="block text-sm font-semibold text-slate-700">Your answer<input type="text" autoComplete="off" value={securityAnswer} onChange={e=>setSecurityAnswer(e.target.value)} disabled={busy||detailsLoading} className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-slate-700 disabled:opacity-60" placeholder="Your saved answer"/></label></div>}
      {detailsLoading&&<div role="status" className="flex items-center gap-3 rounded-lg border p-3 text-sm text-slate-700"><span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-slate-800"/>Checking reset link…</div>}
      <label className="block text-sm font-semibold text-slate-700">New password<input type="password" required minLength={8} maxLength={256} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} disabled={busy} className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-slate-700 disabled:opacity-60" placeholder="At least 8 characters"/></label>
      <label className="block text-sm font-semibold text-slate-700">Confirm new password<input type="password" required minLength={8} maxLength={256} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} disabled={busy} className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-slate-700 disabled:opacity-60" placeholder="Enter the same password again"/></label>
      {busy&&<div role="status" aria-live="polite" className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-800"/><span>Updating and verifying your password…</span></div>}
      {error&&<div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><p className="font-semibold">Password not confirmed</p><p className="mt-1">{error}</p></div>}
      <button disabled={busy||detailsLoading} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#0a1628] font-semibold text-white disabled:cursor-wait disabled:opacity-60">{busy?<><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"/>Updating…</>:"Update password"}</button>
    </form>}
  </section></main>;
}
