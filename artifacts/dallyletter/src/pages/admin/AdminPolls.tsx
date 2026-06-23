import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Play, Square, BarChart3, Sparkles, ClipboardList, ChevronDown, ChevronUp, CheckCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface Poll { id: number; title: string; topic: string | null; type: string; grade: string | null; subject: string | null; mode: string; status: string; createdAt: string; }
interface PollQuestion { id: number; question: string; difficulty: string; explanation: string; options: { id: number; text: string; isCorrect?: boolean }[]; }
interface PollWithQuestions extends Poll { questions: PollQuestion[]; }
interface PollResults { submissions: { studentName: string; score: number; totalQuestions: number; completedAt: string }[]; total: number; avgScore: number; }

export default function AdminPolls() {
  const { toast } = useToast();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [aiGenOpen, setAiGenOpen] = useState(false);
  const [resultsId, setResultsId] = useState<number | null>(null);
  const [results, setResults] = useState<PollResults | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [pollDetail, setPollDetail] = useState<PollWithQuestions | null>(null);

  const [newPoll, setNewPoll] = useState({ title: "", grade: "", subject: "", mode: "practice" });
  const [newQuestions, setNewQuestions] = useState([{ question: "", options: ["", "", "", ""], correct: 0, difficulty: "medium" }]);
  const [aiTopic, setAiTopic] = useState({ topic: "", grade: "", subject: "", count: "5" });
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiGenerated, setAiGenerated] = useState<{ title: string; questions: { question: string; difficulty: string; options: { text: string; isCorrect: boolean }[]; explanation: string }[] } | null>(null);
  const [creating, setCreating] = useState(false);

  const token = () => localStorage.getItem("dallyletter_token");

  async function loadPolls() {
    setLoading(true);
    const r = await fetch("/api/polls", { headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) setPolls(await r.json());
    setLoading(false);
  }

  useEffect(() => { loadPolls(); }, []);

  async function handleCreate() {
    if (!newPoll.title) { toast({ variant: "destructive", title: "Title required" }); return; }
    setCreating(true);
    const questions = newQuestions.filter(q => q.question.trim()).map(q => ({
      question: q.question, difficulty: q.difficulty,
      options: q.options.map((o, i) => ({ text: o, isCorrect: i === q.correct }))
    }));
    const r = await fetch("/api/polls", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ ...newPoll, type: "manual", questions }),
    });
    setCreating(false);
    if (r.ok) {
      toast({ title: "Poll created!" });
      setCreateOpen(false);
      setNewPoll({ title: "", grade: "", subject: "", mode: "practice" });
      setNewQuestions([{ question: "", options: ["", "", "", ""], correct: 0, difficulty: "medium" }]);
      loadPolls();
    }
  }

  async function handleAIGenerate() {
    if (!aiTopic.topic) { toast({ variant: "destructive", title: "Topic required" }); return; }
    setAiGenerating(true);
    setAiGenerated(null);
    const r = await fetch("/api/polls/ai-generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ topic: aiTopic.topic, grade: aiTopic.grade || undefined, subject: aiTopic.subject || undefined, count: parseInt(aiTopic.count) }),
    });
    setAiGenerating(false);
    if (r.ok) {
      const data = await r.json();
      setAiGenerated(data);
    } else {
      toast({ variant: "destructive", title: "AI generation failed" });
    }
  }

  async function handleSaveAIPoll() {
    if (!aiGenerated) return;
    setCreating(true);
    const r = await fetch("/api/polls", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ title: aiGenerated.title, topic: aiTopic.topic, type: "ai", grade: aiTopic.grade || undefined, subject: aiTopic.subject || undefined, mode: "practice", questions: aiGenerated.questions }),
    });
    setCreating(false);
    if (r.ok) {
      toast({ title: "AI Poll saved!" });
      setAiGenOpen(false);
      setAiGenerated(null);
      setAiTopic({ topic: "", grade: "", subject: "", count: "5" });
      loadPolls();
    }
  }

  async function setStatus(id: number, status: string) {
    await fetch(`/api/polls/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ status }),
    });
    loadPolls();
    toast({ title: status === "active" ? "Poll is now live!" : status === "closed" ? "Poll closed" : "Poll saved as draft" });
  }

  async function deletePoll(id: number) {
    await fetch(`/api/polls/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token()}` } });
    loadPolls();
    toast({ title: "Poll deleted" });
  }

  async function loadResults(id: number) {
    const r = await fetch(`/api/polls/${id}/results`, { headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) { setResults(await r.json()); setResultsId(id); }
  }

  async function toggleExpand(id: number) {
    if (expandedId === id) { setExpandedId(null); return; }
    const r = await fetch(`/api/polls/${id}`, { headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) { setPollDetail(await r.json()); setExpandedId(id); }
  }

  const statusColor = (s: string) => s === "active" ? "bg-emerald-100 text-emerald-800 border-emerald-300" : s === "closed" ? "bg-muted text-muted-foreground" : "bg-amber-100 text-amber-800 border-amber-200";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><ClipboardList className="h-7 w-7 text-primary" />Polls & Quizzes</h1>
            <p className="text-muted-foreground">Create, manage and analyze educational polls for students.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setAiGenOpen(true)} className="gap-2 border-purple-300 text-purple-700 hover:bg-purple-50">
              <Sparkles className="h-4 w-4" />AI Generate
            </Button>
            <Button onClick={() => setCreateOpen(true)} className="gap-2"><Plus className="h-4 w-4" />Create Poll</Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : polls.length === 0 ? (
          <Card><CardContent className="p-12 text-center text-muted-foreground">No polls yet. Create one manually or use AI Generate.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {polls.map(poll => (
              <Card key={poll.id} className="overflow-hidden">
                <div className="p-4 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge variant="outline" className={statusColor(poll.status)}>{poll.status.toUpperCase()}</Badge>
                      {poll.type === "ai" && <Badge className="bg-purple-100 text-purple-800 border-purple-300 gap-1"><Sparkles className="h-2.5 w-2.5" />AI</Badge>}
                      {poll.grade && <Badge variant="outline">{poll.grade}</Badge>}
                      {poll.subject && <Badge variant="outline">{poll.subject}</Badge>}
                      <Badge variant="outline" className="capitalize">{poll.mode}</Badge>
                    </div>
                    <p className="font-semibold truncate">{poll.title}</p>
                    <p className="text-xs text-muted-foreground">{new Date(poll.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Button variant="ghost" size="sm" onClick={() => toggleExpand(poll.id)} className="gap-1 text-xs">
                      {expandedId === poll.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}Preview
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => loadResults(poll.id)} className="gap-1 text-xs">
                      <BarChart3 className="h-3.5 w-3.5" />Results
                    </Button>
                    {poll.status === "draft" && <Button size="sm" onClick={() => setStatus(poll.id, "active")} className="gap-1 text-xs bg-emerald-600 hover:bg-emerald-700"><Play className="h-3 w-3" />Activate</Button>}
                    {poll.status === "active" && <Button size="sm" variant="outline" onClick={() => setStatus(poll.id, "closed")} className="gap-1 text-xs"><Square className="h-3 w-3" />Close</Button>}
                    {poll.status === "closed" && <Button size="sm" variant="outline" onClick={() => setStatus(poll.id, "active")} className="gap-1 text-xs"><Play className="h-3 w-3" />Reopen</Button>}
                    <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => deletePoll(poll.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {expandedId === poll.id && pollDetail?.id === poll.id && (
                  <div className="border-t p-4 bg-muted/30 space-y-3">
                    {pollDetail.questions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No questions yet.</p>
                    ) : pollDetail.questions.map((q, qi) => (
                      <div key={q.id} className="bg-card border rounded-lg p-3">
                        <p className="font-medium text-sm mb-2">Q{qi + 1}: {q.question}</p>
                        <div className="space-y-1">
                          {q.options.map(opt => (
                            <div key={opt.id} className={`text-xs flex items-center gap-2 px-2 py-1 rounded ${opt.isCorrect ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 font-medium" : ""}`}>
                              {opt.isCorrect && <CheckCircle className="h-3 w-3 text-emerald-600 shrink-0" />}
                              {opt.text}
                            </div>
                          ))}
                        </div>
                        {q.explanation && <p className="text-xs text-muted-foreground mt-2 italic">{q.explanation}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* Create Manual Poll Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Create Poll</DialogTitle><DialogDescription>Create a manual poll with custom questions and answers.</DialogDescription></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5"><Label>Poll Title *</Label><Input placeholder="e.g. Algebra Revision Quiz" value={newPoll.title} onChange={e => setNewPoll(p => ({ ...p, title: e.target.value }))} /></div>
                <div className="space-y-1.5">
                  <Label>Grade</Label>
                  <Select value={newPoll.grade} onValueChange={v => setNewPoll(p => ({ ...p, grade: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select grade" /></SelectTrigger>
                    <SelectContent>{["Grade 8","Grade 9","Grade 10","Grade 11","Grade 12"].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Subject</Label><Input placeholder="e.g. Mathematics" value={newPoll.subject} onChange={e => setNewPoll(p => ({ ...p, subject: e.target.value }))} /></div>
                <div className="space-y-1.5">
                  <Label>Mode</Label>
                  <Select value={newPoll.mode} onValueChange={v => setNewPoll(p => ({ ...p, mode: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="practice">Practice</SelectItem><SelectItem value="exam">Exam</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Questions</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => setNewQuestions(q => [...q, { question: "", options: ["","","",""], correct: 0, difficulty: "medium" }])}>
                    <Plus className="h-3.5 w-3.5 mr-1" />Add Question
                  </Button>
                </div>
                {newQuestions.map((q, qi) => (
                  <Card key={qi} className="p-3 space-y-3 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Question {qi + 1}</Label>
                      {newQuestions.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => setNewQuestions(qs => qs.filter((_, i) => i !== qi))}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <Input placeholder="Enter question" value={q.question} onChange={e => setNewQuestions(qs => qs.map((x, i) => i === qi ? { ...x, question: e.target.value } : x))} />
                    <div className="space-y-1.5">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex gap-2 items-center">
                          <input type="radio" name={`correct-${qi}`} checked={q.correct === oi} onChange={() => setNewQuestions(qs => qs.map((x, i) => i === qi ? { ...x, correct: oi } : x))} className="accent-emerald-600 mt-0.5" />
                          <Input placeholder={`Option ${String.fromCharCode(65 + oi)}`} value={opt} className="text-sm h-8"
                            onChange={e => setNewQuestions(qs => qs.map((x, i) => i === qi ? { ...x, options: x.options.map((o, j) => j === oi ? e.target.value : o) } : x))} />
                        </div>
                      ))}
                      <p className="text-xs text-muted-foreground">Select the radio button next to the correct answer.</p>
                    </div>
                    <Select value={q.difficulty} onValueChange={v => setNewQuestions(qs => qs.map((x, i) => i === qi ? { ...x, difficulty: v } : x))}>
                      <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="easy">Easy</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="hard">Hard</SelectItem></SelectContent>
                    </Select>
                  </Card>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating}>{creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Poll</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* AI Generate Dialog */}
        <Dialog open={aiGenOpen} onOpenChange={setAiGenOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-purple-500" />AI Generate Poll</DialogTitle><DialogDescription>ELIDEMS AI will create curriculum-aligned questions from a topic.</DialogDescription></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5"><Label>Topic *</Label><Input placeholder="e.g. Quadratic Equations, Photosynthesis, World War 2" value={aiTopic.topic} onChange={e => setAiTopic(t => ({ ...t, topic: e.target.value }))} /></div>
                <div className="space-y-1.5">
                  <Label>Grade (optional)</Label>
                  <Select value={aiTopic.grade} onValueChange={v => setAiTopic(t => ({ ...t, grade: v }))}>
                    <SelectTrigger><SelectValue placeholder="Any grade" /></SelectTrigger>
                    <SelectContent>{["Grade 8","Grade 9","Grade 10","Grade 11","Grade 12"].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Subject (optional)</Label><Input placeholder="e.g. Mathematics" value={aiTopic.subject} onChange={e => setAiTopic(t => ({ ...t, subject: e.target.value }))} /></div>
                <div className="space-y-1.5">
                  <Label>Number of Questions</Label>
                  <Select value={aiTopic.count} onValueChange={v => setAiTopic(t => ({ ...t, count: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{["3","5","8","10"].map(n => <SelectItem key={n} value={n}>{n} questions</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={handleAIGenerate} disabled={aiGenerating} className="w-full bg-purple-600 hover:bg-purple-700 gap-2">
                {aiGenerating ? <><Loader2 className="h-4 w-4 animate-spin" />Generating…</> : <><Sparkles className="h-4 w-4" />Generate Questions</>}
              </Button>
              {aiGenerated && (
                <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
                  <p className="font-semibold text-sm">{aiGenerated.title}</p>
                  {aiGenerated.questions.map((q, i) => (
                    <div key={i} className="bg-card border rounded p-3 text-sm space-y-2">
                      <p className="font-medium">Q{i+1}: {q.question} <Badge variant="outline" className="text-xs ml-1">{q.difficulty}</Badge></p>
                      {q.options.map((o, j) => (
                        <p key={j} className={`ml-2 text-xs ${o.isCorrect ? "text-emerald-700 font-semibold" : "text-muted-foreground"}`}>
                          {o.isCorrect ? "✅" : "⬜"} {o.text}
                        </p>
                      ))}
                      {q.explanation && <p className="text-xs text-muted-foreground italic">{q.explanation}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setAiGenOpen(false); setAiGenerated(null); }}>Cancel</Button>
              {aiGenerated && <Button onClick={handleSaveAIPoll} disabled={creating} className="bg-purple-600 hover:bg-purple-700">{creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Poll</Button>}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Results Dialog */}
        <Dialog open={resultsId !== null} onOpenChange={() => { setResultsId(null); setResults(null); }}>
          <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />Poll Results</DialogTitle></DialogHeader>
            {results && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <Card className="p-3"><p className="text-2xl font-bold">{results.total}</p><p className="text-xs text-muted-foreground">Submissions</p></Card>
                  <Card className="p-3"><p className="text-2xl font-bold text-emerald-600">{results.avgScore}%</p><p className="text-xs text-muted-foreground">Avg Score</p></Card>
                  <Card className="p-3"><p className="text-2xl font-bold text-primary">{results.submissions[0]?.studentName?.split(" ")[0] ?? "—"}</p><p className="text-xs text-muted-foreground">Top Student</p></Card>
                </div>
                <div className="space-y-2">
                  {results.submissions.map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-sm border rounded p-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs w-5 text-muted-foreground">#{i+1}</span>
                        <span className="font-medium">{s.studentName}</span>
                      </div>
                      <Badge variant="outline" className={s.totalQuestions > 0 && (s.score / s.totalQuestions) >= 0.7 ? "text-emerald-700 border-emerald-300" : ""}>
                        {s.score}/{s.totalQuestions}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
