import { DashboardLayout } from "@/components/DashboardLayout";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList, Plus, Calendar, BookOpen, Eye, Star } from "lucide-react";

const token = () => localStorage.getItem("dallyletter_token") ?? "";

export default function TeacherAssignments() {
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [viewSubs, setViewSubs] = useState<{ assignment: any; submissions: any[] } | null>(null);
  const [grading, setGrading] = useState<{ subId: number; marks: string; feedback: string } | null>(null);
  const [form, setForm] = useState({ title: "", description: "", subject: "", grade: "", dueDate: "", totalMarks: "100" });

  const load = () => {
    void fetch("/api/assignments", { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json()).then(d => { setAssignments(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const create = () => {
    if (!form.title || !form.subject || !form.dueDate) { toast({ variant: "destructive", title: "Fill required fields" }); return; }
    void fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ ...form, totalMarks: parseInt(form.totalMarks) }),
    }).then(r => {
      if (!r.ok) { toast({ variant: "destructive", title: "Failed to create" }); return; }
      toast({ title: "✅ Assignment created" });
      setOpen(false);
      setForm({ title: "", description: "", subject: "", grade: "", dueDate: "", totalMarks: "100" });
      load();
    });
  };

  const loadSubs = (assignment: any) => {
    void fetch(`/api/assignments/${assignment.id}/submissions`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json())
      .then(subs => setViewSubs({ assignment, submissions: Array.isArray(subs) ? subs : [] }));
  };

  const grade = () => {
    if (!grading) return;
    void fetch(`/api/assignments/submissions/${grading.subId}/grade`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ marks: grading.marks, feedback: grading.feedback }),
    }).then(r => {
      if (!r.ok) { toast({ variant: "destructive", title: "Grading failed" }); return; }
      toast({ title: "✅ Graded successfully" });
      setGrading(null);
      if (viewSubs) loadSubs(viewSubs.assignment);
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><ClipboardList className="h-6 w-6 text-emerald-600" /> My Assignments</h1>
            <p className="text-slate-500 mt-1">Create, manage, and grade student submissions</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-emerald-600 text-white"><Plus className="h-4 w-4" /> New Assignment</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>Create Assignment</DialogTitle></DialogHeader>
              <div className="space-y-3 mt-2">
                <Input placeholder="Title *" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                <textarea className="w-full border rounded-lg px-3 py-2 text-sm min-h-[80px] resize-none" placeholder="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Subject *" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
                  <Input placeholder="Grade (e.g. Grade 10)" value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-slate-500 mb-1 block">Due Date *</label><Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
                  <div><label className="text-xs text-slate-500 mb-1 block">Total Marks</label><Input type="number" value={form.totalMarks} onChange={e => setForm(f => ({ ...f, totalMarks: e.target.value }))} /></div>
                </div>
                <Button className="w-full bg-emerald-600 text-white" onClick={create}>Create</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? <p className="text-center text-slate-400 py-10">Loading…</p> : (
          <div className="space-y-3">
            {assignments.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No assignments yet. Create your first one!</p>
              </div>
            ) : assignments.map(a => (
              <Card key={a.id} className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-semibold text-slate-800">{a.title}</h3>
                        <Badge variant="outline" className="text-xs">{a.subject}</Badge>
                        {a.grade && <Badge variant="secondary" className="text-xs">{a.grade}</Badge>}
                        <Badge className={`text-xs ${a.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{a.status}</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-400 mt-1">
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Due: {a.dueDate}</span>
                        <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" /> {a.totalMarks} marks</span>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => loadSubs(a)}>
                      <Eye className="h-3.5 w-3.5" /> Submissions
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {viewSubs && (
        <Dialog open={!!viewSubs} onOpenChange={() => setViewSubs(null)}>
          <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Submissions: {viewSubs.assignment.title}</DialogTitle></DialogHeader>
            {viewSubs.submissions.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-6">No submissions yet</p>
            ) : (
              <div className="space-y-3">
                {viewSubs.submissions.map(sub => (
                  <div key={sub.id} className="border rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium text-slate-800 text-sm">{sub.studentName}</p>
                      <Badge className={`text-xs ${sub.status === "graded" ? "bg-purple-100 text-purple-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {sub.status === "graded" ? `${sub.marks}/${viewSubs.assignment.totalMarks}` : "Submitted"}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-2 mb-2">{sub.content}</p>
                    {sub.feedback && <p className="text-xs text-purple-600 italic">Feedback: {sub.feedback}</p>}
                    {sub.status !== "graded" && (
                      <Button size="sm" className="bg-purple-600 text-white gap-1.5 mt-2" onClick={() => setGrading({ subId: sub.id, marks: "", feedback: "" })}>
                        <Star className="h-3.5 w-3.5" /> Grade
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}

      {grading && (
        <Dialog open={!!grading} onOpenChange={() => setGrading(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle>Grade Submission</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input type="number" placeholder="Marks" value={grading.marks} onChange={e => setGrading(g => g ? { ...g, marks: e.target.value } : null)} />
              <textarea className="w-full border rounded-lg px-3 py-2 text-sm min-h-[80px] resize-none" placeholder="Feedback for student…" value={grading.feedback} onChange={e => setGrading(g => g ? { ...g, feedback: e.target.value } : null)} />
              <Button className="w-full bg-purple-600 text-white" onClick={grade}>Save Grade</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </DashboardLayout>
  );
}
