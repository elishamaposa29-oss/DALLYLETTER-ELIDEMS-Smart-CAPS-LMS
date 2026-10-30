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
};
const token = () => localStorage.getItem("dallyletter_token") ?? "";

export default function ManagerTransferRequests() {
  const [rows, setRows] = useState<TransferRequest[]>([]);
  const [notes, setNotes] = useState<Record<number,string>>({});
  const [busy, setBusy] = useState<number|null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(getApiUrl("/api/academic-records/transfer-requests"), { headers: { Authorization: "Bearer " + token() } });
      const data = await response.json().catch(() => []);
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
      {row.review_note && <div className="rounded-md bg-muted p-3 text-sm"><strong>Review note:</strong> {row.review_note}</div>}
      {row.status==="pending" ? <><label className="block text-sm font-medium" htmlFor={`note-${row.id}`}>Review note / rejection reason</label><Textarea id={`note-${row.id}`} value={notes[row.id]||""} onChange={e=>setNotes(current=>({...current,[row.id]:e.target.value}))} maxLength={2000} placeholder="Record the reason for your decision (required for rejection)." />
      <div className="flex flex-wrap gap-2"><Button disabled={busy===row.id} onClick={()=>void review(row,"approved")}><CheckCircle2 className="mr-2 h-4 w-4"/>Approve request</Button><Button variant="destructive" disabled={busy===row.id} onClick={()=>void review(row,"rejected")}><XCircle className="mr-2 h-4 w-4"/>Reject request</Button></div></> : <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground"><Clock3 className="mr-1 inline h-3 w-3"/>Reviewed {row.reviewed_at ? new Date(row.reviewed_at).toLocaleString() : "date not recorded"}</p>{row.status==="approved" && <Button variant="outline" disabled={busy===row.id} onClick={()=>void download(row)}><FileDown className="mr-2 h-4 w-4"/>Download approved PDF</Button>}</div>}
      </CardContent></Card>)}</div>}
  </div></DashboardLayout>;
}
