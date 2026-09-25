import { DashboardLayout } from "@/components/DashboardLayout";
import { getApiUrl } from "@workspace/api-client-react";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList, Plus, Calendar, BookOpen, Trash2 } from "lucide-react";

const token = () => localStorage.getItem("dallyletter_token") ?? "";

export default function AdminAssignments() {
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [materialUploading, setMaterialUploading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const emptyForm = { title: "", description: "", subject: "", grade: "", dueDate: "", totalMarks: "100", attachmentUrl: "" };
  const [form, setForm] = useState(emptyForm);

  const load = () => {
    void fetch(getApiUrl("/api/assignments"), { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json()).then(d => { setAssignments(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const uploadMaterial = (file: File | undefined) => {
    if (!file) return;
    setMaterialUploading(true);
    const body = new FormData();
    body.append("file", file);
    void fetch(getApiUrl("/api/assignments/material"), { method: "POST", headers: { Authorization: `Bearer ${token()}` }, body })
      .then(async response => {
        if (!response.ok) { const error = await response.json().catch(() => null) as { error?: string } | null; throw new Error(error?.error ?? "Material upload failed"); }
        return response.json() as Promise<{ attachmentUrl: string }>;
      })
      .then(result => setForm(formState => ({ ...formState, attachmentUrl: result.attachmentUrl })))
      .catch(error => toast({ variant: "destructive", title: error instanceof Error ? error.message : "Material upload failed" }))
      .finally(() => setMaterialUploading(false));
  };

  const saveAssignment = () => {
    if (!form.title || !form.subject || !form.dueDate) { toast({ variant: "destructive", title: "Fill required fields" }); return; }
    const totalMarks = Number(form.totalMarks);
    if (!Number.isInteger(totalMarks) || totalMarks <= 0 || totalMarks > 10000) { toast({ variant: "destructive", title: "Total marks must be between 1 and 10000" }); return; }
    const payload = { ...form, totalMarks, status: "active" };
    const request = editingId == null
      ? fetch(getApiUrl("/api/assignments"), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
          body: JSON.stringify(payload),
        })
      : fetch(getApiUrl(`/api/assignments/${editingId}`), {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
          body: JSON.stringify({ ...payload, status: "active" }),
        });

    void request.then(async r => {
      if (!r.ok) { const error = await r.json().catch(() => null) as { error?: string } | null; toast({ variant: "destructive", title: error?.error ?? (editingId == null ? "Failed to create" : "Failed to update") }); return; }
      toast({ title: editingId == null ? "✅ Assignment created" : "✅ Assignment updated" });
      resetForm();
      load();
    }).catch(() => toast({ variant: "destructive", title: editingId == null ? "Failed to create" : "Failed to update" }));
  };

  const del = (id: number) => {
    void fetch(getApiUrl(`/api/assignments/${id}`), { method: "DELETE", headers: { Authorization: `Bearer ${token()}` } })
      .then(() => load());
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><ClipboardList className="h-6 w-6 text-blue-600" /> Assignments</h1>
            <p className="text-slate-500 mt-1">Create and manage student assignments</p>
          </div>
          <Dialog open={open} onOpenChange={(value) => { if (!value) resetForm(); else setOpen(true); }}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-blue-600 text-white" onClick={() => { setEditingId(null); setForm(emptyForm); setOpen(true); }}><Plus className="h-4 w-4" /> New Assignment</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>{editingId == null ? "Create Assignment" : "Edit Assignment"}</DialogTitle></DialogHeader>
              <div className="space-y-3 mt-2">
                <Input placeholder="Title *" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                <textarea className="w-full border rounded-lg px-3 py-2 text-sm min-h-[100px] resize-none" placeholder="Project brief, requirements, procedure, rubric, or task description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                <Input type="url" placeholder="Reference material URL (PDF, video, document)" value={form.attachmentUrl} onChange={e => setForm(f => ({ ...f, attachmentUrl: e.target.value }))} />
                <Input type="file" accept="video/mp4,video/webm,video/quicktime,video/ogg,audio/mpeg,audio/mp4,audio/ogg,audio/wav,image/jpeg,image/png,image/webp,application/pdf,.doc,.docx" onChange={e => uploadMaterial(e.target.files?.[0])} disabled={materialUploading} />
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Subject *" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
                  <Input placeholder="Grade / stream" value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-slate-500 mb-1 block">Due Date *</label><Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
                  <div><label className="text-xs text-slate-500 mb-1 block">Total Marks</label><Input type="number" value={form.totalMarks} onChange={e => setForm(f => ({ ...f, totalMarks: e.target.value }))} /></div>
                </div>
                <Button className="w-full bg-blue-600 text-white" onClick={saveAssignment} disabled={materialUploading}>{materialUploading ? "Uploading material…" : (editingId == null ? "Create Assignment" : "Save changes")}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? <p className="text-center text-slate-400 py-10">Loading…</p> : (
          <div className="grid gap-4">
            {assignments.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No assignments yet. Create one to get started.</p>
              </div>
            ) : assignments.map(a => (
              <Card key={a.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold text-slate-800">{a.title}</h3>
                        <Badge variant="outline" className="text-xs">{a.subject}</Badge>
                        {a.grade && <Badge variant="secondary" className="text-xs">{a.grade}</Badge>}
                        <Badge className={`text-xs ${a.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{a.status}</Badge>
                      </div>
                      {a.description && <p className="text-sm text-slate-500 mb-2 whitespace-pre-wrap">{a.description}</p>}
                      {a.attachmentUrl && (
                        <a className="text-sm text-blue-700 hover:underline block mb-2" href={a.attachmentUrl} target="_blank" rel="noreferrer">
                          Open reference material
                        </a>
                      )}
                      <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Due: {a.dueDate}</span>
                        <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" /> {a.totalMarks} marks</span>
                        <span>By {a.teacherName}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => { setEditingId(a.id); setForm({ title: a.title, description: a.description ?? "", subject: a.subject, grade: a.grade ?? "", dueDate: a.dueDate, totalMarks: String(a.totalMarks), attachmentUrl: a.attachmentUrl ?? "" }); setOpen(true); }}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600 h-8 w-8 p-0" onClick={() => del(a.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
