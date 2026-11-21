import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiJson } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BarChart3, Loader2, RefreshCw } from "lucide-react";

type ChatPoll = {
  poll: { id: number; question: string; allowMultiple: boolean; closed: boolean; createdAt?: string };
  options: Array<{ id: number; label: string; voteCount: number; selected: boolean }>;
  totalVotes: number;
};

export function StudyGroupPollPanel({ groupId, allowPolls = true }: { groupId: number | null; allowPolls?: boolean }) {
  const [polls, setPolls] = useState<ChatPoll[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [optionsText, setOptionsText] = useState("Yes\nNo");
  const [error, setError] = useState<string | null>(null);
  const pollsEnabled=allowPolls;

  const load = useCallback(async () => {
    if (!groupId || !pollsEnabled) { setPolls([]); return; }
    setLoading(true);
    try {
      setPolls(await apiJson<ChatPoll[]>(`/api/chat/groups/${groupId}/polls`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Polls could not be loaded.");
    } finally { setLoading(false); }
  }, [groupId, pollsEnabled]);

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
      await apiJson(`/api/chat/groups/${groupId}/polls`, { method: "POST", body: JSON.stringify({ question: question.trim(), options }) });
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
      await apiJson(`/api/chat/polls/${poll.poll.id}/vote`, { method: "POST", body: JSON.stringify({ optionIds: selectedIds }) });
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
      <Textarea value={optionsText} onChange={e => setOptionsText(e.target.value)} placeholder="One option per line" rows={3}/>
      <Button type="submit" size="sm" disabled={creating || !question.trim()}>{creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}Publish poll</Button>
    </form>}
    {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
    {loading && polls.length===0 ? <p className="text-xs text-muted-foreground">Loading group polls…</p> : polls.length===0 ? <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">No group polls yet. Create one to get everyone participating.</p> : polls.map(item => <Card key={item.poll.id} className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-2"><p className="font-semibold text-sm">{item.poll.question}</p><span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">{item.poll.closed ? "Closed" : "Active"}</span></div>
      <div className="space-y-2">{item.options.map(option => <button key={option.id} type="button" disabled={item.poll.closed} onClick={() => void vote(item, option.id)} className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${option.selected ? "border-primary bg-primary/10" : "hover:bg-muted"}`}><span>{option.selected ? "✓ " : ""}{option.label}</span><span className="text-xs tabular-nums text-muted-foreground">{option.voteCount}</span></button>)}</div>
      <p className="text-[11px] text-muted-foreground">{item.totalVotes} vote{item.totalVotes===1?"":"s"} · {item.poll.allowMultiple?"Multiple choices":"Choose one"}</p>
    </Card>)}
  </section>;
}
