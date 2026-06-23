import { db, platformSettingsTable } from "@workspace/db";

export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface GeneratedPollQuestion {
  question: string;
  difficulty: "easy" | "medium" | "hard";
  options: { text: string; isCorrect: boolean }[];
  explanation: string;
}

export interface GeneratedPoll {
  title: string;
  questions: GeneratedPollQuestion[];
}

export interface ModerationResult {
  flagged: boolean;
  reason?: string;
  severity: "low" | "medium" | "high" | "critical";
  categories: string[];
}

export interface AIProvider {
  name: string;
  chat(messages: AIMessage[], systemPrompt?: string): Promise<string>;
  generatePoll(topic: string, grade?: string, subject?: string, count?: number): Promise<GeneratedPoll>;
  moderateContent(text: string): Promise<ModerationResult>;
  analyzeData(data: object, prompt: string): Promise<string>;
}

// ─── MOCK PROVIDER ────────────────────────────────────────────────────────────
class MockProvider implements AIProvider {
  name = "mock";

  async chat(messages: AIMessage[]): Promise<string> {
    const last = messages[messages.length - 1]?.content?.toLowerCase() ?? "";
    if (last.includes("help") || last.includes("what can you do")) {
      return `**ELIDEMS AI — Development Mode** 🟡\n\n**Available Commands (Live Mode):**\n\n🔐 **Account Management**\n• "Block all users with overdue payments"\n• "Suspend inactive accounts"\n• "Unlock learner account for [name]"\n\n📊 **Reports & Analytics**\n• "Generate monthly payment report"\n• "Show attendance analytics for this week"\n• "List top performing students"\n\n🔔 **Notifications**\n• "Send reminder to all Grade 10 students"\n• "Alert teachers about tomorrow's class"\n\n📝 **Polls**\n• "Create a quiz on Algebra for Grade 9"\n• "Show poll results for [topic]"\n\n🛡️ **Safety**\n• "Review flagged content"\n• "Show suspicious activity alerts"\n\n*Add an API key in Admin → Settings → ELIDEMS AI to activate Live Mode.*`;
    }
    if (last.includes("block") || last.includes("suspend") || last.includes("unlock")) {
      return `[Development Mode] I would execute account management actions here. In Live Mode with a real AI provider, I would:\n\n1. Identify the relevant users\n2. Apply the requested action via the API\n3. Send notifications to affected users\n4. Log all actions for audit trail\n5. Provide a reversible action summary\n\n**Add an API key in Admin → Settings → ELIDEMS AI to activate.**`;
    }
    if (last.includes("report") || last.includes("analytic") || last.includes("statistic") || last.includes("summary")) {
      return `[Development Mode] **Sample Report Preview:**\n\n📊 **Platform Summary**\n• Total Users: Check Admin → Users\n• Active Students: See Dashboard stats\n• Payments Due: Check Admin → Payments\n\nIn Live Mode, I generate real-time intelligent reports with trend analysis, predictions, and actionable recommendations.\n\n**Add an API key in Settings → ELIDEMS AI to enable.**`;
    }
    if (last.includes("notif") || last.includes("remind") || last.includes("message")) {
      return `[Development Mode] Notification system ready. In Live Mode, I can:\n• Draft personalized messages\n• Target specific grades, roles, or individuals\n• Schedule delivery\n• Track open rates\n\n**Activate via Settings → ELIDEMS AI.**`;
    }
    if (last.includes("poll") || last.includes("quiz") || last.includes("question")) {
      return `[Development Mode] Poll generation is available! Use the Polls section to create manual polls or use the **AI Generate** button. In Live Mode, I can create full curriculum-aligned quizzes from just a topic name.\n\n**Activate via Settings → ELIDEMS AI.**`;
    }
    if (last.includes("monitor") || last.includes("activit") || last.includes("alert")) {
      return `[Development Mode] **Monitoring Status:**\n\n✅ Content Safety System — Active (Rule-Based)\n✅ Activity Logging — Active\n✅ Audit Trail — Active\n🟡 AI Intelligence — Pending API Key\n\nIn Live Mode, I provide predictive alerts, behavioral anomaly detection, and intelligent threat assessment.\n\n**Activate via Settings → ELIDEMS AI.**`;
    }
    return `**ELIDEMS AI — Development Mode** 🟡\n\nI received: *"${messages[messages.length - 1]?.content}"*\n\nDevelopment Mode uses mock responses. To enable full AI capabilities:\n\n1. Go to **Admin → Settings → ELIDEMS AI**\n2. Select your AI provider (Gemini, OpenAI, or Anthropic)\n3. Enter your API key\n4. Click **Test Connection**\n\nType **"help"** to see all available commands.`;
  }

  async generatePoll(topic: string, grade?: string, subject?: string, count = 5): Promise<GeneratedPoll> {
    return {
      title: `${subject ?? "General"} Quiz: ${topic}${grade ? ` (${grade})` : ""}`,
      questions: Array.from({ length: count }, (_, i) => ({
        question: `[Mock Q${i + 1}] Which of the following best describes a key concept in "${topic}"?`,
        difficulty: (["easy", "medium", "hard"] as const)[i % 3],
        options: [
          { text: `Correct answer for question ${i + 1}`, isCorrect: true },
          { text: `Incorrect option B`, isCorrect: false },
          { text: `Incorrect option C`, isCorrect: false },
          { text: `Incorrect option D`, isCorrect: false },
        ],
        explanation: `This is a sample explanation. Add a real AI provider to generate curriculum-aligned explanations for "${topic}".`,
      })),
    };
  }

  async moderateContent(text: string): Promise<ModerationResult> {
    const lower = text.toLowerCase();
    const critical = ["kill", "murder", "suicide", "bomb", "weapon", "shoot", "stab"];
    const high = ["hate you", "stupid idiot", "you're ugly", "i'll hurt", "shut up loser", "harass"];
    const medium = ["spam", "scam", "send money", "whatsapp number", "contact outside", "wire transfer"];
    for (const p of critical) {
      if (lower.includes(p)) return { flagged: true, reason: "Threatening or violent language", severity: "critical", categories: ["threats", "violence"] };
    }
    for (const p of high) {
      if (lower.includes(p)) return { flagged: true, reason: "Potentially harmful or harassing language", severity: "high", categories: ["harassment"] };
    }
    for (const p of medium) {
      if (lower.includes(p)) return { flagged: true, reason: "Suspicious content or spam", severity: "medium", categories: ["spam"] };
    }
    return { flagged: false, severity: "low", categories: [] };
  }

  async analyzeData(_data: object, prompt: string): Promise<string> {
    return `[Development Mode] Analysis request received: "${prompt}"\n\nAdd a real AI provider in Settings → ELIDEMS AI to enable intelligent data analysis.`;
  }
}

// ─── GEMINI PROVIDER ─────────────────────────────────────────────────────────
class GeminiProvider implements AIProvider {
  name = "gemini";
  constructor(private apiKey: string) {}

  private async call(messages: AIMessage[], system?: string): Promise<string> {
    const contents = messages
      .filter(m => m.role !== "system")
      .map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const body: Record<string, unknown> = { contents };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    if (!r.ok) throw new Error(`Gemini error ${r.status}: ${await r.text()}`);
    const j = await r.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return j.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }

  async chat(messages: AIMessage[], system?: string) { return this.call(messages, system); }

  async generatePoll(topic: string, grade?: string, subject?: string, count = 5): Promise<GeneratedPoll> {
    const prompt = `Generate a CAPS-aligned educational quiz about "${topic}"${grade ? ` for ${grade}` : ""}${subject ? ` in ${subject}` : ""}. Create exactly ${count} multiple choice questions. Return ONLY valid JSON in this exact format:
{"title":"Quiz title","questions":[{"question":"text?","difficulty":"easy|medium|hard","options":[{"text":"A","isCorrect":true},{"text":"B","isCorrect":false},{"text":"C","isCorrect":false},{"text":"D","isCorrect":false}],"explanation":"why the correct answer is correct"}]}`;
    const result = await this.call([{ role: "user", content: prompt }]);
    const match = result.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Invalid JSON from Gemini");
    return JSON.parse(match[0]) as GeneratedPoll;
  }

  async moderateContent(text: string): Promise<ModerationResult> {
    const prompt = `Analyze this message from an educational platform for harmful content. Return ONLY JSON: {"flagged":boolean,"reason":"string or null","severity":"low|medium|high|critical","categories":["threats","harassment","spam","explicit","hate_speech"]}
Message: "${text.slice(0, 500)}"`;
    const result = await this.call([{ role: "user", content: prompt }]);
    const match = result.match(/\{[\s\S]*\}/);
    if (!match) return { flagged: false, severity: "low", categories: [] };
    return JSON.parse(match[0]) as ModerationResult;
  }

  async analyzeData(data: object, prompt: string) {
    return this.call([{ role: "user", content: `${prompt}\n\nData:\n${JSON.stringify(data, null, 2)}` }]);
  }
}

// ─── OPENAI PROVIDER ─────────────────────────────────────────────────────────
class OpenAIProvider implements AIProvider {
  name = "openai";
  constructor(private apiKey: string) {}

  private async call(messages: AIMessage[], system?: string): Promise<string> {
    const all = system ? [{ role: "system", content: system }, ...messages] : messages;
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: "gpt-4o-mini", messages: all, max_tokens: 2048 }),
    });
    if (!r.ok) throw new Error(`OpenAI error ${r.status}: ${await r.text()}`);
    const j = await r.json() as { choices?: { message?: { content?: string } }[] };
    return j.choices?.[0]?.message?.content ?? "";
  }

  async chat(messages: AIMessage[], system?: string) { return this.call(messages, system); }

  async generatePoll(topic: string, grade?: string, subject?: string, count = 5): Promise<GeneratedPoll> {
    const prompt = `Generate a CAPS-aligned educational quiz about "${topic}"${grade ? ` for ${grade}` : ""}${subject ? ` in ${subject}` : ""}. Create exactly ${count} multiple choice questions. Return ONLY valid JSON: {"title":"title","questions":[{"question":"text?","difficulty":"easy|medium|hard","options":[{"text":"A","isCorrect":true},{"text":"B","isCorrect":false},{"text":"C","isCorrect":false},{"text":"D","isCorrect":false}],"explanation":"why correct"}]}`;
    const result = await this.call([{ role: "user", content: prompt }]);
    const match = result.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Invalid JSON from OpenAI");
    return JSON.parse(match[0]) as GeneratedPoll;
  }

  async moderateContent(text: string): Promise<ModerationResult> {
    const prompt = `Analyze this educational platform message for harmful content. Return ONLY JSON: {"flagged":boolean,"reason":"string or null","severity":"low|medium|high|critical","categories":["threats","harassment","spam","explicit","hate_speech"]}
Message: "${text.slice(0, 500)}"`;
    const result = await this.call([{ role: "user", content: prompt }]);
    const match = result.match(/\{[\s\S]*\}/);
    if (!match) return { flagged: false, severity: "low", categories: [] };
    return JSON.parse(match[0]) as ModerationResult;
  }

  async analyzeData(data: object, prompt: string) {
    return this.call([{ role: "user", content: `${prompt}\n\nData:\n${JSON.stringify(data, null, 2)}` }]);
  }
}

// ─── ANTHROPIC PROVIDER ───────────────────────────────────────────────────────
class AnthropicProvider implements AIProvider {
  name = "anthropic";
  constructor(private apiKey: string) {}

  private async call(messages: AIMessage[], system?: string): Promise<string> {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 2048,
        ...(system ? { system } : {}),
        messages: messages.filter(m => m.role !== "system"),
      }),
    });
    if (!r.ok) throw new Error(`Anthropic error ${r.status}: ${await r.text()}`);
    const j = await r.json() as { content?: { text?: string }[] };
    return j.content?.[0]?.text ?? "";
  }

  async chat(messages: AIMessage[], system?: string) { return this.call(messages, system); }

  async generatePoll(topic: string, grade?: string, subject?: string, count = 5): Promise<GeneratedPoll> {
    const prompt = `Generate a CAPS-aligned educational quiz about "${topic}"${grade ? ` for ${grade}` : ""}${subject ? ` in ${subject}` : ""}. Create exactly ${count} multiple choice questions. Return ONLY valid JSON: {"title":"title","questions":[{"question":"text?","difficulty":"easy|medium|hard","options":[{"text":"A","isCorrect":true},{"text":"B","isCorrect":false},{"text":"C","isCorrect":false},{"text":"D","isCorrect":false}],"explanation":"why correct"}]}`;
    const result = await this.call([{ role: "user", content: prompt }]);
    const match = result.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Invalid JSON from Anthropic");
    return JSON.parse(match[0]) as GeneratedPoll;
  }

  async moderateContent(text: string): Promise<ModerationResult> {
    const prompt = `Analyze this educational platform message for harmful content. Return ONLY JSON: {"flagged":boolean,"reason":"string or null","severity":"low|medium|high|critical","categories":["threats","harassment","spam","explicit","hate_speech"]}
Message: "${text.slice(0, 500)}"`;
    const result = await this.call([{ role: "user", content: prompt }]);
    const match = result.match(/\{[\s\S]*\}/);
    if (!match) return { flagged: false, severity: "low", categories: [] };
    return JSON.parse(match[0]) as ModerationResult;
  }

  async analyzeData(data: object, prompt: string) {
    return this.call([{ role: "user", content: `${prompt}\n\nData:\n${JSON.stringify(data, null, 2)}` }]);
  }
}

// ─── FACTORY ─────────────────────────────────────────────────────────────────
let _cached: AIProvider | null = null;
let _cacheTs = 0;

export async function getAIProvider(): Promise<AIProvider> {
  if (_cached && Date.now() - _cacheTs < 30_000) return _cached;
  const rows = await db.select().from(platformSettingsTable);
  const cfg: Record<string, string> = {};
  for (const r of rows) cfg[r.key] = r.value ?? "";
  const name = cfg["ai_provider"] ?? "mock";
  if (name === "gemini" && cfg["gemini_api_key"]) _cached = new GeminiProvider(cfg["gemini_api_key"]);
  else if (name === "openai" && cfg["openai_api_key"]) _cached = new OpenAIProvider(cfg["openai_api_key"]);
  else if (name === "anthropic" && cfg["anthropic_api_key"]) _cached = new AnthropicProvider(cfg["anthropic_api_key"]);
  else _cached = new MockProvider();
  _cacheTs = Date.now();
  return _cached;
}

export function invalidateAICache(): void {
  _cached = null;
  _cacheTs = 0;
}
