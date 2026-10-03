import { getApiUrl } from "@workspace/api-client-react";
import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ScrollText, Search, Download, Trash2, Send, ExternalLink, Brain, CheckSquare } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface AuditLog { id: number; action: string; category: string; targetType: string | null; targetId: number | null; details: string | null; createdAt: string; performerName: string | null; performerRole: string | null; performerId?: number | null; }

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
  const [selected, setSelected] = useState<number[]>([]);
  const [summary, setSummary] = useState<string | null>(null);

  const token = () => localStorage.getItem("dallyletter_token");

  const loadLogs = async () => {
    setLoading(true);
    try {
      const response = await fetch(getApiUrl("/api/audit-logs?limit=500"), { headers: { Authorization: `Bearer ${token()}` } });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Audit logs could not be loaded");
      setLogs(Array.isArray(data) ? data : []);
    } catch (error) {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadLogs(); }, []);

  const filtered = logs.filter(l => {
    if (categoryFilter !== "all" && l.category !== categoryFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return l.action.toLowerCase().includes(s) || (l.performerName?.toLowerCase().includes(s) ?? false);
    }
    return true;
  });

  const toggle = (id: number) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const visibleIds = filtered.map(l => l.id);
  const selectAll = () => setSelected(selected.length === visibleIds.length ? [] : visibleIds);
  async function bulkDelete() { if (!window.confirm(`Delete ${selected.length} selected audit log(s)?`)) return; const r = await fetch(getApiUrl("/api/audit-logs/delete"), { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() }, body: JSON.stringify({ ids: selected }) }); if (r.ok) { setSelected([]); await loadLogs(); } else { const d = await r.json().catch(() => null); setSummary(d?.error ?? "Audit log deletion failed"); } }
  async function summarizeAI() { const r = await fetch(getApiUrl("/api/audit-logs/summarize"), { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() }, body: JSON.stringify({ ids: selected }) }); const d = await r.json(); setSummary(r.ok ? d.summary : (d.error ?? "AI summary unavailable")); }
  function openSelected() { const rows = filtered.filter(l => selected.includes(l.id)); const url = URL.createObjectURL(new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" })); window.open(url, "_blank", "noopener,noreferrer"); }
  async function sendSelected() { const rows = filtered.filter(l => selected.includes(l.id)); const text = rows.map(l => "[" + l.id + "] " + l.action + " — " + (l.performerName ?? "Unknown") + " (" + (l.performerRole ?? "unknown") + ")").join("\n"); if (navigator.share) await navigator.share({ title: "DALLYLETTER Audit Logs", text }); else await navigator.clipboard.writeText(text); }
  function exportSelected(format: "json" | "csv") { if (format === "json") { const rows = filtered.filter(l => selected.includes(l.id)); const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "audit-logs-selected.json"; a.click(); return; } exportCSV(); }

  function exportCSV() {
    const rowsToExport = selected.length ? filtered.filter(l => selected.includes(l.id)) : filtered;
    const header = "ID,Action,Category,Performed By,Target,Date\n";
    const rows = rowsToExport.map(l =>
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
          <div className="flex flex-wrap gap-2 w-full">
            <Button size="sm" variant="outline" onClick={selectAll} className="gap-1.5"><CheckSquare className="h-4 w-4" />{selected.length === visibleIds.length && visibleIds.length ? "Clear selection" : "Select all"}</Button>
            <Button size="sm" variant="outline" disabled={!selected.length} onClick={() => void sendSelected()} className="gap-1.5"><Send className="h-4 w-4" />Send</Button>
            <Button size="sm" variant="outline" disabled={!selected.length} onClick={openSelected} className="gap-1.5"><ExternalLink className="h-4 w-4" />Open with</Button>
            <Button size="sm" variant="outline" disabled={!selected.length} onClick={() => exportSelected("json")} className="gap-1.5"><Download className="h-4 w-4" />Download as JSON</Button>
            <Button size="sm" variant="outline" disabled={!selected.length} onClick={() => void summarizeAI()} className="gap-1.5"><Brain className="h-4 w-4" />Summarise with AI</Button>
            <Button size="sm" variant="destructive" disabled={!selected.length} onClick={() => void bulkDelete()} className="gap-1.5"><Trash2 className="h-4 w-4" />Delete</Button>
          </div>
          {summary && <Card><CardContent className="p-4 whitespace-pre-wrap text-sm">{summary}</CardContent></Card>}

        </div>

        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="p-12 text-center text-muted-foreground">No audit log entries found.</CardContent></Card>
        ) : (
          <div className="space-y-1.5">
            {filtered.map(log => (
              <div key={log.id} className="flex items-start gap-3 border rounded-lg p-3 bg-card hover:bg-muted/30 transition-colors"><input type="checkbox" checked={selected.includes(log.id)} onChange={() => toggle(log.id)} aria-label={"Select audit log " + log.id} className="mt-1 h-4 w-4" />
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
