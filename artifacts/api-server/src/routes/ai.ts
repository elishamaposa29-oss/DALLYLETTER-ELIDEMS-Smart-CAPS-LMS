import { Router } from "express";
import { randomUUID, createHash } from "node:crypto";
import { db, aiActionsTable, auditLogsTable, usersTable, platformSettingsTable, pool } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";
import { normalizeRole, canUseStaffAI } from "../lib/role-access";
import { managerHasPermission } from "../lib/manager-permission-policy";
import { AIProviderError, getAIProvider, invalidateAICache, type AIMessage } from "../lib/ai-provider";

const router = Router();

const ELIDEMS_SYSTEM_PROMPT = `You are ELIDEMS AI, an intelligent administrative assistant for DallyLetter Elidems — a CAPS education platform serving students and teachers in South Africa and Zimbabwe.

Your capabilities:
- Help staff plan work, draft communications, prepare learning materials, and analyze information explicitly supplied in the conversation
- Explain existing Dallyletter workflows and recommend next steps
- Help interpret safety reports without deciding guilt or imposing penalties

Your constraints:
- This chat endpoint has no direct database, dashboard, file, media or task-execution tools. Never claim to have inspected private platform records or completed an operation unless a separately authorized workflow confirms it.
- NEVER bypass role permissions or infer access from a job title
- Never expose another user's credentials, private data, internal reports or Owner-only information
- Never execute actions or cause side effects from generated text
- Consequential operations must use the existing separately authorized application workflow and explicit human confirmation
- Be professional, helpful, fair, welcoming and concise

Platform context: Role-based educational system with learners, prefects, teachers, managers and Owner.`;

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
    if (res.destroyed || res.headersSent) return;
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
  const learnerMode = role === "student" || role === "learner" || role === "prefect" || user.isPrefect === true;
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
  const providerAbort = new AbortController();
  req.once("aborted", () => providerAbort.abort());
  res.once("close", () => { if (!res.writableEnded) providerAbort.abort(); });

  try {
    const ai = await getAIProvider();
    providerName = ai.name;
    stage = "provider_request";
    const systemPrompt = learnerMode
      ? `You are ELIDEMS AI, a friendly learning companion inside Dallyletter Elidems. Help learners and prefects understand school subjects, practise skills, plan study, and communicate respectfully. Be warm, patient, age-appropriate, and never shame a learner. Do not request passwords, verification codes, payment credentials, home addresses, private contact details, or other unnecessary personal information. Do not reveal platform data, other users' information, internal moderation notes, staff-only tools, or account controls. Never claim to have changed grades, attendance, fees, permissions, or accounts. If a user reports bullying, exploitation, threats, explicit requests, scams, or credential theft, encourage them to use the platform's report/help controls and tell a trusted adult or authorized staff member when appropriate. Do not treat slang, jokes, dialect, disability, or ordinary disagreement as misconduct without context.`
      : requestedMode === "agent"
        ? `You are ELIDEMS AI Agent for an authorized Dallyletter Elidems staff member. You may help plan and prepare work only within the user's existing role and individually granted capabilities. Never infer permissions from a job title, never access Owner-only information for managers, never act on a different school or user scope, and never execute consequential operations from generated text. This endpoint is currently a planning/conversation interface; tell the user when an operation must be completed in its existing authorized workflow. ${ELIDEMS_SYSTEM_PROMPT}`
        : ELIDEMS_SYSTEM_PROMPT;
    const response = await ai.chat(messages, systemPrompt, providerAbort.signal);
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
    res.status(failure.code === "timeout" ? 504 : failure.code === "cancelled" ? 499 : failure.code === "rate_limited" ? 429 : 502)
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

// POST /ai/school-id-analysis — analysis is grounded only in an exact, valid School ID
// and academic sections the learner has explicitly published to Everyone.
router.post("/ai/school-id-analysis", requireAuth, async (req, res): Promise<void> => {
  const schoolId = String(req.body?.schoolId || "").trim().toUpperCase();
  const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const valid = /^DL-[A-HJ-NP-Z2-9]{17}$/.test(schoolId) &&
    schoolId[19] === alphabet[createHash("sha256").update(schoolId.slice(3, 19)).digest()[0] % alphabet.length];
  if (!valid) { res.status(404).json({ verified: false, error: "A valid exact School ID is required. Names and approximate IDs cannot be used." }); return; }
  if (!question || question.length > 3000) { res.status(400).json({ error: "Provide a question between 1 and 3,000 characters." }); return; }
  const found = await pool.query(
    "SELECT s.user_id,u.name,u.grade,p.section_settings FROM learner_school_ids s JOIN users u ON u.id=s.user_id LEFT JOIN profile_privacy_settings p ON p.user_id=s.user_id WHERE s.school_id=$1 AND lower(u.role) IN ('student','learner') AND COALESCE(u.is_blocked,false)=false AND COALESCE(u.is_suspended,false)=false LIMIT 1",
    [schoolId],
  );
  if (!found.rows.length) { res.status(404).json({ verified: false, error: "School ID not found." }); return; }
  const learner = found.rows[0], settings = learner.section_settings || {};
  const isPublic = (key: string) => settings[key]?.mode === "everyone";
  const privateKey = /^(?:dob|dateofbirth|birthdate|phone|mobile|email|contact|address|guardian.*|parent.*|health.*|medical.*|admissionnumber|admissionno|emisno|nationalid|identitynumber|password|token|secret)$/i;
  const clean = (value: any): any => {
    if (Array.isArray(value)) return value.map(clean);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => !privateKey.test(key.replace(/[_-]/g, ""))).map(([key,item]) => [key,clean(item)]));
  };
  const portfolio: Record<string, unknown> = {};
  if (isPublic("overview")) portfolio.overview = { learnerName: learner.name, grade: learner.grade || null };
  if (isPublic("subjects")) portfolio.subjects = (await pool.query("SELECT subjects FROM learner_subjects WHERE user_id=$1", [learner.user_id])).rows[0]?.subjects || [];
  if (isPublic("achievements")) portfolio.achievements = (await pool.query("SELECT a.name,a.description,a.category,ua.earned_at FROM user_achievements ua JOIN achievements a ON a.id=ua.achievement_id WHERE ua.user_id=$1 ORDER BY ua.earned_at DESC LIMIT 100", [learner.user_id])).rows;
  if (isPublic("attendance")) portfolio.attendance = (await pool.query("SELECT status,joined_at,duration_minutes,is_late FROM attendance WHERE student_id=$1 ORDER BY joined_at DESC LIMIT 200", [learner.user_id])).rows;
  if (isPublic("register")) portfolio.attendanceRegister = (await pool.query("SELECT attendance_date,status,activity_label FROM daily_app_attendance WHERE user_id=$1 ORDER BY attendance_date DESC LIMIT 120", [learner.user_id])).rows;
  if (isPublic("reports")) {
    const reports = await pool.query("SELECT id,report_type,term_label,period_start,period_end,draft_content,reviewed_at FROM academic_report_drafts WHERE learner_id=$1 AND status='approved' ORDER BY reviewed_at DESC NULLS LAST LIMIT 50", [learner.user_id]);
    portfolio.reports = reports.rows.map((row:any) => {
      const content = row.draft_content && typeof row.draft_content === "object" ? row.draft_content : {};
      return { id: row.id, reportType: row.report_type, term: row.term_label, periodStart: row.period_start, periodEnd: row.period_end, reviewedAt: row.reviewed_at, learnerGrade: content.learnerGrade || null, academicYear: content.academicYear || null, factualRecords: clean(content.factualRecords || {}) };
    });
  }
  if (isPublic("enrollments")) portfolio.enrollments = (await pool.query("SELECT e.enrolled_at,e.progress_percent,e.status,c.title AS class_title,c.subject FROM enrollments e JOIN classes c ON c.id=e.class_id WHERE e.learner_id=$1 ORDER BY e.enrolled_at DESC LIMIT 100", [learner.user_id])).rows;
  if (isPublic("transfers")) portfolio.transfers = (await pool.query("SELECT status,reviewed_at,created_at,form_data FROM academic_transfer_requests WHERE learner_id=$1 AND status='approved' ORDER BY reviewed_at DESC NULLS LAST LIMIT 20", [learner.user_id])).rows.map((row:any) => { const form=row.form_data&&typeof row.form_data==="object"?row.form_data:{}; return {status:row.status,reviewedAt:row.reviewed_at,currentSchool:form.currentSchool||null,receivingSchool:form.receivingSchool||null,grade:form.grade||null,academicYear:form.academicYear||null,effectiveDate:form.effectiveDate||null}; });
  const serialized = JSON.stringify(portfolio);
  if (serialized.length > 30000) { res.status(413).json({ error: "The published academic portfolio is too large to analyze in one request." }); return; }
  try {
    const ai = await getAIProvider();
    const response = await ai.chat([{ role: "user", content: "Question: " + question + "\n\nVerified published academic portfolio (JSON):\n" + serialized }], "You are ELIDEMS AI's verified academic portfolio analyst. The School ID has been checked by Dallyletter Elidems. Analyze only the supplied published academic facts. Do not infer missing grades, attendance, qualifications or achievements. Do not request or reveal private contact, guardian, identity or health information. If the portfolio lacks a section or evidence, state that it was not published or is not available. Never identify a learner by a name alone; the exact School ID is the required lookup key. Give concise, constructive, evidence-based guidance.", new AbortController().signal);
    if (typeof response !== "string" || !response.trim()) throw new AIProviderError(ai.name, "invalid_response");
    await db.insert(aiActionsTable).values({ command: "Verified School ID portfolio analysis", action: "school_id_academic_analysis", performedBy: req.currentUser!.id, result: "Analysis generated for verified School ID" }).catch(() => undefined);
    res.setHeader("Cache-Control", "no-store");
    res.json({ verified: true, schoolId, response, provider: ai.name, portfolioSections: Object.keys(portfolio) });
  } catch (err) {
    const failure = err instanceof AIProviderError ? err : new AIProviderError("configuration", "provider_unavailable");
    res.status(failure.code === "timeout" ? 504 : failure.code === "rate_limited" ? 429 : 502).json({ verified: true, error: "Verified portfolio analysis is temporarily unavailable.", code: failure.code, retryable: failure.retryable });
  }
});

// POST /ai/analyze — AI data analysis
router.post("/ai/analyze", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const role = normalizeRole(user.role);
  if (!canUseStaffAI(user)) { res.status(403).json({ error: "Authorized staff access required" }); return; }
  if (["manager","senior_manager","junior_manager"].includes(role) && !(await managerHasPermission(user, "ai.agent.read_academic"))) {
    res.status(403).json({ error: "The Owner has not granted this manager AI analysis access.", permission: "ai.agent.read_academic" }); return;
  }
  const { data, prompt } = req.body as { data: object; prompt: string };
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 8000) {
    res.status(400).json({ error: "Provide a prompt between 1 and 8,000 characters." }); return;
  }
  let serializedData = "{}";
  try { serializedData = JSON.stringify(data ?? {}); } catch { res.status(400).json({ error: "Analysis data must be valid JSON." }); return; }
  if (serializedData.length > 25000) { res.status(413).json({ error: "Analysis data exceeds the 25,000-character limit." }); return; }
  try {
    const ai = await getAIProvider();
    const result = await ai.analyzeData(data ?? {}, prompt.trim());
    res.json({ result, provider: ai.name });
  } catch (err) {
    const failure = err instanceof AIProviderError ? err : new AIProviderError("configuration", "provider_unavailable");
    const statusCode = failure.code === "timeout" ? 504 : failure.code === "cancelled" ? 499 : failure.code === "rate_limited" ? 429 : 502;
    res.status(statusCode).json({
      error: "AI analysis could not be completed. Please retry or ask the Owner to review provider configuration.",
      code: failure.code,
      retryable: failure.retryable,
    });
  }
});

export default router;
