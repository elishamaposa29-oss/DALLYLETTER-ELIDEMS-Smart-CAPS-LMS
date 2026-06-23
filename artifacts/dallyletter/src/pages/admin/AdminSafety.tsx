import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Shield, AlertTriangle, CheckCircle, XCircle, Eye, Trash2, Flag } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ContentFlag { id: number; contentType: string; contentId: number; contentText: string | null; reason: string; severity: string; status: string; detectedBy: string; createdAt: string; reviewerName: string | null; reviewNote: string | null; }

export default function AdminSafety() {
  const { toast } = useToast();
  const [flags, setFlags] = useState<ContentFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [reviewing, setReviewing] = useState<ContentFlag | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [saving, setSaving] = useState(false);

  const token = () => localStorage.getItem("dallyletter_token");

  async function load() {
    setLoading(true);
    const r = await fetch("/api/content-flags", { headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) setFlags(await r.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function reviewFlag(status: string) {
    if (!reviewing) return;
    setSaving(true);
    const r = await fetch(`/api/content-flags/${reviewing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ status, reviewNote }),
    });
    setSaving(false);
    if (r.ok) {
      toast({ title: `Flag marked as ${status}` });
      setReviewing(null);
      setReviewNote("");
      load();
    }
  }

  async function deleteFlag(id: number) {
    await fetch(`/api/content-flags/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token()}` } });
    toast({ title: "Flag deleted" });
    load();
  }

  const sevColor = (s: string) => ({ critical: "bg-red-100 text-red-800 border-red-300", high: "bg-orange-100 text-orange-800 border-orange-300", medium: "bg-amber-100 text-amber-800 border-amber-200", low: "bg-blue-100 text-blue-800 border-blue-200" }[s] ?? "bg-muted text-muted-foreground");
  const statusColor = (s: string) => ({ pending: "bg-amber-100 text-amber-800", reviewed: "bg-blue-100 text-blue-800", dismissed: "bg-muted text-muted-foreground", actioned: "bg-emerald-100 text-emerald-800" }[s] ?? "");

  const filtered = filter === "all" ? flags : flags.filter(f => f.status === filter);
  const counts = { total: flags.length, pending: flags.filter(f => f.status === "pending").length, critical: flags.filter(f => f.severity === "critical").length, high: flags.filter(f => f.severity === "high").length };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><Shield className="h-7 w-7 text-destructive" />Content Safety</h1>
          <p className="text-muted-foreground">ELIDEMS AI monitors all content. Review flagged items and take action.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Flags", value: counts.total, icon: Flag, color: "text-muted-foreground" },
            { label: "Pending Review", value: counts.pending, icon: AlertTriangle, color: "text-amber-600" },
            { label: "Critical", value: counts.critical, icon: XCircle, color: "text-red-600" },
            { label: "High Severity", value: counts.high, icon: AlertTriangle, color: "text-orange-600" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardContent className="p-4 flex items-center gap-3">
                <Icon className={`h-8 w-8 ${color}`} />
                <div>
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Flags</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
              <SelectItem value="actioned">Actioned</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">{filtered.length} item{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {loading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
              <p className="font-semibold">No flagged content</p>
              <p className="text-sm text-muted-foreground">The platform is clean. ELIDEMS AI is monitoring all content.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map(flag => (
              <Card key={flag.id} className={flag.severity === "critical" ? "border-red-300 dark:border-red-800" : flag.severity === "high" ? "border-orange-300 dark:border-orange-800" : ""}>
                <div className="p-4 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={sevColor(flag.severity)}>{flag.severity.toUpperCase()}</Badge>
                      <Badge variant="outline" className={statusColor(flag.status)}>{flag.status}</Badge>
                      <span className="text-xs text-muted-foreground capitalize">{flag.contentType} #{flag.contentId}</span>
                      <span className="text-xs text-muted-foreground">by {flag.detectedBy}</span>
                    </div>
                    <p className="font-medium text-sm">{flag.reason}</p>
                    {flag.contentText && (
                      <p className="text-sm text-muted-foreground bg-muted/60 rounded px-3 py-1.5 border-l-4 border-muted-foreground/30 italic">
                        "{flag.contentText.slice(0, 200)}{flag.contentText.length > 200 ? "…" : ""}"
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">{new Date(flag.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {flag.status === "pending" && (
                      <Button size="sm" variant="outline" onClick={() => { setReviewing(flag); setReviewNote(""); }} className="text-xs gap-1">
                        <Eye className="h-3.5 w-3.5" />Review
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => deleteFlag(flag.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Review Dialog */}
        <Dialog open={!!reviewing} onOpenChange={() => { setReviewing(null); setReviewNote(""); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Eye className="h-5 w-5" />Review Flag</DialogTitle></DialogHeader>
            {reviewing && (
              <div className="space-y-4 py-2">
                <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                  <div className="flex gap-2"><Badge variant="outline" className={sevColor(reviewing.severity)}>{reviewing.severity}</Badge><span className="text-xs text-muted-foreground capitalize">{reviewing.contentType}</span></div>
                  <p className="font-medium text-sm">{reviewing.reason}</p>
                  {reviewing.contentText && <p className="text-sm text-muted-foreground italic">"{reviewing.contentText}"</p>}
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Review Note (optional)</label>
                  <Textarea placeholder="Add a note about your decision…" value={reviewNote} onChange={e => setReviewNote(e.target.value)} rows={3} />
                </div>
              </div>
            )}
            <DialogFooter className="gap-2 flex-wrap">
              <Button variant="outline" onClick={() => { setReviewing(null); setReviewNote(""); }}>Cancel</Button>
              <Button variant="outline" onClick={() => reviewFlag("dismissed")} disabled={saving} className="text-muted-foreground">Dismiss</Button>
              <Button onClick={() => reviewFlag("actioned")} disabled={saving} className="bg-destructive hover:bg-destructive/90">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Take Action
              </Button>
              <Button onClick={() => reviewFlag("reviewed")} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Mark Reviewed
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
