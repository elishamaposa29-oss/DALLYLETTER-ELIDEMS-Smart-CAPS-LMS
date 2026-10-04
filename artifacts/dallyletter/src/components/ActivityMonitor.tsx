import { useEffect, useMemo, useState } from "react";
import { getApiUrl } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CheckSquare, ExternalLink, RefreshCw, Search } from "lucide-react";

type Activity = {
  id: number;
  action: string;
  category: string;
  targetType: string | null;
  targetId: number | null;
  details: string | null;
  createdAt: string;
  performerName: string | null;
  performerRole: string | null;
};

const token = () => localStorage.getItem("dallyletter_token") ?? "";

export function ActivityMonitor() {
  const [items, setItems] = useState<Activity[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(getApiUrl("/api/audit-logs?limit=200"), { headers: { Authorization: `Bearer ${token()}` } });
      const data = await r.json().catch(() => []);
      if (r.ok) setItems(Array.isArray(data) ? data : []);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(item => !q || [item.action, item.category, item.targetType ?? "", item.performerName ?? "", item.performerRole ?? ""].join(" ").toLowerCase().includes(q));
  }, [items, search]);

  const visibleIds = filtered.map(item => item.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every(id => selected.includes(id));
  const toggle = (id: number) => setSelected(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id]);
  const selectAll = () => setSelected(allSelected ? selected.filter(id => !visibleIds.includes(id)) : [...new Set([...selected, ...visibleIds])]);

  const preview = () => {
    const rows = filtered.filter(item => selected.includes(item.id));
    if (!rows.length) return;
    const targetTypes = new Set(rows.map(item => item.targetType));
    const route = targetTypes.has("lesson") ? "/student/lessons"
      : targetTypes.has("assignment") ? "/student/assignments"
      : targetTypes.has("poll") ? "/student/polls"
      : targetTypes.has("group") ? "/student/study-groups"
      : targetTypes.has("activity") ? "/student/lessons"
      : null;
    if (route) window.open(route, "_blank", "noopener,noreferrer");
    else {
      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
      window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
    }
  };

  return <Card>
    <CardHeader className="pb-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">Live Activity Monitor</CardTitle>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search activity, user, feature…" className="pl-9" /></div>
        <Button size="sm" variant="outline" onClick={selectAll} disabled={!visibleIds.length}><CheckSquare className="mr-2 h-4 w-4" />{allSelected ? "Clear" : "Select all"}</Button>
        <Button size="sm" onClick={preview} disabled={!selected.length}><ExternalLink className="mr-2 h-4 w-4" />Preview selected</Button>
      </div>
    </CardHeader>
    <CardContent className="space-y-2">
      {loading ? <p className="text-sm text-muted-foreground py-6 text-center">Loading activity…</p> : filtered.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No activity found.</p> :
        filtered.slice(0, 60).map(item => <div key={item.id} className="flex items-start gap-3 rounded-lg border p-3">
          <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} className="mt-1 h-4 w-4" aria-label={`Select activity ${item.id}`} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="capitalize">{item.category}</Badge><p className="text-sm font-medium">{item.action}</p></div>
            <p className="mt-1 text-xs text-muted-foreground">{item.performerName ?? "Unknown"} · {item.performerRole ?? "unknown role"} · {item.targetType ?? "route"}{item.targetId ? ` #${item.targetId}` : ""}</p>
          </div>
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">{new Date(item.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
        </div>)}
    </CardContent>
  </Card>;
}
