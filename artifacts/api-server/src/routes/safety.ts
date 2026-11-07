import { Router } from "express";
import { requireManagerPermissionIfManager } from "../lib/manager-permission-policy";
import { db, pool, contentFlagsTable, auditLogsTable, usersTable, notificationsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth, canAccessManager, isOwnerRole } from "../lib/auth-middleware";
import { getAIProvider, AIProviderError } from "../lib/ai-provider";

const router = Router();
const moderationRoles = new Set(["teacher", "owner"]);
async function getOwnerAccountIds(): Promise<Set<number>> {
  const owners = await pool.query("SELECT id FROM users WHERE lower(role) IN ('owner','platform_owner')");
  return new Set(owners.rows.map((row: any) => Number(row.id)));
}
async function isOwnerContentFlag(flag: { contentType: string; contentId: number }, ownerIds: Set<number>): Promise<boolean> {
  const type = String(flag.contentType || "").toLowerCase();
  if (["user","profile","account"].includes(type)) return ownerIds.has(Number(flag.contentId));
  const sources: Record<string, { table: string; column: string }> = {
    lesson: { table: "lessons", column: "teacher_id" },
    class: { table: "classes", column: "teacher_id" },
    assignment: { table: "assignments", column: "teacher_id" },
    exercise: { table: "exercises", column: "created_by" },
    activity: { table: "audit_logs", column: "performed_by" },
    message: { table: "messages", column: "sender_id" },
    comment: { table: "content_comments", column: "author_id" },
  };
  const source = sources[type];
  if (!source) return false;
  const result = await pool.query(`SELECT ${source.column} AS owner_id FROM ${source.table} WHERE id=$1`, [flag.contentId]);
  return ownerIds.has(Number(result.rows[0]?.owner_id));
}

function canReviewContent(user: { role: string; isManager: boolean }): boolean {
  return moderationRoles.has(user.role) || user.role === "teacher" || canAccessManager(user);
}

// GET /content-flags — list flags (owner/teacher only)
router.get("/content-flags", requireAuth, requireManagerPermissionIfManager("moderation.view"), async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!canReviewContent(user)) { res.status(403).json({ error: "Authorized staff access required" }); return; }
  const flags = await db.select({
    id: contentFlagsTable.id,
    contentType: contentFlagsTable.contentType,
    contentId: contentFlagsTable.contentId,
    contentText: contentFlagsTable.contentText,
    reason: contentFlagsTable.reason,
    severity: contentFlagsTable.severity,
    status: contentFlagsTable.status,
    detectedBy: contentFlagsTable.detectedBy,
    reviewNote: contentFlagsTable.reviewNote,
    createdAt: contentFlagsTable.createdAt,
    reviewerName: usersTable.name,
  }).from(contentFlagsTable)
    .leftJoin(usersTable, eq(contentFlagsTable.reviewedBy, usersTable.id))
    .orderBy(desc(contentFlagsTable.createdAt))
    .limit(200);
  const ownerIds = isOwnerRole(user.role) ? new Set<number>() : await getOwnerAccountIds();
  const visibleFlags = isOwnerRole(user.role) ? flags : (await Promise.all(flags.map(async (flag: any) => (await isOwnerContentFlag(flag, ownerIds)) ? null : flag))).filter(Boolean);
  res.json(visibleFlags);
});

// POST /content-flags — create flag (internal use or manual)
router.post("/content-flags", requireAuth, requireManagerPermissionIfManager("moderation.action"), async (req, res): Promise<void> => {
  if (!canReviewContent(req.currentUser!)) { res.status(403).json({ error: "Authorized staff access required" }); return; }
  const { contentType, contentId, contentText, reason, severity = "medium", detectedBy = "ai" } = req.body as {
    contentType: string; contentId: number; contentText?: string; reason: string; severity?: string; detectedBy?: string;
  };
  if (!contentType || !contentId || !reason) { res.status(400).json({ error: "contentType, contentId, reason required" }); return; }
  const [flag] = await db.insert(contentFlagsTable).values({ contentType, contentId, contentText, reason, severity, detectedBy, status: "pending" }).returning();
  res.status(201).json(flag);
});

// PATCH /content-flags/:id — review a flag
router.patch("/content-flags/:id", requireAuth, requireManagerPermissionIfManager("moderation.action"), async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!canReviewContent(user)) { res.status(403).json({ error: "Authorized staff access required" }); return; }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [existingFlag] = await db.select({ contentType: contentFlagsTable.contentType, contentId: contentFlagsTable.contentId }).from(contentFlagsTable).where(eq(contentFlagsTable.id, id));
  if (!existingFlag) { res.status(404).json({ error: "Not found" }); return; }
  if (!isOwnerRole(user.role) && await isOwnerContentFlag(existingFlag, await getOwnerAccountIds())) { res.status(404).json({ error: "Not found" }); return; }
  const { status, reviewNote } = req.body as { status: string; reviewNote?: string };
  if (!new Set(["pending", "reviewed", "dismissed", "actioned"]).has(status)) {
    res.status(400).json({ error: "Invalid moderation status" });
    return;
  }
  if (reviewNote != null && (typeof reviewNote !== "string" || reviewNote.length > 2000)) {
    res.status(400).json({ error: "Review note must be at most 2000 characters" });
    return;
  }
  const [updated] = await db.update(contentFlagsTable)
    .set({ status, reviewNote, reviewedBy: user.id })
    .where(eq(contentFlagsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  await db.insert(auditLogsTable).values({ action: `Reviewed content flag #${id} → ${status}`, category: "security", performedBy: user.id, targetType: "content_flag", targetId: id });
  res.json(updated);
});

// DELETE /content-flags/:id
router.delete("/content-flags/:id", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!isOwnerRole(user.role)) { res.status(403).json({ error: "Owner only" }); return; }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(contentFlagsTable).where(eq(contentFlagsTable.id, id));
  res.sendStatus(204);
});

// POST /content-flags/moderate — run AI moderation on text
router.post("/content-flags/moderate", requireAuth, requireManagerPermissionIfManager("moderation.action"), async (req, res): Promise<void> => {
  if (!canReviewContent(req.currentUser!)) { res.status(403).json({ error: "Authorized staff access required" }); return; }
  const { text, contentType, contentId } = req.body as { text: string; contentType?: string; contentId?: number };
  if (!text) { res.status(400).json({ error: "text required" }); return; }
  try {
    const ai = await getAIProvider();
    const result = await ai.moderateContent(text);
    if (result.flagged && contentType && contentId) {
      await db.insert(contentFlagsTable).values({
        contentType, contentId, contentText: text.slice(0, 500),
        reason: result.reason ?? "AI detected potential violation",
        severity: result.severity, detectedBy: "ai", status: "pending",
      });
    }
    res.json(result);
  } catch (err) {
    const failure = err instanceof AIProviderError ? err : new AIProviderError("moderation", "provider_unavailable");
    const status = failure.code === "timeout" ? 504 : failure.code === "cancelled" ? 499 : failure.code === "rate_limited" ? 429 : failure.code === "configuration_unavailable" ? 503 : 502;
    res.status(status).json({ error: "AI moderation could not be completed. The content has not been actioned; please retry or use the existing report workflow.", code: failure.code, retryable: failure.retryable });
  }
});

export default router;
