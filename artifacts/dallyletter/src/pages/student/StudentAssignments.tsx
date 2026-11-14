import { DashboardLayout } from "@/components/DashboardLayout";
import { AuthenticatedMedia } from "@/components/AuthenticatedMedia";
import { getApiUrl } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList, Calendar, BookOpen, Send, AlertTriangle } from "lucide-react";

const token = () => localStorage.getItem("dallyletter_token") ?? "";

function referenceMediaType(url: string): "image" | "video" | "audio" | "document" {
  try {
    const parsed = new URL(url, window.location.origin);
    const mime = (parsed.searchParams.get("type") ?? "").toLowerCase();
    const path = parsed.pathname.toLowerCase();
    if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/.test(path)) return "image";
    if (mime.startsWith("video/") || /\.(mp4|webm|mov|ogv)$/.test(path)) return "video";
    if (mime.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac)$/.test(path)) return "audio";
  } catch { /* fall through to document preview */ }
  return "document";
}

export default function StudentAssignments() {
  const { user } = useAuth();
  const previewOnly = user?.role !== "student";
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<Record<number, any>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [content, setContent] = useState("");
  const [submissionFile, setSubmissionFile] = useState<{ url: string; fileName: string } | null>(null);
  const [uploadingSubmissionFile, setUploadingSubmissionFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    void fetch(getApiUrl("/api/assignments"), { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => { if (!r.ok) throw new Error("Unable to load assignments"); return r.json(); })
      .then(async (data) => {
        const list = Array.isArray(data) ? data : [];
        setAssignments(list);
        const requestedAssignmentId = Number(new URLSearchParams(window.location.search).get("assignment"));
        if (Number.isInteger(requestedAssignmentId) && requestedAssignmentId > 0) {
          const requestedAssignment = list.find((assignment: any) => Number(assignment.id) === requestedAssignmentId);
          if (requestedAssignment) setSelected(requestedAssignment);
        }
        const subs: Record<number, any> = {};
        await Promise.all(list.map(async (a: any) => {
          try {
            const sr = await fetch(getApiUrl(`/api/assignments/${a.id}/submissions`), { headers: { Authorization: `Bearer ${token()}` } });
            if (!sr.ok) return;
            const sd = await sr.json().catch(() => []);
            if (Array.isArray(sd) && sd.length > 0) subs[a.id] = sd[0];
          } catch {
            // A submission lookup must never hide otherwise valid assignments.
          }
        }));
        setSubmissions(subs);
        setLoading(false);
      }).catch(() => {
        setLoading(false);
        toast({ variant: "destructive", title: "Unable to load assignments" });
      });
  };

  useEffect(() => { load(); }, []);

  const uploadSubmissionMaterial = (file: File | undefined) => {
    if (!file) return;
    setSubmissionFile(null);
    setUploadingSubmissionFile(true);
    const body = new FormData();
    body.append("file", file);
    void fetch(getApiUrl("/api/assignments/submission-material"), { method: "POST", headers: { Authorization: `Bearer ${token()}` }, body })
      .then(async response => {
        if (!response.ok) { const error = await response.json().catch(() => null) as { error?: string } | null; throw new Error(error?.error ?? "Attachment upload failed"); }
        return response.json() as Promise<{ attachmentUrl: string; fileName: string }>;
      })
      .then(result => setSubmissionFile({ url: result.attachmentUrl, fileName: result.fileName }))
      .catch(error => toast({ variant: "destructive", title: error instanceof Error ? error.message : "Attachment upload failed" }))
      .finally(() => setUploadingSubmissionFile(false));
  };

  const submit = () => {
    if (uploadingSubmissionFile) { toast({ variant: "destructive", title: "Wait for your attachment to finish uploading before submitting." }); return; }
    if (!selected || (!content.trim() && !submissionFile)) { toast({ variant: "destructive", title: "Write an answer or attach a file first" }); return; }
    if (isOverdue(selected.dueDate)) { toast({ variant: "destructive", title: "This assignment is past its due date" }); return; }
    setSubmitting(true);
    void fetch(getApiUrl(`/api/assignments/${selected.id}/submit`), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ content, fileUrl: submissionFile?.url ?? null, fileName: submissionFile?.fileName ?? null }),
    }).then(async r => {
      setSubmitting(false);
      if (!r.ok) {
        const error = await r.json().catch(() => null) as { error?: string } | null;
        toast({ variant: "destructive", title: error?.error ?? "Submission failed" });
        return;
      }
      toast({ title: "✅ Assignment submitted!" });
      setSelected(null); setContent(""); setSubmissionFile(null); load();
    }).catch(() => {
      setSubmitting(false);
      toast({ variant: "destructive", title: "Submission failed" });
    });
  };

  const openReference = async (url: string, title: string) => {
    if (!url.startsWith("/")) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    const tab = window.open("about:blank", "_blank");
    if (!tab) {
      toast({ variant: "destructive", title: "Allow pop-ups to open reference material" });
      return;
    }
    try {
      const response = await fetch(getApiUrl(url), { headers: { Authorization: `Bearer ${token()}` }, cache: "no-store" });
      if (!response.ok) throw new Error(`Reference material unavailable (${response.status})`);
      const blob = await response.blob();
      if (!blob.size) throw new Error("The reference file is empty");
      const objectUrl = URL.createObjectURL(blob);
      tab.document.title = title;
      tab.location.href = objectUrl;
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120000);
    } catch (error) {
      tab.close();
      toast({ variant: "destructive", title: "Could not open reference material", description: error instanceof Error ? error.message : "Please try again." });
    }
  };

  const isOverdue = (dueDate: string) => new Date(`${String(dueDate).slice(0, 10)}T23:59:59Z`).getTime() < Date.now();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-card via-card to-primary/[0.06] p-5 shadow-sm sm:p-6">
          <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl" />
          <p className="dallyletter-tech-label text-[10px] font-bold text-primary">Learner workspace · Academic missions</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div><h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl"><ClipboardList className="h-6 w-6 text-primary" /> My Assignments</h1><p className="mt-1 text-sm text-muted-foreground">Submit your work, monitor deadlines and review teacher feedback.</p></div>
            {!loading && <span className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary">{assignments.length} available</span>}
          </div>
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
                <Card key={a.id} className={`overflow-hidden border-l-4 bg-gradient-to-br from-card via-card to-primary/[0.025] shadow-sm ${overdue && !sub ? "border-l-red-500" : sub ? "border-l-emerald-500" : "border-l-primary"}`}>
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-semibold text-slate-800">{a.title}</h3>
                          <Badge variant="outline" className="text-xs">{a.subject}</Badge>
                          {a.grade && <Badge variant="secondary" className="text-xs">{a.grade}</Badge>}
                          {sub ? (
                            <Badge className={`text-xs ${sub.status === "graded" ? "border border-primary/20 bg-primary/10 text-primary" : "bg-emerald-100 text-emerald-700"}`}>
                              {sub.status === "graded" ? `Graded: ${sub.marks}/${a.totalMarks}` : "Submitted ✓"}
                            </Badge>
                          ) : overdue ? (
                            <Badge className="text-xs bg-red-100 text-red-700">Overdue</Badge>
                          ) : (
                            <Badge className="border border-primary/20 bg-primary/10 text-primary">Pending</Badge>
                          )}
                        </div>
                        {a.description && <p className="text-sm text-slate-500 mb-2">{a.description}</p>}
                        {a.attachmentUrl && <div className="mt-3 space-y-2 rounded-xl border border-primary/15 bg-primary/[0.04] p-3"><p className="dallyletter-tech-label text-[10px] font-semibold text-primary">Reference material</p><AuthenticatedMedia url={a.attachmentUrl} type={referenceMediaType(a.attachmentUrl)} title={`${a.title} reference material`} /><Button type="button" variant="outline" size="sm" onClick={() => void openReference(a.attachmentUrl, a.title)}>Open reference in new tab</Button></div>}
                        {sub?.feedback && <p className="mb-2 border-l-2 border-primary/30 pl-3 text-sm italic text-primary">Feedback: {sub.feedback}</p>}
                        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            {overdue && !sub ? <AlertTriangle className="h-3 w-3 text-red-500" /> : <Calendar className="h-3 w-3" />}
                            Due: {a.dueDate}
                          </span>
                          <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" /> {a.totalMarks} marks</span>
                        </div>
                      </div>
                      {!previewOnly && !sub && !overdue && (
                        <Button size="sm" className="gap-1.5 shadow-sm shadow-primary/20" onClick={() => { setSelected(a); setContent(""); setSubmissionFile(null); }}>
                          <Send className="h-3.5 w-3.5" /> Submit
                        </Button>
                      )}
                      {!previewOnly && sub && !overdue && (
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setSelected(a); setContent(sub.content ?? ""); }}>
                          Resubmit / Edit
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
              <div className="rounded-lg border border-primary/10 bg-primary/[0.035] p-3 text-sm text-foreground whitespace-pre-wrap">{selected.description || "No description provided."}</div>
              {selected.attachmentUrl && <div className="rounded-xl border p-3 space-y-2"><p className="text-sm font-semibold">Reference material</p><AuthenticatedMedia url={selected.attachmentUrl} type={referenceMediaType(selected.attachmentUrl)} title={`${selected.title} reference material`} /><Button type="button" variant="outline" size="sm" onClick={() => void openReference(selected.attachmentUrl, selected.title)}>Open in new tab</Button></div>}
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Your Answer</label>
                <textarea
                  className="min-h-[140px] w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  placeholder="Write your answer here…"
                  value={content}
                  onChange={e => setContent(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Optional attachment</label>
                <Input type="file" accept="video/mp4,video/webm,video/quicktime,video/ogg,audio/mpeg,audio/mp4,audio/ogg,audio/wav,image/jpeg,image/png,image/webp,application/pdf,.doc,.docx" disabled={uploadingSubmissionFile || submitting} onChange={e => uploadSubmissionMaterial(e.target.files?.[0])} />
                {uploadingSubmissionFile && <p role="status" className="text-xs text-primary">Uploading attachment… Please wait before submitting.</p>}
                {submissionFile && <p className="text-xs text-muted-foreground">Attached: {submissionFile.fileName}</p>}
              </div>
              <Button className="w-full gap-2 shadow-sm shadow-primary/20" onClick={submit} disabled={submitting || uploadingSubmissionFile}>
                <Send className="h-4 w-4" /> {submitting ? "Submitting…" : "Submit Assignment"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </DashboardLayout>
  );
}
