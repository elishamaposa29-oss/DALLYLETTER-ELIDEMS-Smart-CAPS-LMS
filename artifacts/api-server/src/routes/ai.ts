import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db, aiActionsTable, auditLogsTable, usersTable, platformSettingsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";
import { normalizeRole, canUseStaffAI } from "../lib/role-access";
import { managerHasPermission } from "../lib/manager-permission-policy";
import { AIProviderError, getAIProvider, invalidateAICache, type AIMessage } from "../lib/ai-provider";

const router = Router();

const ELIDEMS_SYSTEM_PROMPT = `You are ELIDEMS AI, an intelligent administrative assistant for DallyLetter Elidems — a CAPS education platform serving students and teachers in South Africa and Zimbabwe.

Your capabilities:
- Read and analyze platform data (users, payments, lessons, attendance)
- Recommend administrative actions (block, suspend, unlock users) for authorized human review
- Draft notifications and reminders for authorized human review
- Generate reports and analytics
- Moderate content and flag safety issues
- Provide recommendations

Your constraints:
- NEVER bypass role permissions
- ALL actions must be logged
- ALL actions must be reversible
- Be professional, helpful, and concise
- Never execute actions or cause side effects from generated text
- Require explicit human confirmation through the dedicated, separately authorized application workflow before consequential actions

Platform context: Role-based system with Students, Teachers, and Owner/Admin.`;

// GET /ai/status — check AI provider status
router.get("/ai/status", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!["owner", "platform_owner"].includes(normalizeRole(user.role))) { res.status(403).json({ error: "Owner only" }); return; }
  try {
    const ai = await getAIProvider();
    const rows = await db.select().from(platformSettingsTable);
    const cfg: Record<string, string> = {};
    for (const r of rows) cfg[r.key] = r.value ?? "";
    const environmentProvider = process.env.AI_PROVIDER;
    const inferredProvider = process.env.GEMINI_API_KEY
      ? "gemini"
      : process.env.OPENAI_API_KEY
        ? "openai"
        : process.env.ANTHROPIC_API_KEY
          ? "anthropic"
          : "mock";
    res.json({
      provider: ai.name,
      isLive: ai.name !== "mock",
      configuredProvider: cfg["ai_provider"] || environmentProvider || inferredProvider,
      hasGeminiKey: !!(cfg["gemini_api_key"] || process.env.GEMINI_API_KEY),
      hasOpenAIKey: !!(cfg["openai_api_key"] || process.env.OPENAI_API_KEY),
      hasAnthropicKey: !!(cfg["anthropic_api_key"] || process.env.ANTHROPIC_API_KEY),
    });
  } catch (err) {
    const failure = err instanceof AIProviderError ? err : new AIProviderError("configuration", "configuration_unavailable");
    res.status(failure.code === "configuration_unavailable" ? 503 : 502).json({
      error: "AI provider status is temporarily unavailable. Review provider configuration and retry.",
      code: failure.code,
      retryable: failure.retryable,
    });
  }
});

// POST /ai/chat — ELIDEMS AI command center
router.post("/ai/chat", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const role = normalizeRole(user.role);
  const learnerMode = role === "student" || role === "learner" || role === "prefect";
  const requestedMode = req.body?.mode === "agent" ? "agent" : "chat";
  if (learnerMode && requestedMode === "agent") { res.status(403).json({ error: "Agent mode is not available to learner or prefect accounts." }); return; }
  if (!learnerMode && !canUseStaffAI(user)) { res.status(403).json({ error: "Access denied. ELIDEMS AI is unavailable for this account." }); return; }
  if (requestedMode === "agent" && ["manager","senior_manager","junior_manager"].includes(role) && !(await managerHasPermission(user, "ai.agent.use"))) {
    res.status(403).json({ error: "The Owner has not granted ELIDEMS AI Agent access to this manager account.", permission: "ai.agent.use" }); return;
  }
  if (requestedMode === "agent" && role === "teacher" && ["draft","pending_review","rejected_pending_conversion"].includes(String(user.teacherApplicationStatus || "").toLowerCase())) {
    res.status(403).json({ error: "Teacher Agent access begins after teacher authorization." }); return;
  }

  const { messages } = req.body as { messages: AIMessage[] };
  const messageLimit = learnerMode ? 20 : 50;
  const characterLimit = learnerMode ? 4000 : 20000;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > messageLimit ||
      messages.some(message => !message || !["user", "assistant"].includes(message.role) ||
        typeof message.content !== "string" || message.content.length > characterLimit)) {
    res.status(400).json({ error: `Provide 1–${messageLimit} valid messages with text content no longer than ${characterLimit} characters each.` });
    return;
  }

  const requestId = randomUUID();
  let stage = "provider_configuration";
  let providerName = "unknown";

  try {
    const ai = await getAIProvider();
    providerName = ai.name;
    stage = "provider_request";
    const systemPrompt = learnerMode
      ? `You are ELIDEMS AI, a friendly learning companion inside Dallyletter Elidems. Help learners and prefects understand school subjects, practise skills, plan study, and communicate respectfully. Be warm, patient, age-appropriate, and never shame a learner. Do not request passwords, verification codes, payment credentials, home addresses, private contact details, or other unnecessary personal information. Do not reveal platform data, other users' information, internal moderation notes, staff-only tools, or account controls. Never claim to have changed grades, attendance, fees, permissions, or accounts. If a user reports bullying, exploitation, threats, explicit requests, scams, or credential theft, encourage them to use the platform's report/help controls and tell a trusted adult or authorized staff member when appropriate. Do not treat slang, jokes, dialect, disability, or ordinary disagreement as misconduct without context.`
      : requestedMode === "agent"
        ? `You are ELIDEMS AI Agent for an authorized Dallyletter Elidems staff member. You may help plan and prepare work only within the user's existing role and individually granted capabilities. Never infer permissions from a job title, never access Owner-only information for managers, never act on a different school or user scope, and never execute consequential operations from generated text. This endpoint is currently a planning/conversation interface; tell the user when an operation must be completed in its existing authorized workflow. ${ELIDEMS_SYSTEM_PROMPT}`
        : ELIDEMS_SYSTEM_PROMPT;
    const response = await ai.chat(messages, systemPrompt);
    if (typeof response !== "string" || !response.trim()) throw new AIProviderError(ai.name, "invalid_response");

    // Interaction logging is best-effort. A healthy model response must not be
    // converted into an HTTP 500 merely because the audit database is unavailable.
    stage = "interaction_logging";
    try {
      await db.insert(aiActionsTable).values({
        // Persist only non-sensitive event metadata. Never persist prompt,
        // model response, provider credentials, or user-supplied secrets here.
        command: "AI chat request",
        action: "ai_chat_response",
        performedBy: user.id,
        result: "Response generated successfully",
      });
    } catch {
      console.error(JSON.stringify({
        event: "ai_interaction_log_failed",
        requestId,
        userId: user.id,
        provider: providerName,
        stage: "interaction_logging",
      }));
    }

    // Chat output is advisory only. No privileged action is executed from model
    // text; consequential actions must be initiated through their separately
    // authorized UI/API workflow after an explicit human confirmation.
    res.json({
      response,
      provider: ai.name,
      isLive: ai.name !== "mock",
      requestId,
      actionsExecuted: false,
      consequentialActionsRequireExplicitConfirmation: true,
      mode: learnerMode ? "learning" : requestedMode,
    });
  } catch (err) {
    const failure = err instanceof AIProviderError
      ? err
      : new AIProviderError(providerName, stage === "provider_configuration" ? "configuration_unavailable" : "provider_unavailable");
    const statusCode = failure.code === "timeout" ? 504
      : failure.code === "cancelled" ? 499
      : failure.code === "rate_limited" ? 429
      : failure.code === "configuration_unavailable" ? 503
      : failure.code === "invalid_credentials" || failure.code === "provider_rejected" ? 502
      : 502;
    const publicMessages: Record<string, string> = {
      timeout: "The AI provider took too long to respond. Please retry.",
      cancelled: "The AI request was cancelled before completion.",
      network_error: "The AI provider could not be reached. Please retry.",
      rate_limited: "The AI provider is temporarily rate-limiting requests. Please retry shortly.",
      invalid_credentials: "The configured AI provider credentials were rejected. An Owner should review provider configuration.",
      provider_unavailable: "The AI provider is temporarily unavailable. Please retry shortly.",
      invalid_response: "The AI provider returned an unusable response. Please retry.",
      provider_rejected: "The AI provider rejected this request. Please review the request and provider configuration.",
      configuration_unavailable: "AI configuration is temporarily unavailable. Please contact the platform Owner.",
    };
    console.error(JSON.stringify({
      event: "ai_chat_failed",
      requestId,
      userId: user.id,
      provider: failure.provider,
      stage,
      category: failure.code,
      providerStatus: failure.statusCode ?? null,
    }));
    res.status(statusCode).json({
      error: publicMessages[failure.code],
      code: failure.code,
      requestId,
      retryable: failure.retryable,
    });
  }
});

// POST /ai/settings — save AI provider settings
router.post("/ai/settings", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role !== "owner") { res.status(403).json({ error: "Owner only" }); return; }
  const { provider, gemini_api_key, openai_api_key, anthropic_api_key } = req.body as Record<string, string>;

  const updates: { key: string; value: string }[] = [];
  if (provider) {
    if (!["mock", "gemini", "openai", "anthropic"].includes(provider)) { res.status(400).json({ error: "Unsupported AI provider" }); return; }
    updates.push({ key: "ai_provider", value: provider });
  }
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
    const failure = err instanceof AIProviderError ? err : new AIProviderError("configuration", "provider_unavailable");
    res.status(failure.code === "timeout" ? 504 : failure.code === "rate_limited" ? 429 : 502)
      .json({ success: false, code: failure.code, error: "AI provider connection failed safely. Review the provider configuration and retry." });
  }
});

// GET /ai/actions — list AI action log
router.get("/ai/actions", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!["owner", "platform_owner"].includes(String(user.role || "").trim().toLowerCase().replace(/[ -]+/g, "_"))) { res.status(403).json({ error: "Owner access required" }); return; }
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
  if (!["owner", "platform_owner"].includes(String(user.role || "").trim().toLowerCase().replace(/[ -]+/g, "_"))) { res.status(403).json({ error: "Owner access required" }); return; }
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
  if (!canUseStaffAI(user)) { res.status(403).json({ error: "Authorized staff access required" }); return; }
  const { data, prompt } = req.body as { data: object; prompt: string };
  if (!prompt) { res.status(400).json({ error: "prompt required" }); return; }
  try {
    const ai = await getAIProvider();
    const result = await ai.analyzeData(data ?? {}, prompt);
    res.json({ result, provider: ai.name });
  } catch (err) {
    const failure = err instanceof AIProviderError ? err : new AIProviderError("configuration", "provider_unavailable");
    const statusCode = failure.code === "timeout" ? 504 : failure.code === "rate_limited" ? 429 : 502;
    res.status(statusCode).json({
      error: "AI analysis could not be completed. Please retry or ask the Owner to review provider configuration.",
      code: failure.code,
      retryable: failure.retryable,
    });
  }
});

export default router;
