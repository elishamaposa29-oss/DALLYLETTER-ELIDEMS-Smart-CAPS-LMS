import { useCallback, useEffect, useState } from "react";
import { getApiUrl } from "@workspace/api-client-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RefreshCw, FileCheck2, FileDown, CheckCircle2, XCircle, Clock3 } from "lucide-react";

type TransferRequest = {
  id: number; learner_id: number; learner_name?: string; reason: string; status: string;
  review_note?: string | null; reviewed_at?: string | null; created_at: string;
  form_data?: Record<string, unknown> | null;
};
const token = () => localStorage.getItem("dallyletter_token") ?? "";

export default function ManagerTransferRequests() {
  const [rows, setRows] = useState<TransferRequest[]>([]);
  const [notes, setNotes] = useState<Record<number,string>>({});
  const [busy, setBusy] = useState<number|null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [canApprove, setCanApprove] = useState(false);
  const [canReject, setCanReject] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [response, permissionResponse] = await Promise.all([
        fetch(getApiUrl("/api/academic-records/transfer-requests"), { headers: { Authorization: "Bearer " + token() } }),
        fetch(getApiUrl("/api/manager-permissions/me"), { headers: { Authorization: "Bearer " + token() } }),
      ]);
      const data = await response.json().catch(() => []);
      const permissionData = await permissionResponse.json().catch(() => ({}));
      setCanApprove(Boolean(permissionResponse.ok && (permissionData?.isOwner===true || permissionData?.permissions?.["transfers.approve"]===true)));
      setCanReject(Boolean(permissionResponse.ok && (permissionData?.isOwner===true || permissionData?.permissions?.["transfers.reject"]===true)));
      if (!response.ok) throw new Error(data.error || "Could not load transfer requests.");
      if (!Array.isArray(data)) throw new Error("The server returned an invalid transfer request list.");
      setRows(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load transfer requests."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const review = async (row: TransferRequest, status: "approved"|"rejected") => {
    if (status === "rejected" && (notes[row.id] || "").trim().length < 3) {
      setError("Enter a clear rejection reason of at least 3 characters."); return;
    }
    const action = status === "approved" ? "approve" : "reject";
    if (!window.confirm(`Are you sure you want to ${action} transfer request #${row.id}?`)) return;
    setBusy(row.id); setError(""); setMessage("");
    try {
      const response = await fetch(getApiUrl(`/api/academic-records/transfer-requests/${row.id}/review`), {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
        body: JSON.stringify({ status, note: (notes[row.id] || "").trim() })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "The decision could not be saved.");
      setMessage(`Transfer request #${row.id} ${status}.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Review failed."); }
    finally { setBusy(null); }
  };

  const download = async (row: TransferRequest) => {
    setBusy(row.id); setError("");
    try {
      const response = await fetch(getApiUrl(`/api/academic-records/transfer-requests/${row.id}/download`), { headers: { Authorization: "Bearer " + token() } });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Approved transfer letter download failed.");
      }
      const blob = await response.blob(); const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = `Dallyletter-transfer-letter-${row.id}.pdf`;
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    } catch (e) { setError(e instanceof Error ? e.message : "Download failed."); }
    finally { setBusy(null); }
  };

  const pending = rows.filter(row => row.status === "pending");
  return <DashboardLayout><div className="mx-auto max-w-6xl space-y-5">
    <div className="rounded-2xl bg-gradient-to-r from-indigo-700 to-violet-800 p-6 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Transfer letter requests</h1><p className="mt-1 text-sm text-indigo-100">Review requests and authorize official letters. Decisions are recorded by the server.</p></div><Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}/>Refresh</Button></div>
      <div className="mt-4 flex flex-wrap gap-2"><Badge className="bg-amber-400 text-slate-900">{pending.length} pending</Badge><Badge variant="secondary">{rows.filter(r=>r.status==="approved").length} approved</Badge><Badge variant="secondary">{rows.filter(r=>r.status==="rejected").length} rejected</Badge></div>
    </div>
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    {message && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
    {loading ? <p className="py-12 text-center text-muted-foreground">Loading transfer requests…</p> : rows.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">No transfer requests have been submitted.</CardContent></Card> :
      <div className="space-y-4">{rows.map(row => <Card key={row.id} className="overflow-hidden"><CardHeader className="pb-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-base"><FileCheck2 className="h-5 w-5"/>Request #{row.id} · {row.learner_name || `Learner #${row.learner_id}`}</CardTitle><p className="mt-1 text-xs text-muted-foreground">Submitted {new Date(row.created_at).toLocaleString()}</p></div><Badge variant={row.status==="approved"?"default":row.status==="rejected"?"destructive":"secondary"}>{row.status}</Badge></div></CardHeader><CardContent className="space-y-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Transfer reason</p><p className="whitespace-pre-wrap text-sm">{row.reason}</p></div>
      <section className="overflow-hidden rounded-2xl border border-[#b38b00]/40 bg-gradient-to-br from-[#0f2a5a]/[0.04] via-background to-[#b38b00]/[0.06] p-2 shadow-lg shadow-[#0f2a5a]/5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2 pt-1"><div><h3 className="font-extrabold tracking-tight text-[#0f2a5a]">Live transfer letter · original submission</h3><p className="text-xs text-muted-foreground">The review document mirrors the applicant's live preview and uses the saved submission without fabricating missing details.</p></div><span className="rounded-full border border-[#b38b00]/50 bg-[#b38b00]/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-[#8a6d1d]">ELIDEMS · 6020</span></div>
        <article className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-4 text-slate-800 shadow-inner sm:p-6">
          <header className="flex items-center justify-between gap-3 border-b-[3px] border-[#0f2a5a] pb-3"><div className="flex min-w-0 items-center gap-3"><img src="/icons/icon-192.png" alt="Dallyletter Elidems logo" className="h-12 w-12 rounded-xl object-contain"/><div className="min-w-0"><h3 className="text-lg font-black text-[#0f2a5a]">Dallyletter Elidems</h3><p className="text-[10px] uppercase tracking-wider text-slate-500">Official transfer application</p></div></div><img src={typeof row.form_data?.schoolLogoDataUrl==="string"?row.form_data.schoolLogoDataUrl:"/icons/icon-192.png"} alt="Current school logo" className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 bg-white object-contain p-1"/></header>
          <p className="mt-3 text-right text-xs text-slate-500">{String(row.form_data?.effectiveDate||"Date not supplied")}</p>
          <p className="mt-4 text-sm">The Headmaster<br/><b>{String(row.form_data?.receivingSchool||"[Receiving School]")}</b><br/>Dear Sir/Madam,</p>
          <h4 className="my-4 text-sm font-black text-[#0f2a5a]">RE: TRANSFER APPLICATION FOR {String(row.form_data?.learnerName||row.learner_name||"LEARNER NAME").toUpperCase()} — {String(row.form_data?.grade||"Grade not supplied")}</h4>
          {[
            ["1. Learner's details",[["Current school",row.form_data?.currentSchool||"Dallyletter Elidems"],["Full name",row.form_data?.learnerName||row.learner_name],["Grade / Form",row.form_data?.grade],["Admission number",row.form_data?.admissionNo],["Date of birth / Gender",String(row.form_data?.dob||"—")+" / "+String(row.form_data?.gender||"—")],["EMIS number",row.form_data?.emisNo],["Academic year",row.form_data?.academicYear],["Recorded average / Conduct",(row.form_data?.average!==undefined&&row.form_data?.average!==null&&String(row.form_data.average).trim()!==""?String(row.form_data.average)+"%":"Not recorded")+" / "+String(row.form_data?.conduct||"Not recorded")]]],
            ["2. Reason for transfer",[["Receiving school",row.form_data?.receivingSchool],["Category",row.form_data?.reasonType],["Details",row.form_data?.reasonDetail||row.reason]]],
            ["3. Parent / guardian details",[["Name & relationship",String(row.form_data?.guardianName||"—")+" ("+String(row.form_data?.relationship||"—")+")"],["ID number",row.form_data?.guardianId],["Phone",row.form_data?.guardianPhone],["Email",row.form_data?.guardianEmail],["Physical address",row.form_data?.address],["Effective date",row.form_data?.effectiveDate]]]
          ].map(([heading,items]:any)=><section key={heading} className="mt-3 rounded-lg border border-slate-200 p-3"><h4 className="mb-2 border-l-4 border-[#b38b00] pl-2 text-[10px] font-black uppercase tracking-wide text-[#0f2a5a]">{heading}</h4>{items.filter(([,value]:any)=>value!==undefined&&value!==null&&String(value).trim()!=="").map(([label,value]:any)=><div key={label} className="flex gap-3 border-b border-dotted border-slate-200 py-1.5 text-xs"><span className="w-36 shrink-0 text-slate-500">{label}</span><b className="break-words text-[#0f2a5a]">{String(value)||"—"}</b></div>)}</section>)}
          <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3"><summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-[#0f2a5a]">＋ 4. Declarations & signatures · tap to expand</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{(["guardianSignatureDataUrl","headmasterSignatureDataUrl"] as const).map(key=>{const value=row.form_data?.[key];return <figure key={key} className="rounded-lg border border-slate-200 bg-white p-3"><figcaption className="mb-2 text-xs font-bold text-[#0f2a5a]">{key==="guardianSignatureDataUrl"?"Parent / guardian signature":"Headmaster signature / school stamp"}</figcaption>{typeof value==="string"&&/^data:image\/(png|jpeg);base64,/.test(value)?<img src={value} alt={key==="guardianSignatureDataUrl"?"Submitted guardian signature":"Submitted headmaster signature or stamp"} className="h-16 w-full object-contain"/>:<p className="text-xs text-slate-400">Not supplied · no signature or stamp is assumed</p>}</figure>;})}<p className="sm:col-span-2 text-[10px] text-slate-500">Subject to acceptance by the receiving school, space availability and supporting records. Fee clearance and signatures are never assumed.</p></div></details>
        </article>
      </section>
      {row.review_note && <div className="rounded-md bg-muted p-3 text-sm"><strong>Review note:</strong> {row.review_note}</div>}
      {row.status==="pending" && (canApprove || canReject) ? <><label className="block text-sm font-medium" htmlFor={`note-${row.id}`}>Review note / rejection reason</label><Textarea id={`note-${row.id}`} value={notes[row.id]||""} onChange={e=>setNotes(current=>({...current,[row.id]:e.target.value}))} maxLength={2000} placeholder="Record the reason for your decision (required for rejection)." />
      <div className="flex flex-wrap gap-2">{canApprove && <Button disabled={busy===row.id} onClick={()=>void review(row,"approved")}><CheckCircle2 className="mr-2 h-4 w-4"/>Approve request</Button>}{canReject && <Button variant="destructive" disabled={busy===row.id} onClick={()=>void review(row,"rejected")}><XCircle className="mr-2 h-4 w-4"/>Reject request</Button>}</div></> : row.status==="pending" ? <p className="text-sm text-muted-foreground">Visible for monitoring. Your Owner-assigned permissions currently allow monitoring only; request the appropriate decision permission from the Owner.</p> : <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground"><Clock3 className="mr-1 inline h-3 w-3"/>Reviewed {row.reviewed_at ? new Date(row.reviewed_at).toLocaleString() : "date not recorded"}</p>{row.status==="approved" && <Button variant="outline" disabled={busy===row.id} onClick={()=>void download(row)}><FileDown className="mr-2 h-4 w-4"/>Download approved PDF</Button>}</div>}
      </CardContent></Card>)}</div>}
  </div></DashboardLayout>;
}
