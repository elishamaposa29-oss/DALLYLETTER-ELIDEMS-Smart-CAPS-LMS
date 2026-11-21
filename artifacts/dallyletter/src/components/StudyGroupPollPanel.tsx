import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiJson } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BarChart3, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export type ChatPoll = {
  poll: { id: number; question: string; allowMultiple: boolean; closed: boolean; autoMark?: boolean; correctOptionId?: number | null; creatorId?: number; canDelete?: boolean; createdAt?: string };
  options: Array<{ id: number; label: string; voteCount: number; selected: boolean }>;
  totalVotes: number;
};
type PollMarkResult = { isCorrect?: boolean; correctLabel?: string | null };
export function StudyGroupPollCard({ item, onVoted, canDelete = false }: { item: ChatPoll; onVoted?: () => void; canDelete?: boolean }) {
  const [mark, setMark] = useState<PollMarkResult | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [voting, setVoting] = useState(false);
  const { toast } = useToast();
  const remove = async () => {
    if (!canDelete || !window.confirm("Permanently delete this poll and its votes?")) return;
    setDeleting(true);
    try { await apiJson(`/api/chat/polls/${item.poll.id}`, { method: "DELETE" }); onVoted?.(); }
    catch (error) { toast({ variant: "destructive", title: "Poll could not be deleted", description: error instanceof Error ? error.message : "The server rejected the deletion. Check your group permissions." }); }
    finally { setDeleting(false); }
  };
  const vote = async (optionId: number) => {
    const selectedIds = item.poll.allowMultiple ? [...item.options.filter(option => option.selected && option.id !== optionId).map(option => option.id), ...(item.options.some(option => option.id === optionId && option.selected) ? [] : [optionId])] : [optionId];
    if (!selectedIds.length) return;
    setVoting(true);
    try {
      const result = await apiJson<PollMarkResult>(`/api/chat/polls/${item.poll.id}/vote`, { method: "POST", body: JSON.stringify({ optionIds: selectedIds }) });
      setMark(result); onVoted?.();
    } catch (error) { toast({ variant: "destructive", title: "Vote was not marked", description: error instanceof Error ? error.message : "Your answer could not be submitted." }); }
    finally { setVoting(false); }
  };
  return <Card className="w-full space-y-3 p-4"><div className="flex items-start justify-between gap-2"><p className="font-semibold text-sm">{item.poll.question}</p><div className="flex items-center gap-2"><span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">{item.poll.closed ? "Closed" : "Active"}</span>{canDelete && <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label="Delete poll" title="Delete poll" disabled={deleting} onClick={() => void remove()}><Trash2 className="h-3.5 w-3.5"/></Button>}</div></div><div className="space-y-2">{item.options.map(option => <button key={option.id} type="button" disabled={item.poll.closed || voting} onClick={() => void vote(option.id)} className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${option.selected ? "border-primary bg-primary/10" : "hover:bg-muted"}`}><span>{option.selected ? "✓ " : ""}{option.label}</span><span className="text-xs tabular-nums text-muted-foreground">{option.voteCount}</span></button>)}</div><p className="text-[11px] text-muted-foreground">{item.totalVotes} vote{item.totalVotes===1?"":"s"} · {item.poll.allowMultiple?"Multiple choices":"Choose one"}</p>{(mark?.isCorrect !== undefined || (item.poll.autoMark && item.poll.correctOptionId != null && item.options.some(option => option.selected))) && (() => { const correct = item.options.find(option => option.id === item.poll.correctOptionId); const selected = item.options.find(option => option.selected); const isCorrect = mark?.isCorrect ?? selected?.id === item.poll.correctOptionId; return <p role="status" className={`rounded-md p-2 text-xs font-medium ${isCorrect ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{isCorrect ? "Correct answer!" : `Not correct. Correct answer: ${mark?.correctLabel ?? correct?.label ?? "See teacher feedback"}`}</p>; })()}</Card>;
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
  const [marks, setMarks] = useState<Record<number, PollMarkResult>>({});
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

  const vote = async (poll: ChatPoll, optionId: number) => {
    const selectedIds = poll.poll.allowMultiple
      ? [...poll.options.filter(option => option.selected && option.id !== optionId).map(option => option.id), ...(poll.options.some(option => option.id === optionId && option.selected) ? [] : [optionId])]
      : [optionId];
    if (selectedIds.length === 0) return;
    try {
      const result = await apiJson<PollMarkResult>(`/api/chat/polls/${poll.poll.id}/vote`, { method: "POST", body: JSON.stringify({ optionIds: selectedIds }) });
      if (result.isCorrect !== undefined) setMarks(current => ({ ...current, [poll.poll.id]: result }));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Your vote could not be saved."); }
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
    {!inline && (loading && polls.length===0 ? <p className="text-xs text-muted-foreground">Loading group polls…</p> : polls.length===0 ? <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">No group polls yet. Create one to get everyone participating.</p> : polls.map(item => <Card key={item.poll.id} className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-2"><p className="font-semibold text-sm">{item.poll.question}</p><span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">{item.poll.closed ? "Closed" : "Active"}</span></div>
      <div className="space-y-2">{item.options.map(option => <button key={option.id} type="button" disabled={item.poll.closed} onClick={() => void vote(item, option.id)} className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${option.selected ? "border-primary bg-primary/10" : "hover:bg-muted"}`}><span>{option.selected ? "✓ " : ""}{option.label}</span><span className="text-xs tabular-nums text-muted-foreground">{option.voteCount}</span></button>)}</div>
      <p className="text-[11px] text-muted-foreground">{item.totalVotes} vote{item.totalVotes===1?"":"s"} · {item.poll.allowMultiple?"Multiple choices":"Choose one"}</p>
      {marks[item.poll.id]?.isCorrect !== undefined && <p role="status" className={`rounded-md p-2 text-xs font-medium ${marks[item.poll.id].isCorrect ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{marks[item.poll.id].isCorrect ? "Correct answer!" : `Not correct. Correct answer: ${marks[item.poll.id].correctLabel ?? "See teacher feedback"}`}</p>}
    </Card>))}
  </section>;
}
