import { DashboardLayout } from "@/components/DashboardLayout";
import { useListClasses, useRaiseHand, getApiUrl } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import { AuthenticatedMedia } from "@/components/AuthenticatedMedia";
import { Loader2, Video, Hand, HandMetal, Calendar, Clock, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

type TeacherReplyMessage = { id: number; senderId: number; senderRole: string; content: string; type: string; mediaUrl?: string | null; createdAt: string };

function TeacherReplyPreview({ teacherId, handRaiseId }: { teacherId: number; handRaiseId?: number }) {
  const [latest, setLatest] = useState<TeacherReplyMessage | null>(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const token = localStorage.getItem("dallyletter_token");
      try {
        if (!handRaiseId) { if (active) setLatest(null); return; }\n        const response = await fetch(getApiUrl(`/api/messages?recipientId=${teacherId}&handRaiseId=${handRaiseId}`), { headers: token ? { Authorization: `Bearer ${token}` } : {} , cache: "no-store" });
        if (!response.ok) return;
        const messages = await response.json() as TeacherReplyMessage[];
        const reply = messages.filter(message => message.senderId === teacherId && (message.senderRole === "teacher" || message.senderRole === "owner" || message.senderRole === "admin")).at(-1) ?? null;
        if (active) setLatest(reply);
      } catch { /* A conversation may not exist until the teacher replies. */ }
    };
    void load();
    const timer = window.setInterval(() => void load(), 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, [teacherId, handRaiseId]);
  if (!latest) return null;
  return <div className="mt-3 w-full rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-950">
    <p className="mb-1 text-xs font-semibold uppercase tracking-wide">Teacher reply</p>
    {latest.content && <p className="whitespace-pre-wrap break-words text-sm">{latest.content}</p>}
    {latest.mediaUrl && <div className="mt-2"><AuthenticatedMedia url={latest.mediaUrl} type={new URL(latest.mediaUrl, window.location.origin).searchParams.get("type")?.startsWith("image/") ? "image" : new URL(latest.mediaUrl, window.location.origin).searchParams.get("type")?.startsWith("video/") ? "video" : "document"} title={latest.content || "Teacher attachment"} /></div>}
  </div>;
}

export default function StudentClasses() {
  const { data: classes, isLoading } = useListClasses();
  const raiseHandMutation = useRaiseHand();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [question, setQuestion] = useState("");
  const [handRaiseMedia, setHandRaiseMedia] = useState<File | null>(null);
  const [uploadingHandRaise, setUploadingHandRaise] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  // Track which classId the student has a raised hand for and the handRaise id
  const [raisedHands, setRaisedHands] = useState<Record<number, number>>({}); // classId -> handRaiseId
  const [loweringHand, setLoweringHand] = useState<number | null>(null);
  const [deletingHand, setDeletingHand] = useState<number | null>(null);

  const handleRaiseHand = async () => {
    if (!selectedClassId || uploadingHandRaise) return;
    if (handRaiseMedia) {
      setUploadingHandRaise(true);
      try {
        const token = localStorage.getItem("dallyletter_token");
        const form = new FormData();
        form.set("classId", String(selectedClassId));
        form.set("question", question);
        form.set("file", handRaiseMedia);
        const response = await fetch(getApiUrl("/api/raise-hand/with-media"), {
          method: "POST",
          headers: token ? { Authorization: "Bearer " + token } : {},
          body: form,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Failed to raise hand with attachment");
        toast({ title: "Hand raised", description: "Your teacher has been notified." });
        setRaisedHands(prev => ({ ...prev, [selectedClassId]: result.id }));
        setIsDialogOpen(false);
        setQuestion("");
        setHandRaiseMedia(null);
        queryClient.invalidateQueries();
      } catch (error) {
        toast({ variant: "destructive", title: "Error", description: error instanceof Error ? error.message : "Failed to raise hand" });
      } finally {
        setUploadingHandRaise(false);
      }
      return;
    }
    raiseHandMutation.mutate({ data: { classId: selectedClassId, question } }, {
      onSuccess: (data) => {
        toast({ title: "Hand raised", description: "Your teacher has been notified." });
        setIsDialogOpen(false);
        setQuestion("");
        setHandRaiseMedia(null);
        setRaisedHands(prev => ({ ...prev, [selectedClassId]: (data as { id: number }).id }));
        queryClient.invalidateQueries();
      },
      onError: (error) => {
        toast({ variant: "destructive", title: "Error", description: error.message || "Failed to raise hand" });
      }
    });
  };

  const handleLowerHand = async (classId: number) => {
    const handRaiseId = raisedHands[classId];
    if (!handRaiseId) return;
    setLoweringHand(classId);
    try {
      const token = localStorage.getItem("dallyletter_token");
      const res = await fetch(getApiUrl(`/api/raise-hand/${handRaiseId}/resolve`), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast({ title: "Hand lowered" });
        setRaisedHands(prev => {
          const next = { ...prev };
          delete next[classId];
          return next;
        });
        queryClient.invalidateQueries();
      } else {
        throw new Error("Failed");
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not lower hand." });
    } finally {
      setLoweringHand(null);
    }
  };

  const handleDeleteHand = async (classId: number) => {
    const handRaiseId = raisedHands[classId];
    if (!handRaiseId || !window.confirm("Delete your hand raise and its attached media?")) return;
    setDeletingHand(classId);
    try {
      const token = localStorage.getItem("dallyletter_token");
      const response = await fetch(getApiUrl(`/api/raise-hand/${handRaiseId}`), { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Delete failed (${response.status})`);
      setRaisedHands(previous => { const next = { ...previous }; delete next[classId]; return next; });
      queryClient.invalidateQueries();
      toast({ title: "Hand raise deleted" });
    } catch (error) {
      toast({ variant: "destructive", title: "Delete failed", description: error instanceof Error ? error.message : "Could not delete hand raise." });
    } finally { setDeletingHand(null); }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "live": return "bg-destructive text-destructive-foreground animate-pulse";
      case "upcoming": return "bg-secondary text-secondary-foreground";
      case "completed": return "bg-muted text-muted-foreground";
      case "cancelled": return "bg-destructive/20 text-destructive";
      default: return "bg-primary text-primary-foreground";
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Live Classes</h1>
            <p className="text-muted-foreground">Join scheduled live sessions and interact with teachers.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {classes?.length === 0 ? (
              <div className="col-span-full text-center p-8 border rounded-lg bg-card">
                <p className="text-muted-foreground">No classes scheduled.</p>
              </div>
            ) : (
              classes?.map((c) => (
                <Card key={c.id} className="flex flex-col h-full border-l-4" style={{ borderLeftColor: c.status === 'live' ? 'hsl(var(--destructive))' : 'hsl(var(--primary))' }}>
                  <CardHeader>
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <Badge variant="outline" className="mb-2 bg-primary/5 text-primary border-primary/20">
                          {c.subject}
                        </Badge>
                        <CardTitle className="text-xl">{c.title}</CardTitle>
                        <CardDescription className="mt-1">Teacher: {c.teacherName}</CardDescription>
                      </div>
                      <Badge className={getStatusColor(c.status)}>
                        {c.status.toUpperCase()}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <p className="text-sm text-muted-foreground mb-4">{c.description || "No description provided."}</p>
                    {c.scheduledAt && (
                      <div className="flex items-center gap-4 text-sm text-foreground mb-2">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-4 w-4 text-primary" />
                          <span>{new Date(c.scheduledAt).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-4 w-4 text-primary" />
                          <span>{new Date(c.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="gap-2 pt-4 border-t flex-wrap">
                    <TeacherReplyPreview teacherId={c.teacherId} handRaiseId={raisedHands[c.id]} />
                    <Button
                      className="flex-1 gap-2"
                      variant={c.status === "live" ? "default" : "secondary"}
                      disabled={c.status !== "live" && c.status !== "upcoming"}
                      onClick={() => window.open(c.meetLink, "_blank")}
                    >
                      <Video className="h-4 w-4" />
                      {c.status === "live" ? "Join Now" : "Meeting Link"}
                    </Button>

                    {c.status === "live" && (
                      <>
                        {raisedHands[c.id] ? (
                          /* Lower Hand button */
                          <Button
                            variant="outline"
                            className="gap-2 border-amber-400 text-amber-600 hover:bg-amber-50"
                            onClick={() => handleLowerHand(c.id)}
                            disabled={loweringHand === c.id}
                          >
                            {loweringHand === c.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <HandMetal className="h-4 w-4" />
                            }
                            Lower Hand
                          </Button>
                          <Button variant="destructive" className="gap-2" disabled={deletingHand === c.id} onClick={() => void handleDeleteHand(c.id)} title="Delete hand raise and attached media">
                            {deletingHand === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
                          </Button>
                        ) : (
                          /* Raise Hand dialog */
                          <Dialog open={isDialogOpen && selectedClassId === c.id} onOpenChange={(open) => {
                            setIsDialogOpen(open);
                            if (open) setSelectedClassId(c.id);
                          }}>
                            <DialogTrigger asChild>
                              <Button variant="outline" className="gap-2">
                                <Hand className="h-4 w-4" />
                                Raise Hand
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Raise Hand</DialogTitle>
                                <DialogDescription>
                                  Have a question? Enter it below so the teacher knows what you need help with.
                                </DialogDescription>
                              </DialogHeader>
                              <div className="py-4">
                                <Textarea
                                  placeholder="Type your question here (optional)..."
                                  value={question}
                                  onChange={(e) => setQuestion(e.target.value)}
                                  rows={4}
                                />
                                <div className="mt-3 space-y-1">
                                  <label htmlFor={"hand-raise-media-" + c.id} className="text-sm font-medium">Attach a photo, PDF, audio or video (optional)</label>
                                  <input
                                    id={"hand-raise-media-" + c.id}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,application/pdf,audio/mpeg,audio/mp4,audio/ogg,audio/webm,audio/wav,video/mp4,video/webm,video/quicktime,video/ogg"
                                    onChange={(event) => setHandRaiseMedia(event.target.files?.[0] ?? null)}
                                    className="block w-full text-sm"
                                  />
                                  {handRaiseMedia && <p className="text-xs text-muted-foreground">Selected: {handRaiseMedia.name}</p>}
                                </div>
                              </div>
                              <DialogFooter>
                                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                                <Button onClick={handleRaiseHand} disabled={raiseHandMutation.isPending || uploadingHandRaise}>
                                  {(raiseHandMutation.isPending || uploadingHandRaise) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                  Submit
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        )}
                      </>
                    )}
                  </CardFooter>
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
