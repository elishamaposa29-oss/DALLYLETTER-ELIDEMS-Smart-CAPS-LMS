import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiJson } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BarChart3, Loader2, RefreshCw, Trash2, Trophy } from "lucide-react";
import UserProfileLink from "@/components/UserProfileLink";
import { useToast } from "@/hooks/use-toast";

export type ChatPoll = {
  poll: { id: number; question: string; allowMultiple: boolean; closed: boolean; autoMark?: boolean; correctOptionId?: number | null; creatorId?: number; canDelete?: boolean; createdAt?: string };
  options: Array<{ id: number; label: string; voteCount: number; selected: boolean }>;
  totalVotes: number;
  myMark?: PollMarkResult | null;
};
type PollMarkResult = { isCorrect?: boolean; correctLabel?: string | null; correctOptionId?: number | null };
type PollLeaderboardEntry = { rank:number; userId:number|null; name:string; avatarUrl:string|null; answers:string[] };
export function StudyGroupPollCard({ item, onVoted, canDelete = false }: { item: ChatPoll; onVoted?: () => void; canDelete?: boolean }) {
  const [mark, setMark] = useState<PollMarkResult | null>(null);
  const [selectedAnswerId, setSelectedAnswerId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [voting, setVoting] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboard, setLeaderboard] = useState<PollLeaderboardEntry[]>([]);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const { toast } = useToast();
  const remove = async () => {
    if (!canDelete || !window.confirm("Permanently delete this poll and its votes?")) return;
    setDeleting(true);
    try { await apiJson("/api/chat/polls/" + item.poll.id, { method: "DELETE" }); onVoted?.(); toast({ title: "Poll permanently deleted" }); }
    catch (error) { toast({ variant: "destructive", title: "Poll could not be deleted", description: error instanceof Error ? error.message : "The server rejected the deletion. Check your group permissions." }); }
    finally { setDeleting(false); }
  };
  const vote = async (optionId: number) => {
    const selectedIds = item.poll.allowMultiple ? [...item.options.filter(option => option.selected && option.id !== optionId).map(option => option.id), ...(item.options.some(option => option.id === optionId && option.selected) ? [] : [optionId])] : [optionId];
    if (!selectedIds.length) return;
    setSelectedAnswerId(optionId);
    setMark(null);
    setVoting(true);
    try {
      const result = await apiJson<PollMarkResult>("/api/chat/polls/" + item.poll.id + "/vote", { method: "POST", body: JSON.stringify({ optionIds: selectedIds }) });
      setMark(result);
      if (result.isCorrect !== undefined && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        try { navigator.vibrate(result.isCorrect ? [45, 35, 70] : [110, 45, 110]); } catch { /* Haptics are optional on unsupported browsers. */ }
      }
      onVoted?.();
    } catch (error) {
      setSelectedAnswerId(null);
      setMark(null);
      toast({ variant: "destructive", title: "Vote was not marked", description: error instanceof Error ? error.message : "Your answer could not be submitted." });
    }
    finally { setVoting(false); }
  };
  const toggleLeaderboard = async () => {
    if (leaderboardOpen) { setLeaderboardOpen(false); return; }
    setLeaderboardOpen(true);
    setLeaderboardLoading(true);
    setLeaderboardError(null);
    try {
      const result = await apiJson<{entries:PollLeaderboardEntry[]}>("/api/chat/polls/" + item.poll.id + "/leaderboard");
      setLeaderboard(Array.isArray(result?.entries) ? result.entries : []);
    } catch (error) {
      setLeaderboardError(error instanceof Error ? error.message : "Leaderboard could not be loaded.");
    } finally { setLeaderboardLoading(false); }
  };
  const feedback = mark ?? item.myMark ?? null;
  const selected = item.options.find(option => option.id === selectedAnswerId) ?? item.options.find(option => option.selected);
  const showMark = feedback?.isCorrect !== undefined || (item.poll.autoMark && item.poll.correctOptionId != null && Boolean(selected));
  const isCorrect = feedback?.isCorrect ?? selected?.id === item.poll.correctOptionId;
  return <Card className="w-full space-y-3 p-4">
    <div className="flex items-start justify-between gap-2"><p className="font-semibold text-sm">{item.poll.question}</p><div className="flex items-center gap-2"><span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">{item.poll.closed ? "Closed" : "Active"}</span>{canDelete && <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0 border-2 border-red-400 bg-red-50 text-red-700 shadow-sm hover:border-red-600 hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900" aria-label="Delete poll" title={`Delete poll: ${item.poll.question}`} disabled={deleting} onClick={() => void remove()}><Trash2 className="h-4 w-4"/></Button>}</div></div>
    <div className="space-y-2">{item.options.map(option => {
      const isSelected = option.selected || selectedAnswerId === option.id;
      const correctOptionId = feedback?.correctOptionId ?? item.poll.correctOptionId;
      const isCorrectAnswer = item.poll.autoMark && correctOptionId === option.id && showMark;
      const isWrongSelected = item.poll.autoMark && isSelected && feedback?.isCorrect === false;
      const isCorrectSelected = item.poll.autoMark && isSelected && feedback?.isCorrect === true;
      const answerStyle = isCorrectAnswer || isCorrectSelected
        ? "border-emerald-500 bg-emerald-100 text-emerald-950"
        : isWrongSelected
          ? "border-rose-500 bg-rose-100 text-rose-950"
          : isSelected ? "border-primary bg-primary/10" : "hover:bg-muted";
      return <button key={option.id} type="button" disabled={item.poll.closed || voting} onClick={() => void vote(option.id)} className={"flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-70 " + answerStyle}><span>{isSelected ? "✓ " : ""}{option.label}</span><span className="text-xs tabular-nums text-muted-foreground">{option.voteCount}</span></button>;
    })}</div>
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[11px] text-muted-foreground">{item.totalVotes} vote{item.totalVotes===1?"":"s"} · {item.poll.allowMultiple?"Multiple choices":"Choose one"}</p><Button type="button" size="sm" variant="outline" onClick={() => void toggleLeaderboard()}><Trophy className="mr-1.5 h-3.5 w-3.5"/> {leaderboardOpen ? "Hide leaderboard" : "Leaderboard"}</Button></div>
    {voting && item.poll.autoMark && <p role="status" aria-live="polite" className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs font-semibold text-blue-900">Answer received — checking your result…</p>}
    {showMark && <p role="status" aria-live="polite" className={"rounded-md border p-3 text-xs font-semibold " + (isCorrect ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-rose-300 bg-rose-50 text-rose-900")}>{isCorrect ? "✓ Correct answer!" : "✕ Incorrect. Correct answer: " + (feedback?.correctLabel ?? item.options.find(option => option.id === item.poll.correctOptionId)?.label ?? "See teacher feedback")}</p>}
    {leaderboardOpen && <section className="space-y-2 rounded-lg border bg-muted/20 p-3" aria-label="Poll leaderboard"><h4 className="flex items-center gap-2 text-xs font-bold"><Trophy className="h-4 w-4"/> Poll leaderboard · {leaderboard.length} participant{leaderboard.length===1?"":"s"}</h4>
      {leaderboardLoading ? <p className="text-xs text-muted-foreground">Loading leaderboard…</p> : leaderboardError ? <p role="alert" className="text-xs text-destructive">{leaderboardError}</p> : leaderboard.length===0 ? <p className="text-xs text-muted-foreground">No answers have been submitted yet.</p> : leaderboard.map(entry => <div key={entry.rank + "-" + (entry.userId ?? entry.rank)} className="flex items-center gap-3 rounded-md bg-background p-2"><span className="w-6 shrink-0 text-center text-xs font-bold text-muted-foreground">#{entry.rank}</span>{entry.userId ? <UserProfileLink userId={entry.userId} name={entry.name} avatarUrl={entry.avatarUrl} className="min-w-0 flex-1 text-xs"/> : <span className="inline-flex min-w-0 flex-1 items-center gap-2 text-xs"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 font-bold text-primary">A</span><span className="truncate">{entry.name}</span></span>}<span className="max-w-[48%] text-right text-xs font-medium text-foreground">{entry.answers.join(", ")}</span></div>)}
    </section>}
  </Card>;
}

export function StudyGroupPollPanel({ groupId, allowPolls = true, inline = false, onPollsChange }: { groupId: number | null; allowPolls?: boolean; inline?: boolean; onPollsChange?: (polls: ChatPoll[]) => void }) {
  const [polls, setPolls] = useState<ChatPoll[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [optionsText, setOptionsText] = useState("Yes\nNo");
  const [error, setError] = useState<string | null>(null);
  const [autoMark, setAutoMark] = useState(false);
  const [correctOptionIndex, setCorrectOptionIndex] = useState(0);
  const pollsEnabled=allowPolls;

  const load = useCallback(async () => {
    if (!groupId || !pollsEnabled) { setPolls([]); onPollsChange?.([]); return; }
    setLoading(true);
    try {
      const nextPolls = await apiJson<ChatPoll[]>(`/api/chat/groups/${groupId}/polls`);
      setPolls(nextPolls); onPollsChange?.(nextPolls);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Polls could not be loaded.");
    } finally { setLoading(false); }
  }, [groupId, pollsEnabled, onPollsChange]);

  useEffect(() => { setPolls([]); onPollsChange?.([]); }, [groupId, onPollsChange]);

  useEffect(() => {
    void load();
    if (!groupId || !pollsEnabled) return;
    const timer = window.setInterval(() => void load(), 10000);
    return () => window.clearInterval(timer);
  }, [load, groupId, pollsEnabled]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const options = optionsText.split("\n").map(x => x.trim()).filter(Boolean);
    if (!groupId || !question.trim() || options.length < 2) { setError("Enter a question and at least two options."); return; }
    setCreating(true);
    try {
      await apiJson(`/api/chat/groups/${groupId}/polls`, { method: "POST", body: JSON.stringify({ question: question.trim(), options, autoMark, correctOption: options[correctOptionIndex], allowMultiple: false }) });
      setQuestion(""); setOptionsText("Yes\nNo"); setComposerOpen(false); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Poll could not be created."); }
    finally { setCreating(false); }
  };


  if (!groupId || !pollsEnabled) return null;
  return <section aria-label="Study group polls" className="space-y-3 border-t border-border/70 pt-3">
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 font-semibold text-sm"><BarChart3 className="h-4 w-4 text-primary"/>Group polls</div>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => void load()} aria-label="Refresh polls"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}/></Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setComposerOpen(v => !v)}>{composerOpen ? "Close" : "Create poll"}</Button>
      </div>
    </div>
    {composerOpen && <form onSubmit={create} className="space-y-2 rounded-lg border bg-card p-3">
      <Input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask your group a question" maxLength={300} required/>
      <Textarea value={optionsText} onChange={e => { setOptionsText(e.target.value); setCorrectOptionIndex(0); }} placeholder="One option per line" rows={3}/>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={autoMark} onChange={e => setAutoMark(e.target.checked)}/>Automatically mark answers</label>
      {autoMark && <label className="block space-y-1 text-xs"><span className="font-medium">Correct answer</span><select className="h-9 w-full rounded-md border bg-background px-2" value={correctOptionIndex} onChange={e => setCorrectOptionIndex(Number(e.target.value))}>{optionsText.split("\n").map(x => x.trim()).filter(Boolean).map((option,index)=><option key={`${index}-${option}`} value={index}>{option}</option>)}</select></label>}
      {autoMark && <p className="text-[11px] text-muted-foreground">Learners receive correctness feedback after voting. The correct answer is hidden until they submit a vote.</p>}
      <Button type="submit" size="sm" disabled={creating || !question.trim()}>{creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}Publish poll</Button>
    </form>}
    {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
    {!inline && (loading && polls.length===0 ? <p className="text-xs text-muted-foreground">Loading group polls…</p> : polls.length===0 ? <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">No group polls yet. Create one to get everyone participating.</p> : polls.map(item => <StudyGroupPollCard key={item.poll.id} item={item} canDelete={Boolean(item.poll.canDelete)} onVoted={() => void load()} />))}
  </section>;
}
