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
      if(!response.ok)throw new Error(data.error||"The password could not be updated. Your existing password remains unchanged.");
      setMessage(data.message||"Password reset successfully. Sign in with your new password.");
      setPassword("");setConfirm("");
    }catch(e){setError(e instanceof Error?e.message:"The password update failed. Your existing password remains unchanged.");}
    finally{setBusy(false);}
  }
  return <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-4 py-10"><section className="w-full max-w-md overflow-hidden rounded-3xl border border-white/15 bg-white shadow-2xl">
    <header className="bg-gradient-to-r from-[#0a1628] to-indigo-900 px-7 py-6 text-white"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-xl font-black">D</div><div><p className="font-bold tracking-wide">Dallyletter Elidems</p><p className="text-xs text-white/70">Secure password update</p></div></div></header>
    <div className="p-7 sm:p-8"><Link href="/login" className="text-sm font-semibold text-slate-600 hover:text-indigo-700">← Back to sign in</Link>
      <div className="mt-6 mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-2xl">🛡️</div><h1 className="text-2xl font-bold tracking-tight text-slate-900">Choose a new password</h1><p className="mt-2 mb-6 text-sm leading-6 text-slate-600">Your new password is saved before success is shown. The reset link expires after 30 minutes and can be used once.</p>
      {message?<div><div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><p className="font-bold">✓ Password updated</p><p className="mt-1">{message}</p><p className="mt-2">Use your new password on the next sign-in. Your old password should no longer work, and existing sessions have been signed out.</p></div><button onClick={()=>setLocation("/login")} className="mt-4 h-12 w-full rounded-xl bg-indigo-700 font-semibold text-white shadow-lg transition hover:bg-indigo-800">Continue to sign in</button></div>:<form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-semibold text-slate-700">New password<input type="password" required autoComplete="new-password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-3 font-normal outline-none transition focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100" placeholder="At least 8 characters"/></label>
        <label className="block text-sm font-semibold text-slate-700">Confirm new password<input type="password" required autoComplete="new-password" minLength={8} value={confirm} onChange={e=>setConfirm(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-3 font-normal outline-none transition focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100" placeholder="Re-enter password"/></label>
        {busy&&<div role="status" className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-800"><span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-indigo-700 border-t-transparent align-middle"/>Saving password securely…</div>}
        {error&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><p className="font-bold">✕ Password not changed</p><p className="mt-1">{error}</p></div>}
        <button disabled={busy} className="h-12 w-full rounded-xl bg-indigo-700 font-semibold text-white shadow-lg transition hover:bg-indigo-800 disabled:cursor-wait disabled:opacity-60">{busy?"Saving securely…":"Save new password"}</button>
      </form>}
    </div>
  </section></main>;
}
