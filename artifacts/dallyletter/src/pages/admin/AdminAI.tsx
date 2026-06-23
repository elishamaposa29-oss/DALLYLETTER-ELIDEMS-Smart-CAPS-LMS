import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send, Bot, User, Zap, RotateCcw, AlertTriangle, CheckCircle, Sparkles, Shield, Bell, BarChart3, Users, BookOpen } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Message { role: "user" | "assistant"; content: string; ts: number; }
interface AIStatus { provider: string; isLive: boolean; hasGeminiKey: boolean; hasOpenAIKey: boolean; hasAnthropicKey: boolean; }
interface AIAction { id: number; command: string; action: string; result: string; isReversed: boolean; createdAt: string; performerName: string; }

const QUICK_ACTIONS = [
  { icon: Users, label: "User Summary", prompt: "Give me a summary of the current user base and any accounts that need attention." },
  { icon: BarChart3, label: "Analytics Report", prompt: "Generate a platform analytics report including activity trends and key metrics." },
  { icon: Bell, label: "Send Reminders", prompt: "Send payment reminders to all students with overdue fees." },
  { icon: Shield, label: "Safety Review", prompt: "Review any flagged content or suspicious activity on the platform." },
  { icon: BookOpen, label: "Poll Insights", prompt: "Analyze poll performance and student engagement with quizzes." },
  { icon: AlertTriangle, label: "Overdue Accounts", prompt: "Identify all students with overdue payments and suggest actions." },
];

function formatMessage(text: string) {
  return text.split("\n").map((line, i) => {
    if (line.startsWith("**") && line.endsWith("**")) {
      return <p key={i} className="font-bold mt-2">{line.slice(2, -2)}</p>;
    }
    if (line.startsWith("• ") || line.startsWith("- ")) {
      return <p key={i} className="ml-3">• {line.slice(2)}</p>;
    }
    if (line.startsWith("#")) {
      return <p key={i} className="font-bold text-base mt-2">{line.replace(/^#+\s*/, "")}</p>;
    }
    if (line === "") return <div key={i} className="h-1" />;
    return <p key={i}>{line}</p>;
  });
}

export default function AdminAI() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([{
    role: "assistant",
    content: "**Welcome to ELIDEMS AI** 🤖\n\nI'm your intelligent administrative assistant. I can help you:\n\n• Manage users and accounts\n• Generate reports and analytics\n• Send notifications and reminders\n• Review safety alerts\n• Create and analyze polls\n\nType a command or click a quick action to get started. Type **\"help\"** to see all capabilities.",
    ts: Date.now(),
  }]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [actions, setActions] = useState<AIAction[]>([]);
  const [reversingId, setReversingId] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const token = () => localStorage.getItem("dallyletter_token");

  useEffect(() => {
    fetch("/api/ai/status", { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json()).then(setStatus).catch(() => {});
    loadActions();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadActions() {
    const r = await fetch("/api/ai/actions", { headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) setActions(await r.json());
  }

  async function sendMessage(text?: string) {
    const content = text ?? input.trim();
    if (!content || sending) return;
    setInput("");
    const userMsg: Message = { role: "user", content, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setSending(true);
    try {
      const apiMessages = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));
      const r = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ messages: apiMessages }),
      });
      const data = await r.json() as { response: string; provider: string; isLive: boolean };
      setMessages(prev => [...prev, { role: "assistant", content: data.response, ts: Date.now() }]);
      await loadActions();
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I encountered an error. Please try again.", ts: Date.now() }]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function reverseAction(id: number) {
    setReversingId(id);
    try {
      const r = await fetch(`/api/ai/actions/${id}/reverse`, { method: "PATCH", headers: { Authorization: `Bearer ${token()}` } });
      if (r.ok) {
        toast({ title: "Action reversed successfully" });
        await loadActions();
      }
    } finally {
      setReversingId(null);
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Sparkles className="h-7 w-7 text-purple-500" />
              ELIDEMS AI
            </h1>
            <p className="text-muted-foreground">Intelligent administrative assistant for DallyLetter Elidems</p>
          </div>
          <div className="flex items-center gap-2">
            {status ? (
              status.isLive ? (
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 gap-1.5">
                  <CheckCircle className="h-3 w-3" /> Live AI — {status.provider}
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1.5 text-amber-600 border-amber-300 bg-amber-50">
                  <AlertTriangle className="h-3 w-3" /> Development Mode
                </Badge>
              )
            ) : null}
            <Button variant="outline" size="sm" onClick={() => { setMessages(msgs => [msgs[0]]); }}>
              Clear Chat
            </Button>
          </div>
        </div>

        {/* Dev mode banner */}
        {status && !status.isLive && (
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center justify-between gap-4">
            <p className="text-sm text-amber-800 dark:text-amber-400">
              <strong>Development Mode:</strong> ELIDEMS AI is using mock responses. Add an API key in Settings → ELIDEMS AI to activate Live Mode.
            </p>
            <Button size="sm" variant="outline" className="border-amber-400 text-amber-700 hover:bg-amber-100 shrink-0" onClick={() => window.location.href = "/admin/ai/settings"}>
              Configure AI
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
          {/* Quick Actions Sidebar */}
          <div className="xl:col-span-1 space-y-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 pt-0">
                {QUICK_ACTIONS.map(({ icon: Icon, label, prompt }) => (
                  <Button key={label} variant="ghost" size="sm" className="w-full justify-start text-left h-auto py-2 px-3" onClick={() => sendMessage(prompt)}>
                    <Icon className="h-4 w-4 mr-2 text-purple-500 shrink-0" />
                    <span className="text-xs font-medium">{label}</span>
                  </Button>
                ))}
              </CardContent>
            </Card>

            {/* Recent Actions */}
            {actions.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Recent Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 pt-0">
                  {actions.slice(0, 5).map(action => (
                    <div key={action.id} className="text-xs border rounded p-2 space-y-1">
                      <p className="font-medium truncate">{action.command}</p>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-muted-foreground">{new Date(action.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        {!action.isReversed ? (
                          <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px] text-destructive hover:bg-destructive/10"
                            onClick={() => reverseAction(action.id)} disabled={reversingId === action.id}>
                            {reversingId === action.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RotateCcw className="h-2.5 w-2.5" />}
                            Undo
                          </Button>
                        ) : (
                          <Badge variant="outline" className="text-[9px] py-0 px-1">Reversed</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Chat Interface */}
          <Card className="xl:col-span-3 flex flex-col">
            <CardContent className="flex flex-col h-[600px] p-0">
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${msg.role === "assistant" ? "bg-purple-100 dark:bg-purple-900" : "bg-primary/10"}`}>
                        {msg.role === "assistant" ? <Bot className="h-4 w-4 text-purple-600 dark:text-purple-400" /> : <User className="h-4 w-4 text-primary" />}
                      </div>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === "assistant" ? "bg-muted/60 dark:bg-muted/40 rounded-tl-none" : "bg-primary text-primary-foreground rounded-tr-none"}`}>
                        {msg.role === "assistant" ? formatMessage(msg.content) : <p>{msg.content}</p>}
                      </div>
                    </div>
                  ))}
                  {sending && (
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                        <Bot className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div className="bg-muted/60 rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
                        <span className="text-sm text-muted-foreground">ELIDEMS AI is thinking…</span>
                      </div>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>

              {/* Input area */}
              <div className="border-t p-4">
                <div className="flex gap-2">
                  <Input
                    ref={inputRef}
                    placeholder="Ask ELIDEMS AI anything… (e.g. 'Block users with overdue payments')"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    disabled={sending}
                    className="flex-1"
                  />
                  <Button onClick={() => sendMessage()} disabled={sending || !input.trim()} className="bg-purple-600 hover:bg-purple-700 gap-2">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">ELIDEMS AI • All actions are logged and reversible</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
