import { useEffect, useState } from "react";
import { getApiUrl } from "@workspace/api-client-react";
import { Copy, ExternalLink, ShieldCheck } from "lucide-react";

export function SchoolIdCard({ isOwner, role }: { isOwner: boolean; role?: string }) {
  const [schoolId,setSchoolId]=useState("");
  const [error,setError]=useState("");
  const [copied,setCopied]=useState(false);
  useEffect(()=>{
    if(!isOwner||!["student","learner"].includes(String(role||"").toLowerCase()))return;
    const token=localStorage.getItem("dallyletter_token");
    if(!token)return;
    let active=true;
    void fetch(getApiUrl("/api/school-id/me"),{headers:{Authorization:"Bearer "+token}})
      .then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"School ID unavailable");return d;})
      .then(d=>{if(active)setSchoolId(String(d.schoolId||""));})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:"School ID could not be loaded.");});
    return()=>{active=false;};
  },[isOwner,role]);
  if(!isOwner||!["student","learner"].includes(String(role||"").toLowerCase()))return null;
  const verifyUrl=typeof window!=="undefined"&&schoolId?window.location.origin+"/verify/school/"+encodeURIComponent(schoolId):"";
  return <section className="mb-5 rounded-xl border border-[#b38b00]/40 bg-gradient-to-r from-[#0f2a5a] to-[#173d78] p-4 text-white shadow-sm">
    <div className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="h-5 w-5 text-[#e6c45a]"/> Your Dallyletter School ID</div>
    <p className="mt-1 text-xs text-blue-100">A unique identity for sharing and verifying your published academic portfolio.</p>
    {schoolId?<><div className="mt-3 flex flex-wrap items-center gap-3"><strong className="font-mono text-xl tracking-widest text-[#ffe08a]">{schoolId}</strong><button type="button" className="rounded-md border border-white/30 p-2" aria-label="Copy School ID" onClick={()=>{void navigator.clipboard.writeText(schoolId);setCopied(true);}}><Copy className="h-4 w-4"/></button><a className="inline-flex items-center gap-1 text-xs underline" href={verifyUrl} target="_blank" rel="noreferrer">Open verification page <ExternalLink className="h-3 w-3"/></a></div><p className="mt-2 text-xs text-blue-100">{copied?"School ID copied. ":""}Share this exact code. A changed character will not resolve to another learner.</p></>:<p className="mt-3 text-xs text-amber-100">{error||"Generating your School ID…"}</p>}
  </section>;
}
