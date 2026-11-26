export type AssignmentSubmissionValidation =
  | { ok: true; content: string; fileUrl: string | null; fileName: string | null }
  | { ok: false; error: string };

export function normalizeAssignmentAttachmentUrl(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > 2048) return null;

  if (value.startsWith("/api/lessons/media/")) {
    try {
      const url = new URL(value, "https://internal.invalid");
      return /^\/api\/lessons\/media\/[a-f0-9-]{36}$/i.test(url.pathname) && !url.hash
        ? value
        : null;
    } catch {
      return null;
    }
  }

  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function validateAssignmentSubmission(
  rawContent: unknown,
  rawFileUrl: unknown,
  rawFileName: unknown,
): AssignmentSubmissionValidation {
  const content = typeof rawContent === "string" ? rawContent.trim() : "";
  const fileUrl = normalizeAssignmentAttachmentUrl(rawFileUrl);

  if (rawFileUrl != null && fileUrl == null) {
    return { ok: false, error: "fileUrl must be a valid internal media or http(s) URL" };
  }
  if (content.length > 100000 || (!content && !fileUrl)) {
    return { ok: false, error: "Provide text or an uploaded attachment; text must be at most 100000 characters" };
  }

  const fileName = typeof rawFileName === "string" ? rawFileName.trim().slice(0, 255) || null : null;
  return { ok: true, content, fileUrl, fileName };
}
