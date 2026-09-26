import { useEffect, useMemo, useState } from "react";
import { Sparkles, AlertTriangle, CheckCircle2, Clock3, RotateCcw } from "lucide-react";
import { useRoute } from "wouter";
import { getApiUrl } from "@workspace/api-client-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

function DrawAnswer({ data }: { data: unknown }) {
  const d = data as { strokes?: { x: number; y: number; px: number; py: number }[] };
  return (
    <canvas
      width={900}
      height={320}
      className="w-full rounded border bg-white"
      ref={(canvas) => {
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.lineWidth = 2;
        for (const s of d?.strokes ?? []) {
          ctx.beginPath();
          ctx.moveTo(s.px, s.py);
          ctx.lineTo(s.x, s.y);
          ctx.stroke();
        }
      }}
    />
  );
}

interface Submission {
  id: number;
  learnerId: number;
  totalScore: string;
  percentage: string | null;
  status: string;
}

interface Answer {
  id: number;
  questionId: number;
  textAnswer: string | null;
  selectedValue: string | null;
  drawData: unknown;
  awardedMarks: string;
  correctionNotes: string | null;
}

interface Question {
  id: number;
  prompt: string;
  type: string;
  marksAllocated: string;
  position: number;
}

interface Exercise {
  id: number;
  title: string;
  totalMarks: string;
}

const statusMeta: Record<string, { label: string; className: string; icon: typeof Clock3 }> = {
  submitted: { label: "Awaiting teacher", className: "bg-amber-500/10 text-amber-700 border-amber-500/20", icon: Clock3 },
  ai_partial: { label: "Partially marked", className: "bg-orange-500/10 text-orange-700 border-orange-500/20", icon: AlertTriangle },
  ai_marked_pending_return: { label: "Awaiting teacher", className: "bg-blue-500/10 text-blue-700 border-blue-500/20", icon: Sparkles },
  marked: { label: "Returned", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20", icon: CheckCircle2 },
};

function SubmissionStatus({ status }: { status: string }) {
  const meta = statusMeta[status] ?? { label: status, className: "bg-muted text-muted-foreground", icon: Clock3 };
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={`gap-1 ${meta.className}`}>
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </Badge>
  );
}

export default function ExerciseMarking() {
  const [, params] = useRoute("/teacher/exercises/:id/mark");
  const id = params?.id;
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [marks, setMarks] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [message, setMessage] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessage, setAiMessage] = useState("");
  const [aiState, setAiState] = useState<"idle"|"checking"|"partially_marked"|"awaiting_teacher"|"returned">("idle");
  const [loading, setLoading] = useState(false);

  const token = localStorage.getItem("dallyletter_token");
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const selectedSubmission = useMemo(
    () => subs.find((s) => s.id === selected) ?? null,
    [subs, selected],
  );

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(getApiUrl(`/api/exercises/${id}`), { headers }).then((r) => r.json()),
      fetch(getApiUrl(`/api/exercises/${id}/submissions`), { headers }).then((r) => r.json()),
    ])
      .then(([exerciseData, submissionData]) => {
        if (cancelled) return;
        if (exerciseData?.exercise) setExercise(exerciseData.exercise);
        setQuestions(Array.isArray(exerciseData?.questions) ? exerciseData.questions : []);
        setSubs(Array.isArray(submissionData) ? submissionData : []);
      })
      .catch(() => setMessage("Could not load the exercise and submissions."))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const load = async (submissionId: number) => {
    if (!id) return;
    setSelected(submissionId);
    setMessage("");
    setAiMessage("");
    try {
      const r = await fetch(getApiUrl(`/api/exercises/${id}/submissions/${submissionId}`), { headers });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not load submission.");
      const loadedAnswers = (d.answers ?? []) as Answer[];
      setAnswers(loadedAnswers);
      setMarks(Object.fromEntries(loadedAnswers.map((a) => [a.id, a.awardedMarks])));
      setNotes(Object.fromEntries(loadedAnswers.map((a) => [a.id, a.correctionNotes ?? ""])));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load submission.");
    }
  };

  const runAIMarking = async () => {
    if (!id || selected === null) return;
    setAiBusy(true);
    setAiState("checking");
    setAiMessage("Checking learner work with ELIDEMS AI…");
    setMessage("");
    try {
      const r = await fetch(getApiUrl(`/api/exercises/${id}/ai-marking/${selected}/run`), {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
      });
      const d = await r.json();
      if (!r.ok) {
        setAiState("idle");
        setAiMessage(d.error || "AI marking could not start. The normal teacher workflow remains available.");
        return;
      }
      const nextLabel = d.needsReview ? "Partially marked — awaiting teacher review." : "AI marks prepared — awaiting teacher confirmation.";
      setAiState(d.needsReview ? "partially_marked" : "awaiting_teacher");
      setAiMessage(nextLabel);
      await load(selected);
      setSubs((current) =>
        current.map((x) => (x.id === selected ? { ...x, status: d.status } : x)),
      );
    } catch {
      setAiState("idle");
      setAiMessage("AI marking could not start. The normal teacher workflow remains available.");
    } finally {
      setAiBusy(false);
    }
  };

  const save = async () => {
    if (!id || selected === null) return;
    setMessage("");
    const r = await fetch(getApiUrl(`/api/exercises/${id}/submissions/${selected}/mark`), {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        marks: answers.map((a) => ({
          answerId: a.id,
          awardedMarks: Number(marks[a.id] ?? 0),
          correctionNotes: notes[a.id] ?? "",
        })),
      }),
    });
    const d = await r.json();
    if (!r.ok) {
      setMessage(d.error || "Marking failed.");
      return;
    }
    setMessage(`Result returned to learner: ${d.submission.totalScore} / ${exercise?.totalMarks ?? "—"} • ${d.submission.percentage}%`);
    setSubs((current) => current.map((x) => (x.id === selected ? d.submission : x)));
  };

  const selectedQuestion = (answer: Answer) =>
    questions.find((q) => q.id === answer.questionId);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-5 p-4">
        <Card>
          <CardHeader>
            <CardTitle>{exercise?.title ?? "Exercise submissions"}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Review learner work, use AI only as an assistant, then explicitly return the final result.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading submissions…</p>
            ) : subs.length ? (
              <div className="flex flex-wrap gap-2">
                {subs.map((s) => (
                  <Button
                    key={s.id}
                    variant={selected === s.id ? "default" : "outline"}
                    className="h-auto justify-start gap-2 p-3"
                    onClick={() => load(s.id)}
                  >
                    <span className="text-left">
                      <span className="block">Learner #{s.learnerId}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-xs opacity-90">
                        <SubmissionStatus status={s.status} />
                        <span>{s.totalScore} marks</span>
                      </span>
                    </span>
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No learner submissions yet.</p>
            )}
          </CardContent>
        </Card>

        {selected !== null && selectedSubmission && (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Review submission #{selected}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedSubmission.status === "marked"
                      ? "This result has already been returned. You can review it, but use the normal marking action only when a correction is needed."
                      : "AI proposals are editable. Nothing reaches the learner until you save and return the result."}
                  </p>
                </div>
                <SubmissionStatus status={selectedSubmission.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {answers.map((a, i) => {
                const q = selectedQuestion(a);
                return (
                  <div key={a.id} className="space-y-3 rounded-xl border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">Question {q?.position != null ? q.position + 1 : i + 1}</div>
                        {q?.prompt && <p className="mt-1 text-sm">{q.prompt}</p>}
                      </div>
                      <Badge variant="secondary">{q?.marksAllocated ?? "—"} marks</Badge>
                    </div>

                    <div className="rounded-lg bg-muted p-3 text-sm">
                      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Learner answer</div>
                      {a.textAnswer || a.selectedValue || (a.drawData ? <DrawAnswer data={a.drawData} /> : "No answer")}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1"><Button type="button" size="sm" variant="outline" onClick={()=>setMarks((m)=>({...m,[a.id]:q?.marksAllocated??"0"}))} aria-label={`Mark question ${i+1} correct`}>✓</Button><Button type="button" size="sm" variant="outline" onClick={()=>setMarks((m)=>({...m,[a.id]:"0"}))} aria-label={`Unmark question ${i+1}`}>×</Button><Input
                          type="number"
                          min="0"
                          max={q?.marksAllocated ?? undefined}
                          step="0.5"
                          value={marks[a.id] ?? "0"}
                          onChange={(e) => setMarks((m) => ({ ...m, [a.id]: e.target.value }))}
                          className="w-28"
                          aria-label={`Awarded marks for question ${i + 1}`}
                        />
                        <span className="text-sm text-muted-foreground">/ {q?.marksAllocated ?? "—"} • 0.5 steps</span>
                      </div>
                      <Textarea
                        value={notes[a.id] ?? ""}
                        onChange={(e) => setNotes((n) => ({ ...n, [a.id]: e.target.value }))}
                        placeholder="Correction / feedback"
                      />
                    </div>
                  </div>
                );
              })}

              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      <Sparkles className="h-4 w-4" /> ELIDEMS AI marking
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      AI can propose marks and feedback, including partial marking. Teacher review and confirmation are always required before return.
                    </p>
                  </div>
                  <Button onClick={runAIMarking} disabled={aiBusy || !selected || selectedSubmission.status === "marked"} variant="outline">
                    <Sparkles className="mr-2 h-4 w-4" />
                    {aiBusy ? "Checking…" : "Ask ELIDEMS AI to mark"}
                  </Button>
                </div>
                {aiMessage && (
                  <div className="mt-3 flex gap-2 rounded-lg bg-background p-3 text-sm" role="status">
                    {aiMessage.toLowerCase().includes("partially") ? (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-orange-600" />
                    ) : (
                      <Sparkles className="h-4 w-4 shrink-0" />
                    )}
                    <span>{aiMessage}</span>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2 text-xs" aria-label="AI marking workflow state"><Badge variant={aiState==="checking"?"default":"outline"}>Checking</Badge><Badge variant={aiState==="awaiting_teacher"?"default":"outline"}>Ready</Badge><Badge variant={aiState==="partially_marked"?"default":"outline"}>Partially marked</Badge><Badge variant={aiState==="awaiting_teacher"||aiState==="partially_marked"?"default":"outline"}>Awaiting teacher</Badge><Badge variant={selectedSubmission.status==="marked"?"default":"outline"}>Returned</Badge></div>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t pt-4">
                <Button onClick={save} disabled={!answers.length}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Save marks & return result
                </Button>
                {selectedSubmission.status === "marked" && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <RotateCcw className="h-3.5 w-3.5" />
                    Review mode
                  </span>
                )}
                {message && <span className="text-sm text-muted-foreground">{message}</span>}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
