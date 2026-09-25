import { getApiUrl } from "@workspace/api-client-react";
import { useCallback, useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Activity, Users, BookOpen, Video, ClipboardList, ShieldCheck } from "lucide-react";

type Service = { name: string; status: string; checkedAt: string; responseTimeMs?: number; message: string };
type Snapshot = Record<string, number | string | null>;
type Event = { eventId: string; timestamp: string; actor: string | null; actorRole: string | null; action: string; category: string; targetType: string | null; targetId: number | null; success: boolean };

const token = () => localStorage.getItem("dallyletter_token") ?? "";
const metricLabels: Record<string, string> = {
  students: "Students", teachers: "Teachers", prefects: "Prefects", managers: "Managers", activeUsers: "Active users",
  suspendedUsers: "Suspended users", blockedUsers: "Blocked users", lessons: "Lessons", classes: "Classes", assignments: "Assignments",
  revenue: "Revenue", outstandingPayments: "Outstanding payments", openAlerts: "Open alerts", criticalAlerts: "Critical alerts", unreadOwnerAlerts: "Unread owner alerts",
};
const metricIcons: Record<string, typeof Users> = { students: Users, teachers: Users, lessons: BookOpen, classes: Video, assignments: ClipboardList, openAlerts: ShieldCheck };

function OwnerCommandCenterPage() {
  const [health, setHealth] = useState<Service[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (nextOffset: number) => {
    setLoading(true); setError("");
    const headers = { Authorization: `Bearer ${token()}` };
    try {
      const responses = await Promise.all([
        fetch(getApiUrl("/api/owner/command-center/health"), { headers }),
        fetch(getApiUrl("/api/owner/command-center/snapshot"), { headers }),
        fetch(getApiUrl(`/api/owner/command-center/events?limit=10&offset=${nextOffset}`), { headers }),
      ]);
      if (responses.some((response) => response.status === 401)) throw new Error("Your session has expired. Please sign in again.");
      if (responses.some((response) => response.status === 403)) throw new Error("Owner access is required for this page.");
      if (responses.some((response) => !response.ok)) throw new Error("One or more command center services are unavailable.");
      const [healthData, snapshotData, eventData] = await Promise.all(responses.map((response) => response.json()));
      setHealth(healthData.services ?? []); setSnapshot(snapshotData); setEvents(eventData.events ?? []); setHasMore(Boolean(eventData.hasMore)); setOffset(nextOffset);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load the Owner Command Center."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(0); }, [load]);
  const display = (value: number | string | null | undefined) => value === null || value === undefined ? "Unavailable" : String(value);

  return <DashboardLayout><div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-widest text-primary">Owner operations</p><h1 className="text-3xl font-bold tracking-tight">Owner Command Center</h1><p className="text-muted-foreground">Live operational signals from protected platform APIs.</p></div><Button variant="outline" onClick={() => void load(offset)} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button></div>
    {error && <Card className="border-red-200 bg-red-50"><CardContent className="p-4 text-sm text-red-800">{error}</CardContent></Card>}
    {loading && !snapshot ? <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> : <>
      <section><div className="mb-3 flex items-center gap-2"><Activity className="h-5 w-5 text-primary" /><h2 className="text-xl font-semibold">Live Platform Health</h2></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{health.filter((service) => ["api", "database", "authentication", "ai"].includes(service.name)).map((service) => <Card key={service.name}><CardContent className="p-4"><div className="flex items-center justify-between gap-2"><span className="font-medium capitalize">{service.name}</span><span className={`rounded-full px-2 py-1 text-xs font-semibold ${service.status === "healthy" ? "bg-emerald-100 text-emerald-700" : service.status === "unknown" ? "bg-slate-100 text-slate-700" : "bg-red-100 text-red-700"}`}>{service.status}</span></div><p className="mt-2 text-xs text-muted-foreground">{service.message}</p><p className="mt-1 text-[11px] text-muted-foreground">{service.responseTimeMs === undefined ? "Latency unavailable" : `${service.responseTimeMs} ms`} · {new Date(service.checkedAt).toLocaleTimeString()}</p></CardContent></Card>)}</div></section>
      <section><h2 className="mb-3 text-xl font-semibold">Executive Snapshot</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{Object.entries(metricLabels).map(([key, label]) => { const Icon = metricIcons[key] ?? Activity; return <Card key={key}><CardContent className="p-4"><Icon className="mb-2 h-4 w-4 text-primary" /><p className="text-2xl font-bold">{display(snapshot?.[key])}</p><p className="text-xs text-muted-foreground">{label}</p></CardContent></Card>; })}</div></section>
      <section><Card><CardHeader><CardTitle>Recent Event Stream</CardTitle></CardHeader><CardContent className="space-y-3">{events.length === 0 ? <p className="text-sm text-muted-foreground">No events available.</p> : events.map((event) => <div key={event.eventId} className="flex flex-col gap-1 border-b pb-3 last:border-0"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{event.action}</span><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{event.category}</span></div><p className="text-xs text-muted-foreground">{event.actor ?? "Unknown actor"} ({event.actorRole ?? "unknown role"}) · {event.targetType ?? "No target"}{event.targetId ? ` #${event.targetId}` : ""} · {event.success ? "Success" : "Failed"} · {new Date(event.timestamp).toLocaleString()}</p></div>)}</CardContent><div className="flex justify-between border-t p-4"><Button variant="outline" size="sm" disabled={offset === 0 || loading} onClick={() => void load(Math.max(0, offset - 10))}>Previous</Button><Button variant="outline" size="sm" disabled={!hasMore || loading} onClick={() => void load(offset + 10)}>Next</Button></div></Card></section>
    </>}
  </div></DashboardLayout>;
}

export default function OwnerCommandCenter() { return <ProtectedRoute allowedRoles={["owner"]}><OwnerCommandCenterPage /></ProtectedRoute>; }
