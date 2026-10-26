import { useListLessons, getApiUrl } from "@workspace/api-client-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { AlertCircle, ArrowRight, BookOpen, CheckCircle2, ClipboardList, Loader2, RefreshCw } from "lucide-react";

type ExerciseRow = {
  id: number;
  lessonId: number;
  title: string;
  instructions?: string | null;
  status?: string;
  createdAt?: string;
  submissionStatus?: string;
  submission?: { status?: string; totalScore?: string | number | null; returnedAt?: string | null } | null;
};

export default function StudentExercises() {
  const { data: lessons, isLoading: lessonsLoading } = useListLessons();
  const [exercises, setExercises] = useState<ExerciseRow[]>([]);
  const [lessonTitles, setLessonTitles] = useState<Record<number,string>>({});
  const [loadingExercises, setLoadingExercises] = useState(false);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!Array.isArray(lessons)) return;
    let active = true;
    const load = async () => {
      setLoadingExercises(true);
      setError("");
      try {
        const tokenValue = localStorage.getItem("dallyletter_token") || "";
        const headers: Record<string,string> = tokenValue ? { Authorization: "Bearer " + tokenValue } : {};
        const availableLessons = lessons as Array<{id:number;title?:string;name?:string}>;
        const titles: Record<number,string> = {};
        for (const lesson of availableLessons) titles[Number(lesson.id)] = String(lesson.title || lesson.name || "Lesson");
        const responses = await Promise.all(availableLessons.map(async lesson => {
          const response = await fetch(getApiUrl("/api/exercises/lessons/" + encodeURIComponent(String(lesson.id)) + "/exercises"), { headers, cache: "no-store" });
          if (!response.ok) throw new Error("Exercises could not be loaded for every lesson (HTTP " + response.status + ").");
          const rows = await response.json().catch(() => []);
          return Array.isArray(rows) ? rows as ExerciseRow[] : [];
        }));
        if (active) {
          setLessonTitles(titles);
          setExercises(responses.flat().filter(row => row && Number.isFinite(Number(row.id))));
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Exercises could not be loaded. Check your connection and retry.");
      } finally {
        if (active) setLoadingExercises(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [lessons, retryKey]);

  const busy = lessonsLoading || loadingExercises;
  return <DashboardLayout>
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 pb-10 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Learning workspace</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Exercises & drawing tasks</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Find published exercises from your lessons, open each task, write answers or use the drawing canvas, and review returned marks.</p>
        </div>
        <Button variant="outline" onClick={() => setRetryKey(value => value + 1)} disabled={busy} aria-label="Refresh exercise list">
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </div>

      {error && <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="flex-1"><p>{error}</p><Button className="mt-2" size="sm" variant="outline" onClick={() => setRetryKey(value => value + 1)}>Retry loading exercises</Button></div>
      </div>}

      {busy ? <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-lg border p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading lessons and available exercises…</div>
      : exercises.length === 0 ? <Card><CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="rounded-full bg-muted p-4"><ClipboardList className="h-7 w-7 text-muted-foreground" /></div>
          <h2 className="text-lg font-semibold">No published exercises yet</h2>
          <p className="max-w-md text-sm text-muted-foreground">When your teacher publishes an exercise for one of your lessons, it will appear here. You can refresh this list at any time.</p>
          <Button variant="outline" onClick={() => setRetryKey(value => value + 1)}><RefreshCw className="mr-2 h-4 w-4" /> Check again</Button>
        </CardContent></Card>
      : <div className="grid gap-3 sm:grid-cols-2">
          {exercises.map(exercise => {
            const status = String(exercise.submissionStatus || exercise.submission?.status || "not_started");
            const returned = status === "marked" || Boolean(exercise.submission?.returnedAt);
            return <Card key={exercise.id} className="flex min-w-0 flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="rounded-lg bg-primary/10 p-2"><BookOpen className="h-5 w-5 text-primary" /></div>
                    <div className="min-w-0"><CardTitle className="break-words text-base">{exercise.title || "Untitled exercise"}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{lessonTitles[Number(exercise.lessonId)] || "Lesson"}</p></div>
                  </div>
                  <Badge variant={returned ? "default" : status === "not_started" ? "secondary" : "outline"}>{returned ? "Result returned" : status.replaceAll("_"," ")}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <p className="line-clamp-3 min-h-12 text-sm text-muted-foreground">{exercise.instructions || "Open this exercise to read the instructions and complete each question."}</p>
                {returned && <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 p-2 text-sm"><CheckCircle2 className="h-4 w-4 text-emerald-600" /><span>Latest result: {exercise.submission?.totalScore ?? "Marks available"} </span></div>}
                <div className="mt-auto"><Button className="w-full" onClick={() => { window.location.assign("/student/exercises/" + encodeURIComponent(String(exercise.id))); }}>Open exercise <ArrowRight className="ml-2 h-4 w-4" /></Button></div>
              </CardContent>
            </Card>;
          })}
        </div>}
      <p className="text-xs text-muted-foreground">Only exercises returned by the authenticated lesson API are listed. Your answers and results remain protected by the exercise endpoints.</p>
    </div>
  </DashboardLayout>;
}
