import { DashboardLayout } from "@/components/DashboardLayout";
import { useListClasses, useRaiseHand } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { Loader2, Video, Hand, HandMetal, Calendar, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function StudentClasses() {
  const { data: classes, isLoading } = useListClasses();
  const raiseHandMutation = useRaiseHand();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [question, setQuestion] = useState("");
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  // Track which classId the student has a raised hand for and the handRaise id
  const [raisedHands, setRaisedHands] = useState<Record<number, number>>({}); // classId -> handRaiseId
  const [loweringHand, setLoweringHand] = useState<number | null>(null);

  const handleRaiseHand = () => {
    if (!selectedClassId) return;
    raiseHandMutation.mutate({ data: { classId: selectedClassId, question } }, {
      onSuccess: (data) => {
        toast({ title: "Hand raised", description: "Your teacher has been notified." });
        setIsDialogOpen(false);
        setQuestion("");
        // Store the handRaise id so we can lower it
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
      const res = await fetch(`/api/raise-hand/${handRaiseId}/resolve`, {
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
                              </div>
                              <DialogFooter>
                                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                                <Button onClick={handleRaiseHand} disabled={raiseHandMutation.isPending}>
                                  {raiseHandMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
