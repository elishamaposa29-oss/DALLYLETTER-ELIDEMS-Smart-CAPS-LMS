import { useEffect, useMemo, useState } from "react";
import { getApiUrl } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const [error, setError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResults, setPreviewResults] = useState<Array<{ item: Activity; data?: any; error?: string }>>([]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(getApiUrl("/api/audit-logs?limit=200"), { headers: { Authorization: "Bearer " + token() } });
      const data = await r.json().catch(() => []);
      if (!r.ok) throw new Error(data.error || "Activity is unavailable for this account.");
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load activity.");
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

  const preview = async () => {
    const rows = filtered.filter(item => selected.includes(item.id));
    if (!rows.length) return;
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewResults([]);
    const paths: Record<string, (id: number) => string> = {
      lesson: id => `/api/lessons/${id}`,
      exercise: id => `/api/exercises/${id}`,
      assignment: id => `/api/assignments/${id}`,
      class: id => `/api/classes/${id}`,
      group: id => `/api/study-groups/${id}`,
      study_group: id => `/api/study-groups/${id}`,
      poll: id => `/api/polls/${id}`,
    };
    const results = await Promise.all(rows.map(async item => {
      const targetType = String(item.targetType || "").toLowerCase();
      const route = item.targetId ? paths[targetType]?.(item.targetId) : null;
      if (!route) return { item, data: { details: item.details }, error: "A resource preview is not available for this activity type." };
      try {
        const response = await fetch(getApiUrl(route), { headers: { Authorization: "Bearer " + token() } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return { item, error: data.error || "This resource is not available to your account." };
        return { item, data };
      } catch {
        return { item, error: "Could not load this resource preview. Check your connection and retry." };
      }
    }));
    setPreviewResults(results);
    setPreviewLoading(false);
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
        <Button size="sm" onClick={() => void preview()} disabled={!selected.length || previewLoading}><ExternalLink className="mr-2 h-4 w-4" />Preview selected</Button>
      </div>
    </CardHeader>
    <CardContent className="space-y-2">
      {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : loading ? <p className="text-sm text-muted-foreground py-6 text-center">Loading activity…</p> : filtered.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No activity found.</p> :
        filtered.slice(0, 60).map(item => <div key={item.id} className="flex items-start gap-3 rounded-lg border p-3">
          <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} className="mt-1 h-4 w-4" aria-label={`Select activity ${item.id}`} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="capitalize">{item.category}</Badge><p className="text-sm font-medium">{item.action}</p></div>
            <p className="mt-1 text-xs text-muted-foreground">{item.performerName ?? "Unknown"} · {item.performerRole ?? "unknown role"} · {item.targetType ?? "route"}{item.targetId ? ` #${item.targetId}` : ""}</p>
          </div>
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">{new Date(item.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
        </div>)}
    </CardContent>
    </Card>
    <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Selected resource previews</DialogTitle>
          <DialogDescription>These are the actual saved learning resources linked to the selected activity records.</DialogDescription>
        </DialogHeader>
        {previewLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading selected resources…</p> :
          previewResults.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No resources selected.</p> :
          <div className="space-y-3">
            {previewResults.map(({ item, data, error: previewError }) => {
              const resource = data?.exercise || data || {};
              const questions = Array.isArray(data?.questions) ? data.questions : [];
              const details = resource.description || resource.instructions || resource.content || data?.details;
              const meta: Array<[string, unknown]> = [
                ["Subject", resource.subject],
                ["Grade", resource.grade],
                ["Status", resource.status],
                ["Due date", resource.dueDate || resource.due_date],
                ["Total marks", resource.totalMarks ?? resource.total_marks],
                ["Scheduled", resource.scheduledAt || resource.scheduled_at],
                ["Members", resource.memberCount ?? (Array.isArray(resource.members) ? resource.members.length : undefined)],
                ["Submissions", Array.isArray(resource.submissions) ? resource.submissions.length : undefined],
              ];
              return <div key={item.id} className="space-y-2 rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="capitalize">{item.targetType || "activity"}</Badge>
                  <h3 className="font-semibold">{resource.title || resource.name || "Activity #" + item.id}</h3>
                  {item.targetId ? <span className="text-xs text-muted-foreground">Resource #{item.targetId}</span> : null}
                </div>
                <p className="text-xs text-muted-foreground">{item.action} · {item.performerName || "Unknown user"} · {new Date(item.createdAt).toLocaleString()}</p>
                {previewError ? <p role="alert" className="rounded-md bg-amber-50 p-2 text-sm text-amber-800">{previewError}</p> : null}
                {!previewError && meta.some(([, value]) => value !== undefined && value !== null && value !== "") ?
                  <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    {meta.filter(([, value]) => value !== undefined && value !== null && value !== "").map(([label, value]) =>
                      <div key={label} className="rounded-md bg-muted/50 p-2"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-medium">{String(value)}</dd></div>
                    )}
                  </dl> : null}
                {!previewError && details ? <div className="rounded-md bg-muted/40 p-3"><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Resource content</p><p className="whitespace-pre-wrap break-words text-sm">{String(details).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()}</p></div> : null}
                {!previewError && questions.length ? <div><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Questions / sections</p><ol className="list-decimal space-y-1 pl-5 text-sm">{questions.slice(0, 20).map((question: any, index: number) => <li key={question.id || index}>{String(question.prompt || question.question || question.title || "Question")}{question.marksAllocated != null ? " (" + String(question.marksAllocated) + " marks)" : ""}</li>)}</ol></div> : null}
                {!previewError && resource.mediaUrl ? <p className="text-xs text-muted-foreground">A saved media attachment is linked to this resource.</p> : null}
                {!previewError && !details && !questions.length && !meta.some(([, value]) => value !== undefined && value !== null && value !== "") ? <p className="text-sm text-muted-foreground">The resource exists, but it has no additional preview fields.</p> : null}
              </div>;
            })}
          </div>}
      </DialogContent>
    </Dialog>
  </>;
}
