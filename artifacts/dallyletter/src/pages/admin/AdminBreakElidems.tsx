import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Play, Square, Trash2, Users, Calendar, Clock, Video, Star, CheckCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";

interface Volunteer { id: number; userName: string; userId: number; role: string; isSelected: boolean; details: string | null; createdAt: string; }
interface BreakEvent { id: number; title: string; description: string | null; eventDate: string; startTime: string; endTime: string; meetLink: string | null; status: string; createdAt: string; volunteers?: Volunteer[]; }

export default function AdminBreakElidems() {
  const { toast } = useToast();
  const [events, setEvents] = useState<BreakEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayEvent, setTodayEvent] = useState<BreakEvent | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<BreakEvent | null>(null);
  const [form, setForm] = useState({ title: "", description: "", eventDate: "", startTime: "10:00", endTime: "12:00", meetLink: "" });
  const [creating, setCreating] = useState(false);

  const token = () => localStorage.getItem("dallyletter_token");

  async function load() {
    setLoading(true);
    const [evR, todR] = await Promise.all([
      fetch("/api/break-elidems", { headers: { Authorization: `Bearer ${token()}` } }),
      fetch("/api/break-elidems/today", { headers: { Authorization: `Bearer ${token()}` } }),
    ]);
    if (evR.ok) setEvents(await evR.json());
    if (todR.ok) { const d = await todR.json(); setTodayEvent(d); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!form.title || !form.eventDate) { toast({ variant: "destructive", title: "Title and date required" }); return; }
    setCreating(true);
    const r = await fetch("/api/break-elidems", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify(form),
    });
    setCreating(false);
    if (r.ok) { toast({ title: "Event created! Notification sent to all users." }); setCreateOpen(false); setForm({ title: "", description: "", eventDate: "", startTime: "10:00", endTime: "12:00", meetLink: "" }); load(); }
    else toast({ variant: "destructive", title: "Failed to create event" });
  }

  async function updateStatus(id: number, status: string) {
    await fetch(`/api/break-elidems/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ status }),
    });
    toast({ title: status === "active" ? "Event is LIVE! 🎉 All users notified." : status === "ended" ? "Event ended." : "Status updated" });
    load();
  }

  async function deleteEvent(id: number) {
    await fetch(`/api/break-elidems/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token()}` } });
    toast({ title: "Event deleted" });
    load();
  }

  async function openEvent(id: number) {
    const r = await fetch(`/api/break-elidems/${id}`, { headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) setSelectedEvent(await r.json());
  }

  async function toggleSelect(eventId: number, volId: number, current: boolean) {
    await fetch(`/api/break-elidems/${eventId}/volunteers/${volId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ isSelected: !current }),
    });
    openEvent(eventId);
    if (selectedEvent) {
      const r = await fetch(`/api/break-elidems/${selectedEvent.id}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (r.ok) setSelectedEvent(await r.json());
    }
  }

  const statusColor = (s: string) => s === "active" ? "bg-emerald-100 text-emerald-800 border-emerald-300" : s === "ended" ? "bg-muted text-muted-foreground" : s === "cancelled" ? "bg-destructive/10 text-destructive" : "bg-amber-100 text-amber-800 border-amber-200";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Star className="h-7 w-7 text-amber-500" />BREAK-ELIDEMS
            </h1>
            <p className="text-muted-foreground">Daily community learning and engagement events.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2"><Plus className="h-4 w-4" />Schedule Event</Button>
        </div>

        {/* Today's event card */}
        {todayEvent && (
          <Card className={`border-2 ${todayEvent.status === "active" ? "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20"}`}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={statusColor(todayEvent.status)}>{todayEvent.status === "active" ? "🔴 LIVE NOW" : "TODAY"}</Badge>
                  </div>
                  <h3 className="text-xl font-bold">{todayEvent.title}</h3>
                  {todayEvent.description && <p className="text-sm text-muted-foreground mt-1">{todayEvent.description}</p>}
                  <div className="flex items-center gap-4 mt-2 text-sm">
                    <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-muted-foreground" />{todayEvent.startTime} – {todayEvent.endTime}</span>
                    {todayEvent.meetLink && <span className="flex items-center gap-1 text-primary"><Video className="h-3.5 w-3.5" /><a href={todayEvent.meetLink} target="_blank" rel="noreferrer" className="underline">Join Link</a></span>}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {todayEvent.status === "scheduled" && <Button size="sm" onClick={() => updateStatus(todayEvent.id, "active")} className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"><Play className="h-3.5 w-3.5" />Go Live</Button>}
                  {todayEvent.status === "active" && <Button size="sm" variant="outline" onClick={() => updateStatus(todayEvent.id, "ended")} className="gap-1.5"><Square className="h-3.5 w-3.5" />End Event</Button>}
                  <Button size="sm" variant="outline" onClick={() => openEvent(todayEvent.id)} className="gap-1.5"><Users className="h-3.5 w-3.5" />Volunteers</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Events list */}
        {loading ? <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> : (
          <div className="space-y-3">
            {events.length === 0 ? (
              <Card><CardContent className="p-10 text-center text-muted-foreground">No events scheduled. Create one to get started.</CardContent></Card>
            ) : events.map(ev => (
              <Card key={ev.id}>
                <div className="p-4 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className={statusColor(ev.status)}>{ev.status.toUpperCase()}</Badge>
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" />{ev.eventDate}</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{ev.startTime} – {ev.endTime}</span>
                    </div>
                    <p className="font-semibold truncate">{ev.title}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button variant="ghost" size="sm" onClick={() => openEvent(ev.id)} className="text-xs gap-1"><Users className="h-3.5 w-3.5" />Volunteers</Button>
                    {ev.status === "scheduled" && <Button size="sm" onClick={() => updateStatus(ev.id, "active")} className="text-xs bg-emerald-600 hover:bg-emerald-700 gap-1"><Play className="h-3 w-3" />Live</Button>}
                    {ev.status === "active" && <Button size="sm" variant="outline" onClick={() => updateStatus(ev.id, "ended")} className="text-xs gap-1"><Square className="h-3 w-3" />End</Button>}
                    <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => deleteEvent(ev.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Create Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>Schedule BREAK-ELIDEMS Event</DialogTitle><DialogDescription>Schedule a community learning event. All users will be notified.</DialogDescription></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5"><Label>Event Title *</Label><Input placeholder="e.g. Morning Motivation Session" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Description</Label><Textarea placeholder="What will happen at this event?" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-3 space-y-1.5"><Label>Event Date *</Label><Input type="date" value={form.eventDate} onChange={e => setForm(f => ({ ...f, eventDate: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Start Time</Label><Input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>End Time</Label><Input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} /></div>
              </div>
              <div className="space-y-1.5"><Label>Google Meet Link</Label><Input placeholder="https://meet.google.com/..." value={form.meetLink} onChange={e => setForm(f => ({ ...f, meetLink: e.target.value }))} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating}>{creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Schedule Event</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Volunteers Dialog */}
        <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
          <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Volunteers — {selectedEvent?.title}</DialogTitle></DialogHeader>
            {selectedEvent?.volunteers?.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No volunteers yet.</p>
            ) : (
              <div className="space-y-2 py-2">
                {selectedEvent?.volunteers?.map(v => (
                  <div key={v.id} className={`flex items-center justify-between border rounded-lg p-3 ${v.isSelected ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20" : ""}`}>
                    <div>
                      <p className="font-medium text-sm">{v.userName}</p>
                      <p className="text-xs text-muted-foreground capitalize">{v.role} {v.details ? `— "${v.details}"` : ""}</p>
                    </div>
                    <Button size="sm" variant={v.isSelected ? "default" : "outline"}
                      onClick={() => toggleSelect(selectedEvent.id, v.id, v.isSelected)}
                      className={v.isSelected ? "bg-emerald-600 hover:bg-emerald-700 gap-1.5" : "gap-1.5"}>
                      {v.isSelected ? <><CheckCircle className="h-3.5 w-3.5" />Selected</> : "Select"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
