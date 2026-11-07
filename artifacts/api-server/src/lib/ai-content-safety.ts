import { db, contentFlagsTable } from "@workspace/db";
import { getAIProvider } from "./ai-provider";

type SafetyContentType = "lesson" | "assignment" | "exercise" | "poll" | "message" | "comment";

const validSeverities = new Set(["low", "medium", "high", "critical"]);

/**
 * Queue an AI content-safety review without blocking the user's normal workflow.
 * AI output creates a pending human-review flag only; it never removes content,
 * warns, suspends, blocks or otherwise punishes an account.
 */
export function queueAIContentSafety(contentType: SafetyContentType, contentId: number, text: string): void {
  const normalized = typeof text === "string" ? text.trim().slice(0, 4000) : "";
  if (!Number.isSafeInteger(contentId) || contentId <= 0 || normalized.length < 3) return;

  void (async () => {
    try {
      const ai = await getAIProvider();
      const result = await ai.moderateContent(normalized);
      if (result?.flagged !== true) return;
      await db.insert(contentFlagsTable).values({
        contentType,
        contentId,
        contentText: normalized.slice(0, 500),
        reason: String(result.reason || "ELIDEMS AI detected content for human review").slice(0, 500),
        severity: validSeverities.has(result.severity) ? result.severity : "medium",
        detectedBy: "ai:auto",
        status: "pending",
      });
    } catch {
      // Content creation must continue during provider or database outages.
      // Existing user reports and manual moderation remain available.
    }
  })();
}
