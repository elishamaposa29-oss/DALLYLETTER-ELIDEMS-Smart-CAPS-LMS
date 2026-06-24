import { DashboardLayout } from "@/components/DashboardLayout";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, Plus, Users, CreditCard, Search } from "lucide-react";

const token = () => localStorage.getItem("dallyletter_token") ?? "";

export default function AdminStaffPayments() {
  const { toast } = useToast();
  const [payments, setPayments] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ recipientId: "", amount: "", reason: "salary", description: "", paymentMethod: "bank_transfer", period: "", referenceNumber: "" });

  const load = () => {
    void Promise.all([
      fetch("/api/staff-payments", { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.json()),
      fetch("/api/users", { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.json()),
    ]).then(([p, u]) => {
      setPayments(Array.isArray(p) ? p : []);
      setStaff(Array.isArray(u) ? u.filter((x: any) => x.role === "teacher" || x.isManager || x.isPrefect) : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handlePay = () => {
    if (!form.recipientId || !form.amount) { toast({ variant: "destructive", title: "Fill all required fields" }); return; }
    void fetch("/api/staff-payments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ ...form, recipientId: parseInt(form.recipientId), amount: form.amount }),
    }).then(r => {
      if (!r.ok) { toast({ variant: "destructive", title: "Payment failed" }); return; }
      toast({ title: "✅ Payment recorded successfully" });
      setOpen(false);
      setForm({ recipientId: "", amount: "", reason: "salary", description: "", paymentMethod: "bank_transfer", period: "", referenceNumber: "" });
      load();
    });
  };

  const totalPaid = payments.reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);
  const filtered = payments.filter(p => p.recipientName?.toLowerCase().includes(search.toLowerCase()));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Staff Payments</h1>
            <p className="text-slate-500 mt-1">Salaries, bonuses, and rewards for staff</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white gap-2"><Plus className="h-4 w-4" /> Pay Staff Member</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>Record Staff Payment</DialogTitle></DialogHeader>
              <div className="space-y-3 mt-2">
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1 block">Select Staff Member *</label>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.recipientId} onChange={e => setForm(f => ({ ...f, recipientId: e.target.value }))}>
                    <option value="">— Choose staff member —</option>
                    {staff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
                  </select>
                </div>
                <div><label className="text-sm font-medium text-slate-700 mb-1 block">Amount (USD) *</label><Input placeholder="0.00" type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1 block">Reason</label>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}>
                    <option value="salary">Monthly Salary</option>
                    <option value="bonus">Performance Bonus</option>
                    <option value="reward">Achievement Reward</option>
                    <option value="allowance">Allowance</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div><label className="text-sm font-medium text-slate-700 mb-1 block">Period (e.g. June 2026)</label><Input placeholder="June 2026" value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} /></div>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1 block">Payment Method</label>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.paymentMethod} onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))}>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="ecocash">EcoCash</option>
                    <option value="paypal">PayPal</option>
                    <option value="cash">Cash</option>
                    <option value="crypto">Cryptocurrency</option>
                  </select>
                </div>
                <div><label className="text-sm font-medium text-slate-700 mb-1 block">Reference Number</label><Input placeholder="TXN123456" value={form.referenceNumber} onChange={e => setForm(f => ({ ...f, referenceNumber: e.target.value }))} /></div>
                <div><label className="text-sm font-medium text-slate-700 mb-1 block">Description</label><Input placeholder="Optional notes" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
                <Button className="w-full bg-emerald-600 text-white" onClick={handlePay}>Record Payment</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Paid Out", value: `$${totalPaid.toFixed(2)}`, icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Payment Records", value: payments.length, icon: CreditCard, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Staff Members", value: staff.length, icon: Users, color: "text-purple-600", bg: "bg-purple-50" },
          ].map(m => (
            <Card key={m.label} className="border-0 shadow-sm"><CardContent className="p-4">
              <div className={`w-9 h-9 rounded-xl ${m.bg} flex items-center justify-center mb-2`}><m.icon className={`h-4 w-4 ${m.color}`} /></div>
              <p className="text-xl font-bold text-slate-900">{m.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{m.label}</p>
            </CardContent></Card>
          ))}
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <CardTitle className="text-base">Payment History</CardTitle>
              <div className="flex items-center gap-2 ml-auto"><Search className="h-4 w-4 text-slate-400" /><Input placeholder="Search staff…" value={search} onChange={e => setSearch(e.target.value)} className="w-48 h-8 text-sm" /></div>
            </div>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? <p className="text-slate-400 text-sm text-center py-10">No payments recorded yet</p> : (
              <div className="space-y-2">
                {filtered.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{p.recipientName}</p>
                      <p className="text-xs text-slate-500">{p.reason} {p.period ? `· ${p.period}` : ""} · via {p.paymentMethod.replace("_"," ")}</p>
                      {p.referenceNumber && <p className="text-xs text-slate-400">Ref: {p.referenceNumber}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900">${parseFloat(p.amount).toFixed(2)}</p>
                      <Badge className="bg-emerald-100 text-emerald-700 text-xs">{p.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
