import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList, Calendar, BookOpen, Send, AlertTriangle } from "lucide-react";

const token = () => localStorage.getItem("dallyletter_token") ?? "";

export default function StudentAssignments() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<Record<number, any>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    void fetch("/api/assignments", { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json())
      .then(async (data) => {
        const list = Array.isArray(data) ? data : [];
        setAssignments(list);
        const subs: Record<number, any> = {};
        await Promise.all(list.map(async (a: any) => {
          const sr = await fetch(`/api/assignments/${a.id}/submissions`, { headers: { Authorization: `Bearer ${token()}` } });
          const sd = await sr.json();
          if (Array.isArray(sd) && sd.length > 0) subs[a.id] = sd[0];
        }));
        setSubmissions(subs);
        setLoading(false);
      }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const submit = () => {
    if (!selected || !content.trim()) { toast({ variant: "destructive", title: "Write your answer first" }); return; }
    setSubmitting(true);
    void fetch(`/api/assignments/${selected.id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ content }),
    }).then(r => {
      setSubmitting(false);
      if (!r.ok) { toast({ variant: "destructive", title: "Submission failed" }); return; }
      toast({ title: "✅ Assignment submitted!" });
      setSelected(null); setContent(""); load();
    });
  };

  const isOverdue = (dueDate: string) => new Date(dueDate) < new Date();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-blue-600" /> My Assignments
          </h1>
          <p className="text-slate-500 mt-1">Submit your work and track your grades</p>
        </div>

        {loading ? <p className="text-center text-slate-400 py-10">Loading…</p> : (
          <div className="space-y-4">
            {assignments.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No assignments yet</p>
              </div>
            ) : assignments.map(a => {
              const sub = submissions[a.id];
              const overdue = isOverdue(a.dueDate);
              return (
                <Card key={a.id} className={`border-0 shadow-sm ${overdue && !sub ? "border-l-4 border-l-red-400" : sub ? "border-l-4 border-l-emerald-400" : "border-l-4 border-l-blue-400"}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-semibold text-slate-800">{a.title}</h3>
                          <Badge variant="outline" className="text-xs">{a.subject}</Badge>
                          {a.grade && <Badge variant="secondary" className="text-xs">{a.grade}</Badge>}
                          {sub ? (
                            <Badge className={`text-xs ${sub.status === "graded" ? "bg-purple-100 text-purple-700" : "bg-emerald-100 text-emerald-700"}`}>
                              {sub.status === "graded" ? `Graded: ${sub.marks}/${a.totalMarks}` : "Submitted ✓"}
                            </Badge>
                          ) : overdue ? (
                            <Badge className="text-xs bg-red-100 text-red-700">Overdue</Badge>
                          ) : (
                            <Badge className="text-xs bg-blue-100 text-blue-700">Pending</Badge>
                          )}
                        </div>
                        {a.description && <p className="text-sm text-slate-500 mb-2">{a.description}</p>}
                        {sub?.feedback && <p className="text-sm text-purple-600 italic mb-2">Feedback: {sub.feedback}</p>}
                        <div className="flex items-center gap-4 text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            {overdue && !sub ? <AlertTriangle className="h-3 w-3 text-red-500" /> : <Calendar className="h-3 w-3" />}
                            Due: {a.dueDate}
                          </span>
                          <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" /> {a.totalMarks} marks</span>
                        </div>
                      </div>
                      {!sub && (
                        <Button size="sm" className="bg-blue-600 text-white gap-1.5" onClick={() => { setSelected(a); setContent(""); }}>
                          <Send className="h-3.5 w-3.5" /> Submit
                        </Button>
                      )}
                      {sub && sub.status !== "graded" && (
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setSelected(a); setContent(sub.content ?? ""); }}>
                          Edit Submission
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>{selected.title}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600">{selected.description || "No description provided."}</div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">Your Answer</label>
                <textarea
                  className="w-full border rounded-lg px-3 py-2 text-sm min-h-[140px] resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Write your answer here…"
                  value={content}
                  onChange={e => setContent(e.target.value)}
                />
              </div>
              <Button className="w-full bg-blue-600 text-white gap-2" onClick={submit} disabled={submitting}>
                <Send className="h-4 w-4" /> {submitting ? "Submitting…" : "Submit Assignment"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </DashboardLayout>
  );
}
