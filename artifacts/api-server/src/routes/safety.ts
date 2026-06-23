import { Router } from "express";
import { db, contentFlagsTable, auditLogsTable, usersTable, notificationsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";
import { getAIProvider } from "../lib/ai-provider";

const router = Router();

// GET /content-flags — list flags (owner/teacher only)
router.get("/content-flags", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role === "student") { res.status(403).json({ error: "Forbidden" }); return; }
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
  res.json(flags);
});

// POST /content-flags — create flag (internal use or manual)
router.post("/content-flags", requireAuth, async (req, res): Promise<void> => {
  const { contentType, contentId, contentText, reason, severity = "medium", detectedBy = "ai" } = req.body as {
    contentType: string; contentId: number; contentText?: string; reason: string; severity?: string; detectedBy?: string;
  };
  if (!contentType || !contentId || !reason) { res.status(400).json({ error: "contentType, contentId, reason required" }); return; }
  const [flag] = await db.insert(contentFlagsTable).values({ contentType, contentId, contentText, reason, severity, detectedBy, status: "pending" }).returning();
  res.status(201).json(flag);
});

// PATCH /content-flags/:id — review a flag
router.patch("/content-flags/:id", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role === "student") { res.status(403).json({ error: "Forbidden" }); return; }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { status, reviewNote } = req.body as { status: string; reviewNote?: string };
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
  if (user.role !== "owner") { res.status(403).json({ error: "Owner only" }); return; }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(contentFlagsTable).where(eq(contentFlagsTable.id, id));
  res.sendStatus(204);
});

// POST /content-flags/moderate — run AI moderation on text
router.post("/content-flags/moderate", requireAuth, async (req, res): Promise<void> => {
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
    const msg = err instanceof Error ? err.message : "Moderation failed";
    res.status(500).json({ error: msg });
  }
});

export default router;
