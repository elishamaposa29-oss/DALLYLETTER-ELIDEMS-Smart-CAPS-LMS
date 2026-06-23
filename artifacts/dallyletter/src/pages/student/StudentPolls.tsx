import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ClipboardList, Play, CheckCircle, XCircle, Trophy, Clock, ChevronRight, ChevronLeft, BarChart3 } from "lucide-react";

interface Poll { id: number; title: string; grade: string | null; subject: string | null; mode: string; status: string; timerSeconds: number | null; type: string; }
interface PollOption { id: number; text: string; isCorrect?: boolean; }
interface PollQuestion { id: number; question: string; difficulty: string; explanation: string | null; options: PollOption[]; }
interface PollDetail extends Poll { questions: PollQuestion[]; }
interface SubmitResult { score: number; totalQuestions: number; percentage: number; feedback: { questionId: number; question: string; explanation: string | null; correctText: string | null; submittedOptionId: number | null; isCorrect: boolean; }[]; }
interface LeaderEntry { studentName: string; score: number; totalQuestions: number; }

type Screen = "list" | "quiz" | "results" | "leaderboard";

export default function StudentPolls() {
  const { toast } = useToast();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>("list");
  const [activePoll, setActivePoll] = useState<PollDetail | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [currentQ, setCurrentQ] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<SubmitResult | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([]);
  const [selectedPollId, setSelectedPollId] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const token = () => localStorage.getItem("dallyletter_token");

  useEffect(() => {
    fetch("/api/polls", { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json()).then(d => { setPolls(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (screen === "quiz" && activePoll?.timerSeconds && timeLeft === null) {
      setTimeLeft(activePoll.timerSeconds);
      return;
    }
    if (screen === "quiz" && timeLeft !== null && timeLeft > 0) {
      timerRef.current = setInterval(() => setTimeLeft(t => (t ?? 1) - 1), 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
    if (timeLeft === 0) { handleSubmit(); }
    return;
  }, [screen, timeLeft]);

  async function startPoll(pollId: number) {
    const r = await fetch(`/api/polls/${pollId}`, { headers: { Authorization: `Bearer ${token()}` } });
    if (!r.ok) { toast({ variant: "destructive", title: "Could not load poll" }); return; }
    const poll = await r.json() as PollDetail;
    setActivePoll(poll);
    setAnswers({});
    setCurrentQ(0);
    setTimeLeft(null);
    setScreen("quiz");
  }

  async function handleSubmit() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!activePoll) return;
    setSubmitting(true);
    const answerArray = activePoll.questions.map(q => ({ questionId: q.id, optionId: answers[q.id] ?? -1 }));
    try {
      const r = await fetch(`/api/polls/${activePoll.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ answers: answerArray }),
      });
      if (r.status === 400) {
        const d = await r.json() as { error: string };
        if (d.error === "Already submitted") {
          toast({ title: "You've already submitted this poll" });
          setScreen("list");
          return;
        }
      }
      const data = await r.json() as SubmitResult;
      setResults(data);
      setScreen("results");
    } catch {
      toast({ variant: "destructive", title: "Submission failed" });
    } finally {
      setSubmitting(false);
    }
  }

  async function loadLeaderboard(pollId: number) {
    setSelectedPollId(pollId);
    const r = await fetch(`/api/polls/${pollId}/results`, { headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) { const d = await r.json(); setLeaderboard(d.submissions ?? []); setScreen("leaderboard"); }
  }

  function formatTime(s: number) { return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`; }

  const currentQuestion = activePoll?.questions[currentQ];
  const progress = activePoll ? ((currentQ + 1) / activePoll.questions.length) * 100 : 0;
  const answered = Object.keys(answers).length;

  if (screen === "quiz" && activePoll && currentQuestion) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-lg">{activePoll.title}</h2>
              <p className="text-sm text-muted-foreground">Question {currentQ + 1} of {activePoll.questions.length}</p>
            </div>
            {timeLeft !== null && (
              <div className={`flex items-center gap-1.5 font-mono text-lg font-bold ${timeLeft < 60 ? "text-destructive" : "text-primary"}`}>
                <Clock className="h-5 w-5" />{formatTime(timeLeft)}
              </div>
            )}
          </div>
          <Progress value={progress} className="h-2" />
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize text-xs">{currentQuestion.difficulty}</Badge>
                <span className="text-xs text-muted-foreground">{activePoll.grade} {activePoll.subject}</span>
              </div>
              <p className="text-lg font-semibold leading-relaxed">{currentQuestion.question}</p>
              <div className="space-y-2.5">
                {currentQuestion.options.map(opt => (
                  <button key={opt.id} onClick={() => setAnswers(a => ({ ...a, [currentQuestion.id]: opt.id }))}
                    className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all text-sm font-medium ${answers[currentQuestion.id] === opt.id ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-muted-foreground/40 hover:bg-muted/50"}`}>
                    {opt.text}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => setCurrentQ(q => Math.max(0, q - 1))} disabled={currentQ === 0} className="gap-1.5"><ChevronLeft className="h-4 w-4" />Back</Button>
            <span className="text-sm text-muted-foreground">{answered}/{activePoll.questions.length} answered</span>
            {currentQ < activePoll.questions.length - 1 ? (
              <Button onClick={() => setCurrentQ(q => q + 1)} className="gap-1.5">Next<ChevronRight className="h-4 w-4" /></Button>
            ) : (
              <Button onClick={handleSubmit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}Submit Quiz
              </Button>
            )}
          </div>
          <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => { if (timerRef.current) clearInterval(timerRef.current); setScreen("list"); }}>Exit without submitting</Button>
        </div>
      </DashboardLayout>
    );
  }

  if (screen === "results" && results) {
    const pct = results.percentage;
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="text-center space-y-3">
            <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto text-3xl font-bold ${pct >= 70 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30" : pct >= 50 ? "bg-amber-100 text-amber-700 dark:bg-amber-950/30" : "bg-destructive/10 text-destructive"}`}>
              {pct}%
            </div>
            <h2 className="text-2xl font-bold">{pct >= 70 ? "Excellent work! 🎉" : pct >= 50 ? "Good effort! 👍" : "Keep practising! 💪"}</h2>
            <p className="text-muted-foreground">You scored {results.score} out of {results.totalQuestions} questions correctly.</p>
          </div>
          <div className="space-y-3">
            <h3 className="font-semibold">Question Review</h3>
            {results.feedback.map((f, i) => (
              <Card key={f.questionId} className={f.isCorrect ? "border-emerald-200 dark:border-emerald-800" : "border-destructive/30"}>
                <CardContent className="p-4">
                  <div className="flex gap-3">
                    {f.isCorrect ? <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" /> : <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />}
                    <div>
                      <p className="font-medium text-sm">{f.question}</p>
                      {!f.isCorrect && f.correctText && <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">✓ Correct answer: {f.correctText}</p>}
                      {f.explanation && <p className="text-xs text-muted-foreground mt-1 italic">{f.explanation}</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setScreen("list")} className="flex-1">Back to Polls</Button>
            {activePoll && <Button onClick={() => loadLeaderboard(activePoll.id)} className="flex-1 gap-2"><Trophy className="h-4 w-4" />Leaderboard</Button>}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (screen === "leaderboard") {
    return (
      <DashboardLayout>
        <div className="max-w-lg mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-500" />Leaderboard</h2>
            <Button variant="outline" size="sm" onClick={() => setScreen(results ? "results" : "list")}>Back</Button>
          </div>
          {leaderboard.length === 0 ? <Card><CardContent className="p-8 text-center text-muted-foreground">No submissions yet.</CardContent></Card> : (
            <div className="space-y-2">
              {leaderboard.map((entry, i) => (
                <div key={i} className={`flex items-center justify-between border rounded-lg p-3 ${i === 0 ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20" : i === 1 ? "border-slate-300 bg-slate-50 dark:bg-slate-900/20" : i === 2 ? "border-orange-200 bg-orange-50 dark:bg-orange-950/20" : ""}`}>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-lg w-7 text-center">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i+1}`}</span>
                    <span className="font-medium">{entry.studentName}</span>
                  </div>
                  <Badge variant="outline" className={entry.totalQuestions > 0 && (entry.score / entry.totalQuestions) >= 0.7 ? "text-emerald-700 border-emerald-300" : ""}>
                    {entry.totalQuestions > 0 ? Math.round((entry.score / entry.totalQuestions) * 100) : 0}% ({entry.score}/{entry.totalQuestions})
                  </Badge>
                </div>
              ))}
            </div>
          )}
          <Button className="w-full" onClick={() => setScreen("list")}>Back to Polls</Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><ClipboardList className="h-7 w-7 text-primary" />Polls & Quizzes</h1>
          <p className="text-muted-foreground">Test your knowledge with teacher-created and AI-generated quizzes.</p>
        </div>
        {loading ? <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> : polls.length === 0 ? (
          <Card><CardContent className="p-12 text-center">
            <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold">No quizzes available</p>
            <p className="text-sm text-muted-foreground">Check back later when your teacher activates a quiz.</p>
          </CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {polls.map(poll => (
              <Card key={poll.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex gap-1.5 mb-1.5 flex-wrap">
                        <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-300 text-xs">ACTIVE</Badge>
                        {poll.type === "ai" && <Badge className="bg-purple-100 text-purple-800 text-xs">AI</Badge>}
                        {poll.grade && <Badge variant="outline" className="text-xs">{poll.grade}</Badge>}
                        {poll.subject && <Badge variant="outline" className="text-xs">{poll.subject}</Badge>}
                      </div>
                      <h3 className="font-bold">{poll.title}</h3>
                    </div>
                    {poll.timerSeconds && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground shrink-0">
                        <Clock className="h-3.5 w-3.5" />{Math.floor(poll.timerSeconds / 60)}m
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => startPoll(poll.id)} className="flex-1 gap-2 bg-primary hover:bg-primary/90">
                      <Play className="h-4 w-4" />Start Quiz
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => loadLeaderboard(poll.id)} title="View leaderboard">
                      <BarChart3 className="h-4 w-4" />
                    </Button>
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
