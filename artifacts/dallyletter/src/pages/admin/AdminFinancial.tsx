import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, DollarSign, Users, CreditCard, ArrowUpRight, ArrowDownRight, BarChart3, Wallet } from "lucide-react";

const token = () => localStorage.getItem("dallyletter_token") ?? "";

interface FinancialSummary {
  totalRevenue: number;
  paidCount: number;
  pendingCount: number;
  overdueCount: number;
  monthlyData: Record<string, number>;
  byStudent: Array<{ studentName: string; total: number; count: number }>;
}

interface StaffPaymentSummary {
  total: number;
  byRole: Record<string, number>;
  count: number;
}

export default function AdminFinancial() {
  const { user } = useAuth();
  const [payments, setPayments] = useState<any[]>([]);
  const [staffSummary, setStaffSummary] = useState<StaffPaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/payments", { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.json()),
      fetch("/api/staff-payments/summary", { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.json()),
    ]).then(([p, s]) => {
      setPayments(Array.isArray(p) ? p : []);
      setStaffSummary(s);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const totalRevenue = payments.filter(p => p.status === "paid").reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);
  const pendingRevenue = payments.filter(p => p.status === "pending").reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);
  const paidCount = payments.filter(p => p.status === "paid").length;
  const pendingCount = payments.filter(p => p.status === "pending").length;

  const monthlyData: Record<string, number> = {};
  payments.filter(p => p.status === "paid").forEach(p => {
    const key = `${p.year}-${String(p.month).padStart(2, "0")}`;
    monthlyData[key] = (monthlyData[key] ?? 0) + parseFloat(p.amount ?? "0");
  });
  const months = Object.keys(monthlyData).sort().slice(-6);

  const netProfit = totalRevenue - (staffSummary?.total ?? 0);

  if (loading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64 text-slate-500">Loading financial data…</div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Financial Dashboard</h1>
          <p className="text-slate-500 mt-1">Revenue, expenses, and financial overview</p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Revenue", value: `$${totalRevenue.toFixed(2)}`, icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50", sub: `${paidCount} payments`, trend: "up" },
            { label: "Pending Fees", value: `$${pendingRevenue.toFixed(2)}`, icon: CreditCard, color: "text-amber-600", bg: "bg-amber-50", sub: `${pendingCount} pending`, trend: "neutral" },
            { label: "Staff Salaries", value: `$${(staffSummary?.total ?? 0).toFixed(2)}`, icon: Users, color: "text-blue-600", bg: "bg-blue-50", sub: `${staffSummary?.count ?? 0} payments`, trend: "down" },
            { label: "Net Profit", value: `$${netProfit.toFixed(2)}`, icon: TrendingUp, color: netProfit >= 0 ? "text-emerald-600" : "text-red-600", bg: netProfit >= 0 ? "bg-emerald-50" : "bg-red-50", sub: "Revenue minus salaries", trend: netProfit >= 0 ? "up" : "down" },
          ].map(m => (
            <Card key={m.label} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className={`w-10 h-10 rounded-xl ${m.bg} flex items-center justify-center mb-3`}>
                  <m.icon className={`h-5 w-5 ${m.color}`} />
                </div>
                <p className="text-2xl font-bold text-slate-900">{m.value}</p>
                <p className="text-sm font-medium text-slate-700 mt-0.5">{m.label}</p>
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                  {m.trend === "up" ? <ArrowUpRight className="h-3 w-3 text-emerald-500" /> : m.trend === "down" ? <ArrowDownRight className="h-3 w-3 text-red-500" /> : null}
                  {m.sub}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Monthly Revenue Trend */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-blue-600" />
              Monthly Revenue (Last 6 months)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {months.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-8">No payment data yet</p>
            ) : (
              <div className="space-y-3">
                {months.map(month => {
                  const val = monthlyData[month];
                  const max = Math.max(...months.map(m => monthlyData[m]));
                  const pct = max > 0 ? (val / max) * 100 : 0;
                  return (
                    <div key={month} className="flex items-center gap-3">
                      <span className="text-xs text-slate-500 w-20 shrink-0">{month}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-slate-700 w-20 text-right">${val.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Staff Expenses Breakdown */}
        {staffSummary && Object.keys(staffSummary.byRole).length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wallet className="h-4 w-4 text-purple-600" />
                Staff Expenses by Role
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(staffSummary.byRole).map(([role, amount]) => (
                  <div key={role} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                    <span className="text-sm font-medium text-slate-700 capitalize">{role}</span>
                    <span className="text-sm font-bold text-slate-900">${(amount as number).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Payments */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Recent School Fee Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {payments.slice(0, 10).map(p => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{p.studentName}</p>
                    <p className="text-xs text-slate-400">{p.month} {p.year}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">${parseFloat(p.amount).toFixed(2)}</span>
                    <Badge variant={p.status === "paid" ? "default" : "secondary"} className={p.status === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}>
                      {p.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
