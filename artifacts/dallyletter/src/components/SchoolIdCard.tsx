import { useEffect, useState } from "react";
import { getApiUrl } from "@workspace/api-client-react";
import { Copy, ExternalLink, ShieldCheck, Share2, QrCode } from "lucide-react";

export function SchoolIdCard({ isOwner, role }: { isOwner: boolean; role?: string }) {
  const [schoolId,setSchoolId]=useState("");
  const [error,setError]=useState("");
  const [copied,setCopied]=useState(false);
  const [shareNotice,setShareNotice]=useState("");
  useEffect(()=>{
    if(!isOwner||!["student","learner","prefect"].includes(String(role||"").toLowerCase()))return;
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
  const qrUrl=verifyUrl?"https://api.qrserver.com/v1/create-qr-code/?size=180x180&format=svg&data="+encodeURIComponent(verifyUrl):"";
  const share=async()=>{
    if(!verifyUrl)return;
    try{
      if(typeof navigator!=="undefined"&&navigator.share){
        await navigator.share({title:"Dallyletter academic portfolio",text:"Verify this learner's published academic portfolio.",url:verifyUrl});
        setShareNotice("Share sheet opened.");
      }else{
        await navigator.clipboard.writeText(verifyUrl);
        setShareNotice("Verification link copied.");
      }
    }catch(error){
      if(error instanceof Error&&error.name!=="AbortError")setShareNotice("Sharing was unavailable. Copy the verification link instead.");
    }
  };
  return <section className="mb-5 rounded-xl border border-[#b38b00]/40 bg-gradient-to-r from-[#0f2a5a] to-[#173d78] p-4 text-white shadow-sm">
    <div className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="h-5 w-5 text-[#e6c45a]"/> Your Dallyletter School ID</div>
    <p className="mt-1 text-xs text-blue-100">A unique identity for sharing and verifying your published academic portfolio.</p>
    {schoolId?<>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <strong className="font-mono text-xl tracking-widest text-[#ffe08a]">{schoolId}</strong>
        <button type="button" className="rounded-md border border-white/30 p-2" aria-label="Copy School ID" onClick={()=>{void navigator.clipboard.writeText(schoolId);setCopied(true);}}><Copy className="h-4 w-4"/></button>
        <a className="inline-flex items-center gap-1 text-xs underline" href={verifyUrl} target="_blank" rel="noreferrer">Open verification page <ExternalLink className="h-3 w-3"/></a>
        <button type="button" onClick={()=>void share()} className="inline-flex items-center gap-1 rounded-md border border-white/30 px-3 py-2 text-xs font-semibold"><Share2 className="h-4 w-4"/>Share portfolio</button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="rounded-lg bg-white p-2"><img src={qrUrl} alt="QR code linking to this learner's public School ID verification page" width="112" height="112" loading="lazy" referrerPolicy="no-referrer"/></div>
        <div className="max-w-sm"><p className="flex items-center gap-1 text-sm font-semibold"><QrCode className="h-4 w-4"/>Scan to verify</p><p className="mt-1 text-xs text-blue-100">Anyone can scan this QR code to open the public portfolio. Only sections you have explicitly published are visible.</p><p className="mt-2 text-xs text-[#ffe08a]">{copied?"School ID copied. ":""}{shareNotice}</p></div>
      </div>
      <p className="mt-2 text-xs text-blue-100">Share this exact code. A changed character will not resolve to another learner.</p>
    </>:<p className="mt-3 text-xs text-amber-100">{error||"Generating your School ID…"}</p>}
  </section>;
}
