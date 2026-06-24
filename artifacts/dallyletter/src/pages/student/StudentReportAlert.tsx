import { DashboardLayout } from "@/components/DashboardLayout";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Shield, Send, CheckCircle } from "lucide-react";

const token = () => localStorage.getItem("dallyletter_token") ?? "";

const CATEGORIES = [
  { value: "cyberbullying", label: "Cyberbullying", icon: "😡", desc: "Being bullied or harassed online" },
  { value: "threat", label: "Threat", icon: "⚠️", desc: "Someone threatening you or others" },
  { value: "abuse", label: "Abuse", icon: "🚨", desc: "Any form of physical or emotional abuse" },
  { value: "fraud", label: "Fraud", icon: "💰", desc: "Suspicious financial activity" },
  { value: "teacher", label: "Teacher Concern", icon: "👩‍🏫", desc: "Issue involving a teacher" },
  { value: "general", label: "General Report", icon: "📋", desc: "Other platform concerns" },
];

const SEVERITIES = [
  { value: "low", label: "Low", color: "bg-blue-100 text-blue-700" },
  { value: "medium", label: "Medium", color: "bg-amber-100 text-amber-700" },
  { value: "high", label: "High", color: "bg-orange-100 text-orange-700" },
  { value: "critical", label: "Critical / Emergency", color: "bg-red-100 text-red-700" },
];

export default function StudentReportAlert() {
  const { toast } = useToast();
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = () => {
    if (!category || !title || !description) { toast({ variant: "destructive", title: "Fill all fields" }); return; }
    setSubmitting(true);
    void fetch("/api/owner-alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ category, severity, title, description }),
    }).then(r => {
      setSubmitting(false);
      if (!r.ok) { toast({ variant: "destructive", title: "Failed to send report" }); return; }
      setSubmitted(true);
    });
  };

  if (submitted) return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="bg-emerald-100 p-6 rounded-full mb-4"><CheckCircle className="h-12 w-12 text-emerald-600" /></div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Report Sent</h2>
        <p className="text-slate-500 max-w-sm">Your report has been sent directly to the Owner. It will be reviewed as a priority. You are safe.</p>
        <Button className="mt-6" onClick={() => { setSubmitted(false); setTitle(""); setDescription(""); setCategory(""); setSeverity("medium"); }}>
          Send Another Report
        </Button>
      </div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div className="max-w-xl mx-auto space-y-6">
        <div className="bg-gradient-to-r from-red-600 to-red-800 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-3 mb-2"><Shield className="h-6 w-6" /><h1 className="text-xl font-bold">Report to Owner</h1></div>
          <p className="text-red-100 text-sm">Report cyberbullying, threats, abuse, or any serious concern directly to the platform owner. All reports are confidential.</p>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-sm">Select Report Category</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map(c => (
                <button key={c.value} onClick={() => setCategory(c.value)}
                  className={`p-3 rounded-xl border text-left transition-all ${category === c.value ? "border-red-400 bg-red-50" : "border-slate-200 hover:border-slate-300"}`}>
                  <div className="text-xl mb-1">{c.icon}</div>
                  <p className="text-xs font-semibold text-slate-800">{c.label}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{c.desc}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-sm">Severity Level</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-2 flex-wrap">
              {SEVERITIES.map(s => (
                <button key={s.value} onClick={() => setSeverity(s.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${severity === s.value ? `${s.color} ring-2 ring-offset-1 ring-current` : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-sm">Report Details</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Brief title / summary *" value={title} onChange={e => setTitle(e.target.value)} />
            <textarea className="w-full border rounded-lg px-3 py-2 text-sm min-h-[120px] resize-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              placeholder="Describe the incident in detail…" value={description} onChange={e => setDescription(e.target.value)} />
            <Button className="w-full bg-red-600 text-white gap-2" onClick={submit} disabled={submitting}>
              <Send className="h-4 w-4" />{submitting ? "Sending…" : "Send Report to Owner"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
