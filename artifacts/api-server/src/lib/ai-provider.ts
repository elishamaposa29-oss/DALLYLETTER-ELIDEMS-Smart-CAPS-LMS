import { db, platformSettingsTable } from "@workspace/db";
import { AIProviderError, requestProviderJson } from "./ai-provider-http";
export { AIProviderError } from "./ai-provider-http";

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

const AI_MODERATION_CATEGORIES = [
  "cyberbullying", "harassment", "threats", "hate_speech", "explicit_nudity",
  "sexual_exploitation", "grooming", "self_harm_risk", "personal_data",
  "credential_theft", "phishing", "scam_fraud", "unapproved_marketing", "spam",
] as const;

/** Context-aware moderation prompt. Model output is a review signal, never an enforcement decision. */
function buildModerationPrompt(text: string): string {
  return `You are a careful content-safety reviewer for a welcoming multi-user education platform used by learners, prefects, teachers and staff. Review the submitted text for:
- cyberbullying, targeted harassment, intimidation, credible threats and hate speech;
- explicit sexual content, nudity solicitation, sexual exploitation or grooming (treat suspected exploitation of minors as critical);
- sharing or requesting passwords, OTPs, recovery codes, payment credentials, identity documents or unnecessary private personal data;
- phishing, impersonation, scams, fraud, coercive off-platform contact and credential theft;
- spam and clearly unrelated commercial advertising or repeated promotion that displaces learning/teaching.
Be context-aware and fair. Do NOT flag ordinary schoolwork, legitimate educational links, curriculum discussion, respectful disagreement, harmless jokes, slang, dialect, quoted examples used for teaching, or a user's ordinary business identity unless it is unsolicited promotional spam. Consider context and intent; do not infer misconduct from identity, disability, language variety or age. If uncertain, use low/medium severity and explain uncertainty. Return ONLY valid JSON with this exact shape: {"flagged":boolean,"reason":"short neutral explanation","severity":"low|medium|high|critical","categories":["category"]}. Choose categories only from: ${AI_MODERATION_CATEGORIES.join(", ")}. A flag only requests human review. Never recommend automatic punishment, account suspension, deletion or public accusation. Text to review (JSON encoded): ${JSON.stringify(text.slice(0, 4000))}`;
}

function parseModerationResult(raw: string): ModerationResult {
  const reviewRequired: ModerationResult = {
    flagged: true,
    reason: "AI moderation returned an unreadable result; authorized human review is recommended.",
    severity: "low",
    categories: ["moderation_parse_failure"],
  };
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return reviewRequired;
  try {
    const parsed = JSON.parse(match[0]) as Partial<ModerationResult>;
    if (typeof parsed.flagged !== "boolean") return reviewRequired;
    const validSeverities = new Set(["low", "medium", "high", "critical"]);
    const categories = Array.isArray(parsed.categories)
      ? parsed.categories.filter((value): value is string => typeof value === "string" && (AI_MODERATION_CATEGORIES as readonly string[]).includes(value)).slice(0, 8)
      : [];
    return {
      flagged: parsed.flagged,
      reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 500) : undefined,
      severity: validSeverities.has(String(parsed.severity)) ? parsed.severity as ModerationResult["severity"] : "medium",
      categories: parsed.flagged && categories.length === 0 ? ["unclassified"] : categories,
    };
  } catch {
    return reviewRequired;
  }
}

export interface AIProvider {
  name: string;
  chat(messages: AIMessage[], systemPrompt?: string, signal?: AbortSignal): Promise<string>;
  generatePoll(topic: string, grade?: string, subject?: string, count?: number): Promise<GeneratedPoll>;
  moderateContent(text: string): Promise<ModerationResult>;
  analyzeData(data: object, prompt: string): Promise<string>;
}

// ─── MOCK PROVIDER ────────────────────────────────────────────────────────────
class MockProvider implements AIProvider {
  name = "mock";

  async chat(messages: AIMessage[], _systemPrompt?: string, _signal?: AbortSignal): Promise<string> {
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
    const lower = text.normalize("NFKC").toLowerCase();
    const rules: Array<{ terms: string[]; severity: ModerationResult["severity"]; category: string; reason: string }> = [
      { terms: ["i will kill you", "i'm going to kill you", "i am going to kill you", "i will hurt you", "i am coming to hurt you", "i'll shoot you"], severity: "critical", category: "threats", reason: "Possible direct threat requiring human review" },
      { terms: ["send nudes", "send me nude", "child sexual", "sexual blackmail", "explicit photo of a child"], severity: "critical", category: "sexual_exploitation", reason: "Possible sexual exploitation or explicit solicitation" },
      { terms: ["send me your password", "share your otp", "give me your verification code", "send your login code", "share your recovery code", "send your bank pin"], severity: "high", category: "credential_theft", reason: "Possible credential or verification-code theft" },
      { terms: ["pay a fee to claim your prize", "send money to claim", "guaranteed investment profit", "click here to verify your password", "your account will close unless you login"], severity: "high", category: "scam_fraud", reason: "Possible scam or phishing attempt" },
      { terms: ["buy my products", "order from my business", "limited time sale", "use my affiliate link", "subscribe to my paid channel"], severity: "medium", category: "unapproved_marketing", reason: "Possible unrelated commercial promotion" },
      { terms: ["hate speech", "i hate all [group]", "you are worthless", "nobody wants you", "i will expose your address"], severity: "high", category: "harassment", reason: "Possible harassment or privacy abuse" },
    ];
    for (const rule of rules) {
      if (rule.terms.some(term => lower.includes(term))) {
        return { flagged: true, reason: rule.reason, severity: rule.severity, categories: [rule.category] };
      }
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

  private async call(messages: AIMessage[], system?: string, signal?: AbortSignal): Promise<string> {
    const contents = messages
      .filter(m => m.role !== "system")
      .map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const body: Record<string, unknown> = { contents };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    const j = await requestProviderJson(
      this.name,
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal },
    ) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = j.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string" || !text.trim()) throw new AIProviderError(this.name, "invalid_response");
    return text;
  }

  async chat(messages: AIMessage[], system?: string, signal?: AbortSignal) { return this.call(messages, system, signal); }

  async generatePoll(topic: string, grade?: string, subject?: string, count = 5): Promise<GeneratedPoll> {
    const prompt = `Generate a CAPS-aligned educational quiz about "${topic}"${grade ? ` for ${grade}` : ""}${subject ? ` in ${subject}` : ""}. Create exactly ${count} multiple choice questions. Return ONLY valid JSON in this exact format:
{"title":"Quiz title","questions":[{"question":"text?","difficulty":"easy|medium|hard","options":[{"text":"A","isCorrect":true},{"text":"B","isCorrect":false},{"text":"C","isCorrect":false},{"text":"D","isCorrect":false}],"explanation":"why the correct answer is correct"}]}`;
    const result = await this.call([{ role: "user", content: prompt }]);
    const match = result.match(/\{[\s\S]*\}/);
    if (!match) throw new AIProviderError(this.name, "invalid_response");
    return JSON.parse(match[0]) as GeneratedPoll;
  }

  async moderateContent(text: string): Promise<ModerationResult> {
    const prompt = buildModerationPrompt(text);
    const result = await this.call([{ role: "user", content: prompt }]);
    return parseModerationResult(result);
  }

  async analyzeData(data: object, prompt: string) {
    return this.call([{ role: "user", content: `${prompt}\n\nData:\n${JSON.stringify(data, null, 2)}` }]);
  }
}

// ─── OPENAI PROVIDER ─────────────────────────────────────────────────────────
class OpenAIProvider implements AIProvider {
  name = "openai";
  constructor(private apiKey: string) {}

  private async call(messages: AIMessage[], system?: string, signal?: AbortSignal): Promise<string> {
    const all = system ? [{ role: "system", content: system }, ...messages] : messages;
    const j = await requestProviderJson("openai", "https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: "gpt-4o-mini", messages: all, max_tokens: 2048 }),
      signal,
    }) as { choices?: { message?: { content?: string } }[] };
    const text = j.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new AIProviderError(this.name, "invalid_response");
    return text;
  }

  async chat(messages: AIMessage[], system?: string, signal?: AbortSignal) { return this.call(messages, system, signal); }

  async generatePoll(topic: string, grade?: string, subject?: string, count = 5): Promise<GeneratedPoll> {
    const prompt = `Generate a CAPS-aligned educational quiz about "${topic}"${grade ? ` for ${grade}` : ""}${subject ? ` in ${subject}` : ""}. Create exactly ${count} multiple choice questions. Return ONLY valid JSON: {"title":"title","questions":[{"question":"text?","difficulty":"easy|medium|hard","options":[{"text":"A","isCorrect":true},{"text":"B","isCorrect":false},{"text":"C","isCorrect":false},{"text":"D","isCorrect":false}],"explanation":"why correct"}]}`;
    const result = await this.call([{ role: "user", content: prompt }]);
    const match = result.match(/\{[\s\S]*\}/);
    if (!match) throw new AIProviderError(this.name, "invalid_response");
    return JSON.parse(match[0]) as GeneratedPoll;
  }

  async moderateContent(text: string): Promise<ModerationResult> {
    const prompt = buildModerationPrompt(text);
    const result = await this.call([{ role: "user", content: prompt }]);
    return parseModerationResult(result);
  }

  async analyzeData(data: object, prompt: string) {
    return this.call([{ role: "user", content: `${prompt}\n\nData:\n${JSON.stringify(data, null, 2)}` }]);
  }
}

// ─── ANTHROPIC PROVIDER ───────────────────────────────────────────────────────
class AnthropicProvider implements AIProvider {
  name = "anthropic";
  constructor(private apiKey: string) {}

  private async call(messages: AIMessage[], system?: string, signal?: AbortSignal): Promise<string> {
    const j = await requestProviderJson("anthropic", "https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 2048,
        ...(system ? { system } : {}),
        messages: messages.filter(m => m.role !== "system"),
      }),
      signal,
    }) as { content?: { text?: string }[] };
    const text = j.content?.[0]?.text;
    if (typeof text !== "string" || !text.trim()) throw new AIProviderError(this.name, "invalid_response");
    return text;
  }

  async chat(messages: AIMessage[], system?: string, signal?: AbortSignal) { return this.call(messages, system, signal); }

  async generatePoll(topic: string, grade?: string, subject?: string, count = 5): Promise<GeneratedPoll> {
    const prompt = `Generate a CAPS-aligned educational quiz about "${topic}"${grade ? ` for ${grade}` : ""}${subject ? ` in ${subject}` : ""}. Create exactly ${count} multiple choice questions. Return ONLY valid JSON: {"title":"title","questions":[{"question":"text?","difficulty":"easy|medium|hard","options":[{"text":"A","isCorrect":true},{"text":"B","isCorrect":false},{"text":"C","isCorrect":false},{"text":"D","isCorrect":false}],"explanation":"why correct"}]}`;
    const result = await this.call([{ role: "user", content: prompt }]);
    const match = result.match(/\{[\s\S]*\}/);
    if (!match) throw new AIProviderError(this.name, "invalid_response");
    return JSON.parse(match[0]) as GeneratedPoll;
  }

  async moderateContent(text: string): Promise<ModerationResult> {
    const prompt = buildModerationPrompt(text);
    const result = await this.call([{ role: "user", content: prompt }]);
    return parseModerationResult(result);
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
  const cfg: Record<string, string> = {};
  try {
    const rows = await db.select().from(platformSettingsTable);
    for (const r of rows) cfg[r.key] = r.value ?? "";
  } catch {
    throw new AIProviderError("configuration", "configuration_unavailable");
  }

  // Database settings override deployment environment variables. This keeps
  // owner-configured settings stable while allowing secure server-side setup
  // through Render/other secret managers without putting keys in the client.
  const geminiKey = cfg["gemini_api_key"] || process.env.GEMINI_API_KEY || "";
  const openaiKey = cfg["openai_api_key"] || process.env.OPENAI_API_KEY || "";
  const anthropicKey = cfg["anthropic_api_key"] || process.env.ANTHROPIC_API_KEY || "";
  const configuredName = cfg["ai_provider"] || process.env.AI_PROVIDER;
  const name = configuredName || (
    geminiKey ? "gemini" :
    openaiKey ? "openai" :
    anthropicKey ? "anthropic" : "mock"
  );

  if (name === "mock") _cached = new MockProvider();
  else if (name === "gemini") {
    if (!geminiKey) throw new AIProviderError("gemini", "invalid_credentials");
    _cached = new GeminiProvider(geminiKey);
  } else if (name === "openai") {
    if (!openaiKey) throw new AIProviderError("openai", "invalid_credentials");
    _cached = new OpenAIProvider(openaiKey);
  } else if (name === "anthropic") {
    if (!anthropicKey) throw new AIProviderError("anthropic", "invalid_credentials");
    _cached = new AnthropicProvider(anthropicKey);
  } else {
    throw new AIProviderError(String(name), "provider_rejected");
  }
  _cacheTs = Date.now();
  return _cached;
}

export function invalidateAICache(): void {
  _cached = null;
  _cacheTs = 0;
}
