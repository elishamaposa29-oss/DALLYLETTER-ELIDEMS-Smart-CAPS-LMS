import { DashboardLayout } from "@/components/DashboardLayout";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Shield, CheckCircle, Trash2, Eye } from "lucide-react";

const token = () => localStorage.getItem("dallyletter_token") ?? "";
const severityColor: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-blue-100 text-blue-700 border-blue-200",
};
const categoryIcon: Record<string, string> = { cyberbullying:"😡", threat:"⚠️", abuse:"🚨", fraud:"💰", system:"⚙️", teacher:"👩‍🏫", general:"📋" };

export default function AdminOwnerAlerts() {
  const { toast } = useToast();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [resolution, setResolution] = useState("");
  const [filter, setFilter] = useState<"all"|"open"|"resolved">("all");

  const load = () => {
    void fetch("/api/owner-alerts", { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json()).then(d => { setAlerts(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const markRead = (id: number) => {
    void fetch(`/api/owner-alerts/${id}/read`, { method: "PUT", headers: { Authorization: `Bearer ${token()}` } }).then(() => load());
  };

  const resolve = () => {
    if (!selected) return;
    if (!resolution.trim()) { toast({ variant: "destructive", title: "Enter a resolution note" }); return; }
    void fetch(`/api/owner-alerts/${selected.id}/resolve`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ resolution }),
    }).then(r => {
      if (!r.ok) { toast({ variant: "destructive", title: "Failed to resolve" }); return; }
      toast({ title: "✅ Alert resolved" });
      setSelected(null); setResolution(""); load();
    });
  };

  const del = (id: number) => {
    void fetch(`/api/owner-alerts/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token()}` } }).then(() => load());
  };

  const filtered = alerts.filter(a => filter === "all" ? true : filter === "open" ? a.status === "open" : a.status === "resolved");
  const unread = alerts.filter(a => !a.isRead && a.status === "open").length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Shield className="h-6 w-6 text-red-500" /> Owner Alert Center
              {unread > 0 && <Badge className="bg-red-500 text-white text-xs">{unread} new</Badge>}
            </h1>
            <p className="text-slate-500 mt-1">Incident reports and critical alerts from your platform</p>
          </div>
        </div>

        <div className="flex gap-2">
          {(["all","open","resolved"] as const).map(f => (
            <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)} className="capitalize">
              {f} {f === "open" ? `(${alerts.filter(a => a.status === "open").length})` : ""}
            </Button>
          ))}
        </div>

        {loading ? <p className="text-slate-400 text-center py-10">Loading alerts…</p> : filtered.length === 0 ? (
          <div className="text-center py-16">
            <CheckCircle className="h-12 w-12 text-emerald-400 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No alerts</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(alert => (
              <Card key={alert.id} className={`border-0 shadow-sm ${!alert.isRead && alert.status === "open" ? "ring-2 ring-amber-200 bg-amber-50/30" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">{categoryIcon[alert.category] ?? "📋"}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-semibold text-slate-800 text-sm">{alert.title}</h3>
                        <Badge className={`text-[10px] border ${severityColor[alert.severity] ?? severityColor.medium}`}>{alert.severity}</Badge>
                        <Badge variant="outline" className="text-[10px] capitalize">{alert.category}</Badge>
                        {alert.status === "resolved" && <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Resolved</Badge>}
                        {!alert.isRead && alert.status === "open" && <Badge className="bg-amber-500 text-white text-[10px]">Unread</Badge>}
                      </div>
                      <p className="text-sm text-slate-600 mb-2">{alert.description}</p>
                      <p className="text-xs text-slate-400">By <span className="font-medium">{alert.reporterName}</span> ({alert.reporterRole}) · {new Date(alert.createdAt).toLocaleDateString()}</p>
                      {alert.resolution && <p className="text-xs text-emerald-600 mt-1 italic">Resolution: {alert.resolution}</p>}
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {!alert.isRead && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => markRead(alert.id)}><Eye className="h-3 w-3 mr-1" />Mark Read</Button>}
                      {alert.status === "open" && <Button size="sm" className="h-7 text-xs bg-emerald-600 text-white" onClick={() => { setSelected(alert); markRead(alert.id); }}><CheckCircle className="h-3 w-3 mr-1" />Resolve</Button>}
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" onClick={() => del(alert.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <Dialog open={!!selected} onOpenChange={() => { setSelected(null); setResolution(""); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Resolve Alert: {selected.title}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-slate-600">{selected.description}</p>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">Resolution Note *</label>
                <textarea className="w-full border rounded-lg px-3 py-2 text-sm min-h-[100px] resize-none" placeholder="Describe how this was handled…" value={resolution} onChange={e => setResolution(e.target.value)} />
              </div>
              <Button className="w-full bg-emerald-600 text-white" onClick={resolve}>Mark as Resolved</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </DashboardLayout>
  );
}
