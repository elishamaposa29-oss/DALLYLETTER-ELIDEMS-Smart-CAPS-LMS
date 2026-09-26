import { useState } from "react";
import { Plus, GripVertical, Trash2, Save, Send, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getApiUrl } from "@workspace/api-client-react";

interface ExerciseQuestionDraft {
  id: string;
  prompt: string;
  type: "input" | "poll" | "drawbox";
  marks: number;
}

interface ExerciseBuilderPanelProps {
  lessonId: number;
  onSaved?: () => void;
}

export function ExerciseBuilderPanel({ lessonId, onSaved }: ExerciseBuilderPanelProps) {
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [questions, setQuestions] = useState<ExerciseQuestionDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const addQuestion = (type: ExerciseQuestionDraft["type"] = "input") => {
    setQuestions((current) => [
      ...current,
      { id: crypto.randomUUID(), prompt: "", type, marks: 1 },
    ]);
  };

  const updateQuestion = (id: string, patch: Partial<ExerciseQuestionDraft>) => {
    setQuestions((current) => current.map((question) => question.id === id ? { ...question, ...patch } : question));
  };

  const removeQuestion = (id: string) => {
    setQuestions((current) => current.filter((question) => question.id !== id));
  };

  const save = async (publish: boolean) => {
    if (!title.trim() || questions.some((question) => !question.prompt.trim())) {
      setMessage("Add an exercise title and complete every question first.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const token = localStorage.getItem("dallyletter_token");
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const exerciseResponse = await fetch(getApiUrl(`/api/exercises/lessons/${lessonId}/exercises`), {
        method: "POST",
        headers,
        body: JSON.stringify({ title: title.trim(), instructions: instructions.trim() || undefined, layout: { version: 1, page: "book", mode: "freeform" } }),
      });
      if (!exerciseResponse.ok) throw new Error((await exerciseResponse.json().catch(() => null))?.error || "Could not create exercise");
      const exercise = await exerciseResponse.json() as { id: number };

      for (const [index, question] of questions.entries()) {
        const response = await fetch(getApiUrl(`/api/exercises/${exercise.id}/questions`), {
          method: "POST",
          headers,
          body: JSON.stringify({ prompt: question.prompt.trim(), type: question.type, marksAllocated: question.marks, position: index, config: { layout: "book" } }),
        });
        if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || `Could not save question ${index + 1}`);
      }

      if (publish) {
        const response = await fetch(getApiUrl(`/api/exercises/${exercise.id}/publish`), { method: "POST", headers });
        if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || "Could not publish exercise");
        setMessage("Exercise published and attached to this lesson.");
      } else {
        setMessage("Exercise saved as a draft.");
      }
      onSaved?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong while saving the exercise.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-primary/20 bg-card/80 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Lesson Exercise</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Build questions directly beside this lesson's media.</p>
          </div>
          <Badge variant="outline">Attached to lesson</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Exercise title" />
          <Input value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Instructions (optional)" />
        </div>

        <div className="rounded-xl border bg-background/60 p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => addQuestion("input")}><Plus className="mr-1 h-4 w-4" />Question</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => addQuestion("poll")}><Plus className="mr-1 h-4 w-4" />Poll</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => addQuestion("drawbox")}><Plus className="mr-1 h-4 w-4" />Drawbox</Button>
          </div>

          <div className="space-y-3">
            {questions.map((question, index) => (
              <div key={question.id} className="rounded-lg border bg-card p-3">
                <div className="mb-2 flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Badge variant="secondary">Q{index + 1} · {question.type}</Badge>
                  <div className="ml-auto flex items-center gap-2">
                    <Input type="number" min={0} step="0.5" className="w-20" value={question.marks} onChange={(event) => updateQuestion(question.id, { marks: Number(event.target.value) || 0 })} aria-label={`Marks for question ${index + 1}`} />
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeQuestion(question.id)} aria-label={`Remove question ${index + 1}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
                <Textarea value={question.prompt} onChange={(event) => updateQuestion(question.id, { prompt: event.target.value })} placeholder="Type the exercise question..." className="min-h-20" />
                {question.type === "drawbox" && <p className="mt-2 text-xs text-muted-foreground">Learners will receive a drawing workspace for this question.</p>}
                {question.type === "poll" && <p className="mt-2 text-xs text-muted-foreground">Poll option editing is the next builder layer; the question is already persisted as a poll type.</p>}
              </div>
            ))}
            {!questions.length && <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Add a question, poll, or drawbox to start.</div>}
          </div>
        </div>

        {message && <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm" role="status"><CheckCircle2 className="h-4 w-4" />{message}</div>}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => save(false)}><Save className="mr-2 h-4 w-4" />Save draft</Button>
          <Button type="button" disabled={busy || !questions.length} onClick={() => save(true)}><Send className="mr-2 h-4 w-4" />Publish exercise</Button>
        </div>
      </CardContent>
    </Card>
  );
}
