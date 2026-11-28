import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pool } from "@workspace/db";
import {
  cleanupExpiredMediaUploads,
  cleanupOrphanedMediaStagingFiles,
  consumeMediaUploadTicket,
  ensureMediaUploadTicketSchema,
  issueMediaUploadTicket,
  markMediaUploadVerified,
  persistTicketedMediaUpload,
} from "../src/lib/media-upload-tickets";
import { ensureMediaDirectory, getMediaDirectory, removeStoredMedia } from "../src/lib/media-storage";
import { authorizeTicketedMediaDelivery } from "../src/lib/media-delivery-access";

const suffix = randomUUID();
let userA = 0;
let userB = 0;
const storageKeys: string[] = [];

after(async () => {
  for (const key of storageKeys) await removeStoredMedia(key).catch(() => undefined);
  if (userA) await pool.query("DELETE FROM users WHERE id = $1", [userA]);
  if (userB) await pool.query("DELETE FROM users WHERE id = $1", [userB]);
  await pool.end();
});

test("route-bound tickets reject cross-account, route, target and MIME replay", async () => {
  await ensureMediaUploadTicketSchema();
  const a = await pool.query(
    "INSERT INTO users(email,password_hash,name,role) VALUES($1,'test-only-hash','Media Test A','student') RETURNING id",
    [`media-a-${suffix}@example.test`],
  );
  const b = await pool.query(
    "INSERT INTO users(email,password_hash,name,role) VALUES($1,'test-only-hash','Media Test B','student') RETURNING id",
    [`media-b-${suffix}@example.test`],
  );
  userA = Number(a.rows[0].id);
  userB = Number(b.rows[0].id);

  const ticket = await issueMediaUploadTicket({
    userId: userA, routeKey: "test.route", targetType: "assignment-submission",
    targetId: "assignment-123", mimeType: "application/pdf", maxBytes: 1024,
  });
  storageKeys.push(ticket.storageKey);
  const sha256 = "a".repeat(64);
  const common = {
    ticket: ticket.ticket, userId: userA, routeKey: "test.route",
    targetType: "assignment-submission", targetId: "assignment-123",
    mimeType: "application/pdf", size: 100, sha256,
  };

  await assert.rejects(markMediaUploadVerified({ ...common, userId: userB }));
  await assert.rejects(markMediaUploadVerified({ ...common, routeKey: "other.route" }));
  await assert.rejects(markMediaUploadVerified({ ...common, targetId: "assignment-999" }));
  await assert.rejects(markMediaUploadVerified({ ...common, mimeType: "image/png" }));

  const verified = await markMediaUploadVerified(common);
  assert.equal(verified.storageKey, ticket.storageKey);
  await assert.rejects(consumeMediaUploadTicket({
    ticket: ticket.ticket, userId: userB, routeKey: "test.route",
    targetType: "assignment-submission", targetId: "assignment-123", mimeType: "application/pdf",
  }));
  const consumed = await consumeMediaUploadTicket({
    ticket: ticket.ticket, userId: userA, routeKey: "test.route",
    targetType: "assignment-submission", targetId: "assignment-123", mimeType: "application/pdf",
  });
  assert.equal(consumed.ticketId, ticket.ticketId);
  await assert.rejects(consumeMediaUploadTicket({
    ticket: ticket.ticket, userId: userA, routeKey: "test.route",
    targetType: "assignment-submission", targetId: "assignment-123", mimeType: "application/pdf",
  }));
});

test("uploaded PDF is MIME-sniffed, persisted, read back and SHA-256 verified", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "dallyletter-media-lifecycle-"));
  const localPath = path.join(dir, "sample.pdf");
  const bytes = Buffer.from("%PDF-1.7\nDallyletter media lifecycle integration test\n%%EOF\n");
  await writeFile(localPath, bytes);
  const storageKey = randomUUID();
  storageKeys.push(storageKey);
  try {
    const result = await persistTicketedMediaUpload({
      localPath, storageKey, mimeType: "application/pdf",
      binding: {
        userId: userA, routeKey: "test.teacher-material", targetType: "teacher-material",
        targetId: "teacher-42", maxBytes: 1024 * 1024,
      },
    });
    assert.equal(result.storageKey, storageKey);
    assert.equal(result.size, bytes.length);
    assert.equal(result.sha256, (await import("node:crypto")).createHash("sha256").update(bytes).digest("hex"));
    assert.equal(result.backend, "database");
    const row = await pool.query("SELECT status, uploaded_size, uploaded_sha256 FROM media_upload_tickets WHERE storage_key=$1", [storageKey]);
    assert.equal(row.rows[0]?.status, "consumed");
    assert.equal(Number(row.rows[0]?.uploaded_size), bytes.length);
    assert.equal(row.rows[0]?.uploaded_sha256, result.sha256);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("ticketed private media is isolated by account while published lesson media follows its resource access", async () => {
  const privateTicket = await issueMediaUploadTicket({
    userId: userA, routeKey: "assignments.submission-material", targetType: "learner-submission-draft",
    targetId: String(userA), mimeType: "application/pdf", maxBytes: 1024,
  });
  storageKeys.push(privateTicket.storageKey);
  const privateHash = "b".repeat(64);
  await markMediaUploadVerified({
    ticket: privateTicket.ticket, userId: userA, routeKey: "assignments.submission-material",
    targetType: "learner-submission-draft", targetId: String(userA), mimeType: "application/pdf",
    size: 100, sha256: privateHash,
  });
  await consumeMediaUploadTicket({
    ticket: privateTicket.ticket, userId: userA, routeKey: "assignments.submission-material",
    targetType: "learner-submission-draft", targetId: String(userA), mimeType: "application/pdf",
  });
  const [actorA, actorB] = await Promise.all([
    pool.query("SELECT * FROM users WHERE id=$1", [userA]),
    pool.query("SELECT * FROM users WHERE id=$1", [userB]),
  ]);
  assert.equal(await authorizeTicketedMediaDelivery(privateTicket.storageKey, actorA.rows[0]), true);
  assert.equal(await authorizeTicketedMediaDelivery(privateTicket.storageKey, actorB.rows[0]), false);

  await pool.query("UPDATE users SET role='teacher' WHERE id=$1", [userA]);
  const sharedTicket = await issueMediaUploadTicket({
    userId: userA, routeKey: "lessons.media", targetType: "lesson-media-library",
    targetId: String(userA), mimeType: "application/pdf", maxBytes: 1024,
  });
  storageKeys.push(sharedTicket.storageKey);
  const sharedHash = "c".repeat(64);
  await markMediaUploadVerified({
    ticket: sharedTicket.ticket, userId: userA, routeKey: "lessons.media",
    targetType: "lesson-media-library", targetId: String(userA), mimeType: "application/pdf",
    size: 100, sha256: sharedHash,
  });
  await consumeMediaUploadTicket({
    ticket: sharedTicket.ticket, userId: userA, routeKey: "lessons.media",
    targetType: "lesson-media-library", targetId: String(userA), mimeType: "application/pdf",
  });
  const lesson = await pool.query(
    "INSERT INTO lessons(title,subject,type,media_url,teacher_id,teacher_name) VALUES('Media access test','Mathematics','document',$1,$2,'Media Test') RETURNING id",
    [`/api/lessons/media/${sharedTicket.storageKey}?type=application/pdf`, userA],
  );
  try {
    assert.equal(await authorizeTicketedMediaDelivery(sharedTicket.storageKey, actorB.rows[0]), true);
  } finally {
    await pool.query("DELETE FROM lessons WHERE id=$1", [lesson.rows[0].id]);
  }
});

test("public media share links cannot be issued for private ticketed upload types", async () => {
  const source = await readFile("src/routes/lessons.ts", "utf8");
  assert.match(source, /SELECT user_id, route_key, target_type FROM media_upload_tickets/);
  assert.match(source, /ticket\.route_key !== "lessons\.media" \|\| ticket\.target_type !== "lesson-media-library"/);
  assert.match(source, /This media type cannot be shared publicly/);
});

test("MIME spoofing is rejected before a ticket is created", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "dallyletter-media-spoof-"));
  const localPath = path.join(dir, "spoof.png");
  await writeFile(localPath, Buffer.from("%PDF-1.7\nnot a PNG"));
  try {
    await assert.rejects(persistTicketedMediaUpload({
      localPath, storageKey: randomUUID(), mimeType: "image/png",
      binding: {
        userId: userA, routeKey: "test.mime", targetType: "test-object",
        targetId: "mime-spoof", maxBytes: 1024,
      },
    }), /signature does not match/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("expired unconsumed tickets are swept and their orphan objects removed", async () => {
  const orphan = await issueMediaUploadTicket({
    userId: userB, routeKey: "test.orphan", targetType: "draft",
    targetId: "orphan-target", mimeType: "application/pdf", maxBytes: 1024,
  });
  storageKeys.push(orphan.storageKey);
  await pool.query("UPDATE media_upload_tickets SET expires_at=now()-interval '1 minute' WHERE id=$1", [orphan.ticketId]);
  const result = await cleanupExpiredMediaUploads(50);
  assert.ok(result.scanned >= 1);
  const remaining = await pool.query("SELECT id FROM media_upload_tickets WHERE id=$1", [orphan.ticketId]);
  assert.equal(remaining.rows.length, 0);
});

test("the shared lesson-media endpoint invokes resource-aware ticket authorization", async () => {
  const routeSource = await readFile("src/routes/lessons.ts", "utf8");
  const policySource = await readFile("src/lib/media-delivery-access.ts", "utf8");
  assert.ok(routeSource.includes("authorizeTicketedMediaDelivery(storageKey, actor)"));
  for (const routeKey of [
    "lessons.media",
    "assignments.material",
    "assignments.submission-material",
    "exercises.question-media",
    "exercises.answer-media",
    "handRaises.raise-hand.with-media",
    "users.me.avatar",
    "users.me.cover",
  ]) {
    assert.ok(policySource.includes(`case "${routeKey}"`), `Missing delivery policy for ${routeKey}`);
  }
});

test("stale UUID staging files without an active ticket are removed", async () => {
  await ensureMediaDirectory();
  const key = randomUUID();
  const filePath = path.join(getMediaDirectory(), key);
  await writeFile(filePath, Buffer.from("abandoned upload staging bytes"));
  const result = await cleanupOrphanedMediaStagingFiles(0, 50);
  assert.ok(result.scanned >= 1);
  assert.ok(result.deleted >= 1);
  await assert.rejects(readFile(filePath));
});

test("every file-backed media route uses ticket persistence behind its existing authorization guard", async () => {
  const routes = [
    { file: "src/routes/lessons.ts", route: "router.post(\"/lessons/media\", requireAuth", guard: "authorizeLessonMediaUpload" },
    { file: "src/routes/assignments.ts", route: 'router.post("/material", requireAuth', guard: "Teacher or platform Owner access required" },
    { file: "src/routes/assignments.ts", route: 'router.post("/submission-material", requireAuth', guard: 'req.currentUser?.role !== "student"' },
    { file: "src/routes/exercises.ts", route: 'router.post("/answer-media", requireAuth', guard: "requireAuth" },
    { file: "src/routes/exercises.ts", route: 'router.post("/question-media", requireAuth', guard: 'requireManagerPermissionIfManager("users.override.teacher")' },
    { file: "src/routes/handRaises.ts", route: 'router.post("/raise-hand/with-media", requireAuth', guard: "public.enrollments" },
    { file: "src/routes/messages.ts", route: 'router.post("/messages/media", requireAuth', guard: "canAccessGroup" },
    { file: "src/routes/users.ts", route: 'router.post("/users/me/avatar", requireAuth', guard: "requireAuth" },
    { file: "src/routes/users.ts", route: 'router.post("/users/me/teacher-documents", requireAuth', guard: 'String(req.currentUser!.role).toLowerCase() !== "teacher"' },
    { file: "src/routes/users.ts", route: 'router.post("/qualifications/:id/document", requireAuth', guard: "teacher-qualification" },
    { file: "src/routes/users.ts", route: 'router.post("/users/me/cover", requireAuth', guard: "requireAuth" },
  ];
  const contents = new Map<string, string>();
  for (const route of routes) {
    if (!contents.has(route.file)) contents.set(route.file, await readFile(route.file, "utf8"));
    const source = contents.get(route.file)!;
    assert.ok(source.includes(route.route), `Missing protected route ${route.route}`);
    assert.ok(source.includes(route.guard), `Missing route authorization contract ${route.guard}`);
    assert.ok(source.includes("persistTicketedMediaUpload"), `Route file ${route.file} bypasses ticketed persistence`);
  }
});
