import { useMemo, useState } from "react";
import { getApiUrl } from "@workspace/api-client-react";

type ChatMessage = { role: "user" | "assistant"; content: string };
type Props = { role?: string | null };

export function ElidemsAIChat({ role }: Props) {
  const normalizedRole = String(role || "").trim().toLowerCase().replace(/[ -]+/g, "_");
  const learner = ["student", "learner", "prefect"].includes(normalizedRole);
  const canRequestAgent = !learner && ["teacher", "manager", "senior_manager", "junior_manager", "owner", "platform_owner"].includes(normalizedRole);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<"chat" | "agent">("chat");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const modeLabel = useMemo(() => learner ? "Learning companion" : mode === "agent" ? "Staff agent · planning mode" : "Staff assistant", [learner, mode]);

  async function send() {
    const content = draft.trim();
    if (!content || busy) return;
    const next = [...messages, { role: "user" as const, content }].slice(-20);
    setMessages(next);
    setDraft("");
    setError("");
    setBusy(true);
    try {
      const token = localStorage.getItem("dallyletter_token");
      const response = await fetch(getApiUrl("/api/ai/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
        body: JSON.stringify({ messages: next, mode: learner ? "chat" : mode }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "ELIDEMS AI is temporarily unavailable.");
      setMessages(current => [...current, { role: "assistant" as const, content: String(data.response || "I could not prepare a response. Please try again.") }].slice(-20));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ELIDEMS AI is temporarily unavailable.");
      setMessages(current => current.slice(0, -1));
      setDraft(content);
    } finally {
      setBusy(false);
    }
  }

  return <section aria-label="ELIDEMS AI chat" className="overflow-hidden rounded-2xl border border-[#d8e0ee] bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-gradient-to-r from-[#0f2a5a] to-[#173d7d] px-4 py-3 text-white">
      <div><p className="font-semibold">✦ ELIDEMS AI</p><p className="text-xs text-white/75">{modeLabel}</p></div>
      {canRequestAgent && <div className="flex gap-1 rounded-lg bg-white/10 p-1" aria-label="AI mode">
        <button type="button" onClick={() => setMode("chat")} aria-pressed={mode === "chat"} className={`rounded-md px-3 py-1.5 text-xs ${mode === "chat" ? "bg-white text-[#0f2a5a]" : "text-white"}`}>Chat</button>
        <button type="button" onClick={() => setMode("agent")} aria-pressed={mode === "agent"} className={`rounded-md px-3 py-1.5 text-xs ${mode === "agent" ? "bg-white text-[#0f2a5a]" : "text-white"}`}>Agent</button>
      </div>}
    </div>
    <div className="max-h-80 min-h-28 space-y-3 overflow-y-auto bg-slate-50 p-4" aria-live="polite">
      {!messages.length && <p className="text-sm text-slate-600">{learner ? "Hi! I’m here to help you learn, practise, revise and ask questions. What are you studying today?" : "Ask ELIDEMS AI to help prepare, analyze or organize work available to your role."}</p>}
      {messages.map((message, index) => <div key={index} className={`max-w-[90%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${message.role === "user" ? "ml-auto bg-[#0f2a5a] text-white" : "mr-auto border bg-white text-slate-800"}`}>{message.content}</div>)}
      {busy && <p className="text-xs text-slate-500">ELIDEMS AI is thinking…</p>}
    </div>
    {mode === "agent" && <p className="border-t bg-amber-50 px-4 py-2 text-xs text-amber-900">Agent planning is permission-gated. This chat does not execute changes; consequential tasks must be completed through the existing authorized workflow and confirmation.</p>}
    {error && <p role="alert" className="px-4 pt-2 text-xs text-red-700">{error}</p>}
    <form className="flex gap-2 border-t p-3" onSubmit={event => { event.preventDefault(); void send(); }}>
      <input value={draft} onChange={event => setDraft(event.target.value)} maxLength={learner ? 4000 : 20000} placeholder={learner ? "Ask a learning question…" : "Message ELIDEMS AI…"} aria-label="Message ELIDEMS AI" className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#b38b00]" />
      <button type="submit" disabled={busy || !draft.trim()} className="rounded-lg bg-[#0f2a5a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "…" : "Send"}</button>
    </form>
  </section>;
}
