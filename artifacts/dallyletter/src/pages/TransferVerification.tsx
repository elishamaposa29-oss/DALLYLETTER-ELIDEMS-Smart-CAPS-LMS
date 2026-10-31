import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { getApiUrl } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";

type VerificationRecord = {
  verified: boolean;
  reference: string;
  learnerName: string;
  currentSchool: string;
  receivingSchool: string;
  grade: string;
  academicYear: string;
  approvedAt: string | null;
  expiresAt: string | null;
};

export default function TransferVerification() {
  const { token = "" } = useParams<{ token: string }>();
  const [record, setRecord] = useState<VerificationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void fetch(getApiUrl("/api/academic-records/transfer-verification/" + encodeURIComponent(token)))
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "This verification link is invalid or expired.");
        return data as VerificationRecord;
      })
      .then(data => { if (active) setRecord(data); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Verification could not be completed."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const date = (value: string | null) => value ? new Date(value).toLocaleDateString() : "Not recorded";

  return <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
    <div className="mx-auto max-w-2xl">
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-white">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-600"><ShieldCheck className="h-5 w-5"/> Dallyletter Elidems</div>
          <CardTitle>Transfer letter verification</CardTitle>
          <CardDescription>Check whether a transfer approval was issued through the Dallyletter Elidems school system.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 p-6">
          {loading ? <div className="flex items-center gap-2 py-8 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin"/>Checking protected verification token…</div> :
            error ? <div role="alert" className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0"/><div><p className="font-semibold">Verification unavailable</p><p>{error}</p></div></div> :
            record ? <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2"><Badge className="bg-emerald-700 text-white"><CheckCircle2 className="mr-1 h-3 w-3"/>Verified approval</Badge><span className="text-xs text-slate-500">{record.reference}</span></div>
              <dl className="grid gap-3 sm:grid-cols-2">
                {([
                  ["Learner",record.learnerName],
                  ["Current school",record.currentSchool],
                  ["Receiving school",record.receivingSchool],
                  ["Grade / Form",record.grade],
                  ["Academic year",record.academicYear],
                  ["Approval date",date(record.approvedAt)],
                  ["Link expires",date(record.expiresAt)],
                ] as Array<[string,string]>).map(([label,value]) => <div key={label} className="rounded-lg border bg-white p-3"><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 font-medium">{value || "Not recorded"}</dd></div>)}
              </dl>
              <p className="rounded-lg bg-slate-100 p-3 text-xs leading-relaxed text-slate-600">This confirms the approval record stored by Dallyletter Elidems. It does not replace an original school signature, physical stamp or independent confirmation from the issuing school.</p>
            </div> : null}
          <div className="border-t pt-4"><Button variant="outline" onClick={() => window.location.assign("/")}>Open Dallyletter Elidems</Button></div>
        </CardContent>
      </Card>
    </div>
  </main>;
}
