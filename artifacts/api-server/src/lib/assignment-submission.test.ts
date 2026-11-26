import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAssignmentAttachmentUrl, validateAssignmentSubmission } from "./assignment-submission.js";

const mediaUrl = "/api/lessons/media/123e4567-e89b-12d3-a456-426614174000?type=application%2Fpdf";

test("accepts text-only assignment submissions", () => {
  assert.deepEqual(validateAssignmentSubmission("  My answer  ", null, null), {
    ok: true, content: "My answer", fileUrl: null, fileName: null,
  });
});

test("accepts attachment-only submissions and preserves the authenticated media URL", () => {
  assert.deepEqual(validateAssignmentSubmission("", mediaUrl, "  essay.pdf  "), {
    ok: true, content: "", fileUrl: mediaUrl, fileName: "essay.pdf",
  });
});

test("accepts a valid external HTTP(S) attachment URL", () => {
  const result = validateAssignmentSubmission("See attached", "https://files.example.org/work.pdf", "work.pdf");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.fileUrl, "https://files.example.org/work.pdf");
});

test("rejects empty submissions and invalid URL schemes", () => {
  assert.equal(validateAssignmentSubmission("  ", null, null).ok, false);
  assert.equal(validateAssignmentSubmission("", "javascript:alert(1)", "x.txt").ok, false);
  assert.equal(normalizeAssignmentAttachmentUrl("file:///etc/passwd"), null);
});

test("rejects malformed internal media URLs and oversized text", () => {
  assert.equal(normalizeAssignmentAttachmentUrl("/api/lessons/media/not-a-uuid"), null);
  assert.equal(validateAssignmentSubmission("x".repeat(100001), null, null).ok, false);
});

test("normalizes and bounds the optional file name", () => {
  const result = validateAssignmentSubmission("", mediaUrl, "x".repeat(300));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.fileName?.length, 255);
  const missingName = validateAssignmentSubmission("", mediaUrl, 123);
  assert.equal(missingName.ok, true);
  if (missingName.ok) assert.equal(missingName.fileName, null);
});
