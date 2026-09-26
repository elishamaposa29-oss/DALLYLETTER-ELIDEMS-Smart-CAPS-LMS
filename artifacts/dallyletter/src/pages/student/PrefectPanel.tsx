import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calendar, Shield, Users, MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl } from "@workspace/api-client-react";

type Teacher = { id: number; name: string; subject: string | null };
type Prefect = { id: number; name: string; grade: string | null; performanceScore: number | null; badgeCount: number | null };
const token = () => localStorage.getItem("dallyletter_token") ?? "";

export default function PrefectPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [prefects, setPrefects] = useState<Prefect[]>([]);
  const [teacherId, setTeacherId] = useState("");
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token()}` };
    Promise.all([
      fetch(getApiUrl("/api/achievements/prefect-teachers"), { headers }).then(r => r.ok ? r.json() : []),
      fetch(getApiUrl("/api/achievements/prefect-leaderboard"), { headers }).then(r => r.ok ? r.json() : []),
    ]).then(([t, p]) => {
      setTeachers(Array.isArray(t) ? t : []);
      setPrefects(Array.isArray(p) ? p : []);
    }).finally(() => setLoading(false));
  }, []);

  const requestLesson = async () => {
    if (!teacherId || !topic.trim()) { toast({ variant: "destructive", title: "Teacher and topic required" }); return; }
    setSending(true);
    try {
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token()}` };
      const teacher = teachers.find(t => String(t.id) === teacherId);
      const message = `Lesson request from Prefect ${user?.name}: "${topic.trim()}".${date ? ` Preferred date: ${date}.` : ""}${notes.trim() ? ` Notes: ${notes.trim()}` : ""}`;
      const [n, m] = await Promise.all([
        fetch(getApiUrl("/api/notifications"), { method: "POST", headers, body: JSON.stringify({ title: `Lesson Request: ${topic.trim()}`, message, type: "class_starting", recipientId: Number(teacherId) }) }),
        fetch(getApiUrl("/api/messages"), { method: "POST", headers, body: JSON.stringify({ content: message, type: "text", recipientId: Number(teacherId) }) }),
      ]);
      if (!n.ok || !m.ok) throw new Error("The request could not be delivered.");
      toast({ title: "Lesson request sent", description: `Sent to ${teacher?.name ?? "teacher"} via notifications and private chat.` });
      setTopic(""); setNotes(""); setDate("");
    } catch (e) { toast({ variant: "destructive", title: "Request failed", description: e instanceof Error ? e.message : "Please try again." }); }
    finally { setSending(false); }
  };

  return <DashboardLayout><div className="space-y-6">
    <div className="rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 p-5 text-white"><div className="flex items-center gap-3"><Shield className="h-6 w-6" /><div><h1 className="text-2xl font-bold">Prefect Dashboard</h1><p className="text-amber-50 text-sm">Coordinate learning requests and connect with teachers.</p></div></div></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" />Request a Lesson</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="space-y-2"><Label>Teacher</Label><Select value={teacherId} onValueChange={setTeacherId}><SelectTrigger><SelectValue placeholder={loading ? "Loading teachers…" : "Select a teacher"} /></SelectTrigger><SelectContent>{teachers.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}{t.subject ? ` — ${t.subject}` : ""}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Lesson topic</Label><Textarea value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. Simultaneous equations" /></div>
      <div className="space-y-2"><Label>Preferred date</Label><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm" /></div>
      <div className="space-y-2"><Label>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="What should the teacher cover?" /></div>
      <Button onClick={requestLesson} disabled={sending || loading} className="w-full gap-2">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}Send to Teacher</Button>
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Other Prefects</CardTitle></CardHeader><CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">{prefects.map(p => <div key={p.id} className="rounded-xl border p-3 flex items-center gap-3"><div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center font-bold text-amber-700">{p.name.charAt(0)}</div><div className="min-w-0 flex-1"><p className="font-semibold truncate">{p.name}{p.id === user?.id ? " (You)" : ""}</p><p className="text-xs text-muted-foreground">{p.grade ?? "Learner"}</p></div><Badge variant="secondary">{p.badgeCount ?? 0} badges</Badge></div>)}</CardContent></Card>
  </div></DashboardLayout>;
}
