import { Router } from "express";
import { db, aiActionsTable, auditLogsTable, usersTable, platformSettingsTable, notificationsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";
import { getAIProvider, invalidateAICache, type AIMessage } from "../lib/ai-provider";

const router = Router();

const ELIDEMS_SYSTEM_PROMPT = `You are ELIDEMS AI, an intelligent administrative assistant for DallyLetter Elidems — a CAPS education platform serving students and teachers in South Africa and Zimbabwe.

Your capabilities:
- Read and analyze platform data (users, payments, lessons, attendance)
- Execute administrative actions (block, suspend, unlock users)
- Send notifications and reminders
- Generate reports and analytics
- Moderate content and flag safety issues
- Provide recommendations

Your constraints:
- NEVER bypass role permissions
- ALL actions must be logged
- ALL actions must be reversible
- Be professional, helpful, and concise
- When executing actions, confirm what you did clearly

Platform context: Role-based system with Students, Teachers, and Owner/Admin.`;

// GET /ai/status — check AI provider status
router.get("/ai/status", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role === "student") { res.status(403).json({ error: "Forbidden" }); return; }
  const ai = await getAIProvider();
  const rows = await db.select().from(platformSettingsTable);
  const cfg: Record<string, string> = {};
  for (const r of rows) cfg[r.key] = r.value ?? "";
  res.json({
    provider: ai.name,
    isLive: ai.name !== "mock",
    configuredProvider: cfg["ai_provider"] ?? "mock",
    hasGeminiKey: !!(cfg["gemini_api_key"]),
    hasOpenAIKey: !!(cfg["openai_api_key"]),
    hasAnthropicKey: !!(cfg["anthropic_api_key"]),
  });
});

// POST /ai/chat — ELIDEMS AI command center
router.post("/ai/chat", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role === "student") { res.status(403).json({ error: "Access denied. ELIDEMS AI is for authorized staff." }); return; }

  const { messages, sessionId } = req.body as { messages: AIMessage[]; sessionId?: string };
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages required" }); return;
  }

  const lastUserMsg = messages[messages.length - 1]?.content ?? "";

  try {
    const ai = await getAIProvider();
    const response = await ai.chat(messages, ELIDEMS_SYSTEM_PROMPT);

    // Log the AI interaction
    await db.insert(aiActionsTable).values({
      command: lastUserMsg.slice(0, 500),
      action: "ai_chat_response",
      performedBy: user.id,
      result: response.slice(0, 500),
    });

    // Auto-detect and execute actions if in live mode
    if (ai.name !== "mock") {
      await autoExecuteActions(lastUserMsg, response, user.id);
    }

    res.json({ response, provider: ai.name, isLive: ai.name !== "mock" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI request failed";
    res.status(500).json({ error: msg });
  }
});

// POST /ai/settings — save AI provider settings
router.post("/ai/settings", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role !== "owner") { res.status(403).json({ error: "Owner only" }); return; }
  const { provider, gemini_api_key, openai_api_key, anthropic_api_key } = req.body as Record<string, string>;

  const updates: { key: string; value: string }[] = [];
  if (provider) updates.push({ key: "ai_provider", value: provider });
  if (gemini_api_key !== undefined) updates.push({ key: "gemini_api_key", value: gemini_api_key });
  if (openai_api_key !== undefined) updates.push({ key: "openai_api_key", value: openai_api_key });
  if (anthropic_api_key !== undefined) updates.push({ key: "anthropic_api_key", value: anthropic_api_key });

  for (const { key, value } of updates) {
    const [existing] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, key));
    if (existing) {
      await db.update(platformSettingsTable).set({ value }).where(eq(platformSettingsTable.key, key));
    } else {
      await db.insert(platformSettingsTable).values({ key, value });
    }
  }

  invalidateAICache();

  await db.insert(auditLogsTable).values({ action: "Updated AI provider settings", category: "admin", performedBy: user.id, details: JSON.stringify({ provider }) });
  res.json({ success: true });
});

// POST /ai/test-connection — test the current AI provider
router.post("/ai/test-connection", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role !== "owner") { res.status(403).json({ error: "Owner only" }); return; }
  invalidateAICache();
  try {
    const ai = await getAIProvider();
    const response = await ai.chat([{ role: "user", content: "Hello! Please respond with exactly: ELIDEMS AI connection successful." }]);
    const success = response.toLowerCase().includes("elide") || response.toLowerCase().includes("success") || response.length > 10;
    res.json({ success, provider: ai.name, isLive: ai.name !== "mock", response: response.slice(0, 200) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Connection failed";
    res.json({ success: false, error: msg });
  }
});

// GET /ai/actions — list AI action log
router.get("/ai/actions", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role === "student") { res.status(403).json({ error: "Forbidden" }); return; }
  const actions = await db.select({
    id: aiActionsTable.id, command: aiActionsTable.command, action: aiActionsTable.action,
    targetType: aiActionsTable.targetType, targetId: aiActionsTable.targetId,
    result: aiActionsTable.result, isReversed: aiActionsTable.isReversed,
    createdAt: aiActionsTable.createdAt, performerName: usersTable.name,
  }).from(aiActionsTable)
    .leftJoin(usersTable, eq(aiActionsTable.performedBy, usersTable.id))
    .orderBy(desc(aiActionsTable.createdAt))
    .limit(100);
  res.json(actions);
});

// PATCH /ai/actions/:id/reverse — reverse an AI action
router.patch("/ai/actions/:id/reverse", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role === "student") { res.status(403).json({ error: "Forbidden" }); return; }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [action] = await db.select().from(aiActionsTable).where(eq(aiActionsTable.id, id));
  if (!action) { res.status(404).json({ error: "Not found" }); return; }
  if (action.isReversed) { res.status(400).json({ error: "Already reversed" }); return; }
  const [updated] = await db.update(aiActionsTable).set({ isReversed: true, reversedBy: user.id, reversedAt: new Date() }).where(eq(aiActionsTable.id, id)).returning();
  await db.insert(auditLogsTable).values({ action: `Reversed AI action #${id}: ${action.action}`, category: "ai", performedBy: user.id, targetType: action.targetType ?? undefined, targetId: action.targetId ?? undefined });
  res.json(updated);
});

// POST /ai/analyze — AI data analysis
router.post("/ai/analyze", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role === "student") { res.status(403).json({ error: "Forbidden" }); return; }
  const { data, prompt } = req.body as { data: object; prompt: string };
  if (!prompt) { res.status(400).json({ error: "prompt required" }); return; }
  try {
    const ai = await getAIProvider();
    const result = await ai.analyzeData(data ?? {}, prompt);
    res.json({ result, provider: ai.name });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Analysis failed";
    res.status(500).json({ error: msg });
  }
});

// Helper: auto-execute simple actions detected in the AI response
async function autoExecuteActions(command: string, _response: string, userId: number): Promise<void> {
  const lower = command.toLowerCase();
  if (lower.includes("send reminder") || lower.includes("send notification")) {
    await db.insert(notificationsTable).values({
      title: "Reminder from ELIDEMS AI",
      message: "This is an automated reminder sent by ELIDEMS AI on behalf of the admin.",
      type: "reminder",
      recipientId: null,
    });
    await db.insert(auditLogsTable).values({ action: "AI auto-sent broadcast notification", category: "ai", performedBy: userId });
  }
}

export default router;
