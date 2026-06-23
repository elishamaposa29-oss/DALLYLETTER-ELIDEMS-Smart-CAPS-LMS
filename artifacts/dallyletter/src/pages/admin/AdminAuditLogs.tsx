import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ScrollText, Search, Download } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface AuditLog { id: number; action: string; category: string; targetType: string | null; targetId: number | null; details: string | null; createdAt: string; performerName: string | null; performerRole: string | null; }

const CATEGORY_COLORS: Record<string, string> = {
  ai: "bg-purple-100 text-purple-800 border-purple-300",
  admin: "bg-blue-100 text-blue-800 border-blue-200",
  security: "bg-red-100 text-red-800 border-red-200",
  payment: "bg-emerald-100 text-emerald-800 border-emerald-200",
  system: "bg-muted text-muted-foreground",
  user: "bg-amber-100 text-amber-800 border-amber-200",
};

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const token = () => localStorage.getItem("dallyletter_token");

  useEffect(() => {
    setLoading(true);
    fetch("/api/audit-logs?limit=500", { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json())
      .then(d => { setLogs(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = logs.filter(l => {
    if (categoryFilter !== "all" && l.category !== categoryFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return l.action.toLowerCase().includes(s) || (l.performerName?.toLowerCase().includes(s) ?? false);
    }
    return true;
  });

  function exportCSV() {
    const header = "ID,Action,Category,Performed By,Target,Date\n";
    const rows = filtered.map(l =>
      `${l.id},"${l.action.replace(/"/g, '""')}",${l.category},"${l.performerName ?? ""}","${l.targetType ?? ""} ${l.targetId ?? ""}","${new Date(l.createdAt).toLocaleString()}"`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `audit-logs-${new Date().toISOString().split("T")[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const categories = ["all", ...Array.from(new Set(logs.map(l => l.category)))];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><ScrollText className="h-7 w-7 text-primary" />Audit Logs</h1>
            <p className="text-muted-foreground">Complete record of all administrative actions and AI operations.</p>
          </div>
          <Button variant="outline" onClick={exportCSV} className="gap-2"><Download className="h-4 w-4" />Export CSV</Button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search actions or users…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {categories.map(c => <SelectItem key={c} value={c} className="capitalize">{c === "all" ? "All Categories" : c}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground self-center">{filtered.length} entries</span>
        </div>

        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="p-12 text-center text-muted-foreground">No audit log entries found.</CardContent></Card>
        ) : (
          <div className="space-y-1.5">
            {filtered.map(log => (
              <div key={log.id} className="flex items-start gap-3 border rounded-lg p-3 bg-card hover:bg-muted/30 transition-colors">
                <Badge variant="outline" className={`text-xs shrink-0 capitalize ${CATEGORY_COLORS[log.category] ?? CATEGORY_COLORS.system}`}>{log.category}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight">{log.action}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {log.performerName && <span className="text-xs text-muted-foreground">by <strong>{log.performerName}</strong>{log.performerRole ? ` (${log.performerRole})` : ""}</span>}
                    {log.targetType && <span className="text-xs text-muted-foreground">→ {log.targetType}{log.targetId ? ` #${log.targetId}` : ""}</span>}
                  </div>
                  {log.details && (() => {
                    try {
                      const parsed = JSON.parse(log.details);
                      return <p className="text-xs text-muted-foreground mt-0.5 font-mono">{JSON.stringify(parsed)}</p>;
                    } catch { return <p className="text-xs text-muted-foreground mt-0.5">{log.details}</p>; }
                  })()}
                </div>
                <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">{new Date(log.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
