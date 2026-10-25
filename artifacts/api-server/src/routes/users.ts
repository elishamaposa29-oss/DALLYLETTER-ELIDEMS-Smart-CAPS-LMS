import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import multer from "multer";
import { db, usersTable, pool } from "@workspace/db";
import {
  GetUserParams, UpdateUserParams, UpdateUserBody,
  DeleteUserParams, BlockUserParams, BlockUserBody,
  PromoteUserParams, PromoteUserBody,
} from "@workspace/api-zod";
import { requireAuth, requireOwner, canAccessManager, isOwnerRole } from "../lib/auth-middleware";
import { createMediaStorageKey, ensureMediaDirectory, getMediaDirectory, persistUploadedMedia, removeStoredMedia } from "../lib/media-storage";
import { canReadPrivateUserProfile } from "../lib/profile-access-policy";
import { revokeUserSessions, consumeAuthAttempt } from "../lib/auth-session-store";
import { hashPassword } from "../lib/password-hash";
import { sendEmail, isEmailConfigured } from "../lib/email-service";

const router: IRouter = Router();

const safeUserFields = {
  id: usersTable.id,
  email: usersTable.email,
  name: usersTable.name,
  role: usersTable.role,
  isPrefect: usersTable.isPrefect,
  isManager: usersTable.isManager,
  managerLevel: usersTable.managerLevel,
  isBlocked: usersTable.isBlocked,
  isSuspended: usersTable.isSuspended,
  phone: usersTable.phone,
  grade: usersTable.grade,
  subject: usersTable.subject,
  avatarUrl: usersTable.avatarUrl,
  bio: usersTable.bio,
  teacherApplicationStatus: usersTable.teacherApplicationStatus,
  teacherReviewDeadline: usersTable.teacherReviewDeadline,
  lastPaymentDate: usersTable.lastPaymentDate,
  performanceScore: usersTable.performanceScore,
  badgeCount: usersTable.badgeCount,
  streakDays: usersTable.streakDays,
  lastActiveDate: usersTable.lastActiveDate,
  createdAt: usersTable.createdAt,
};

const directoryUserFields = {
  id: usersTable.id,
  name: usersTable.name,
  role: usersTable.role,
  isPrefect: usersTable.isPrefect,
  isManager: usersTable.isManager,
  grade: usersTable.grade,
  subject: usersTable.subject,
  avatarUrl: usersTable.avatarUrl,
  bio: usersTable.bio,
  performanceScore: usersTable.performanceScore,
  badgeCount: usersTable.badgeCount,
  streakDays: usersTable.streakDays,
  lastActiveDate: usersTable.lastActiveDate,
  createdAt: usersTable.createdAt,
};

router.get("/users", requireAuth, async (req, res): Promise<void> => {
  const fields = isOwnerRole(req.currentUser!.role) ? safeUserFields : directoryUserFields;
  const users = await db.select(fields).from(usersTable).orderBy(usersTable.createdAt);
  res.json(users.map(u => ({ ...u, createdAt: u.createdAt.toISOString() })));
});

router.get("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const actor = req.currentUser!;
  if (!canReadPrivateUserProfile(actor.id, params.data.id, canAccessManager(actor))) { res.status(403).json({ error: "You cannot access this private profile." }); return; }
  const [user] = await db.select(safeUserFields).from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ ...user, createdAt: user.createdAt.toISOString() });
});

router.patch("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpdateUserBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const currentUser = req.currentUser!;
  if (!isOwnerRole(currentUser.role) && currentUser.id !== params.data.id) {
    res.status(403).json({ error: "Cannot update another user's profile" }); return;
  }
  const updates: Record<string, unknown> = {};
  if (body.data.email != null && !isOwnerRole(currentUser.role)) { res.status(403).json({ error: "Email changes require a verified email-change process." }); return; }
  if (body.data.name != null) updates.name = body.data.name;
  if (body.data.email != null) updates.email = body.data.email;
  if (body.data.phone !== undefined) updates.phone = body.data.phone;
  if (body.data.grade !== undefined) updates.grade = body.data.grade;
  if (body.data.subject !== undefined) updates.subject = body.data.subject;
  if (body.data.avatarUrl != null) {
    const avatarUrl = body.data.avatarUrl.trim();
    const isMediaPath = avatarUrl.length <= 2048 && /^\/api\/lessons\/media\/[a-f0-9-]{36}\?type=image\/(?:jpeg|png|webp)$/i.test(avatarUrl);
    const isHttpsImage = avatarUrl.length <= 2048 && /^https:\/\//i.test(avatarUrl);
    if (!isMediaPath && !isHttpsImage) { res.status(400).json({ error: "Profile images must be uploaded through the secure avatar endpoint or use an HTTPS image URL." }); return; }
    updates.avatarUrl = avatarUrl;
  }
  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, params.data.id)).returning(safeUserFields);
  if (body.data.email != null) await revokeUserSessions(params.data.id);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ ...user, createdAt: user.createdAt.toISOString() });
});

// Recovery contacts are private. Only verified alternate email may receive recovery links.
async function ensureRecoveryProfileSchema(): Promise<void> {
  await pool.query("CREATE TABLE IF NOT EXISTS account_recovery_profiles (user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, recovery_email text, recovery_email_verified_at timestamptz, recovery_phone text, recovery_phone_verified_at timestamptz, security_question text, security_answer_hash text, verification_code_hash text, verification_expires_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now())");
}

function canManageOwnRecoveryProfile(role: unknown): boolean {
  return !isOwnerRole(role);
}

router.get("/users/me/recovery-profile", requireAuth, async (req, res): Promise<void> => {
  if (!canManageOwnRecoveryProfile(req.currentUser!.role)) { res.status(403).json({ error: "Owner/admin recovery profile is managed through protected bootstrap." }); return; }
  await ensureRecoveryProfileSchema();
  const result = await pool.query("SELECT recovery_email, recovery_email_verified_at, recovery_phone, recovery_phone_verified_at, security_question, updated_at FROM account_recovery_profiles WHERE user_id = $1", [req.currentUser!.id]);
  res.json(result.rows[0] ?? { recovery_email: null, recovery_email_verified_at: null, recovery_phone: null, recovery_phone_verified_at: null, security_question: null });
});

router.patch("/users/me/recovery-profile", requireAuth, async (req, res): Promise<void> => {
  const actor = req.currentUser!;
  if (!canManageOwnRecoveryProfile(actor.role)) { res.status(403).json({ error: "Owner/admin recovery profile is managed through protected bootstrap." }); return; }
  const recoveryEmail = typeof req.body?.recoveryEmail === "string" ? req.body.recoveryEmail.trim().toLowerCase() : null;
  const recoveryPhone = typeof req.body?.recoveryPhone === "string" ? req.body.recoveryPhone.trim() : null;
  const securityQuestion = typeof req.body?.securityQuestion === "string" ? req.body.securityQuestion.trim() : null;
  const securityAnswer = typeof req.body?.securityAnswer === "string" ? req.body.securityAnswer.trim() : null;
  if (recoveryEmail !== null && recoveryEmail && (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(recoveryEmail) || recoveryEmail.length > 254)) { res.status(400).json({ error: "Enter a valid alternate email address." }); return; }
  if (recoveryPhone !== null && recoveryPhone.length > 40) { res.status(400).json({ error: "Phone number is too long." }); return; }
  if (securityQuestion !== null && securityQuestion.length > 200) { res.status(400).json({ error: "Security question is too long." }); return; }
  if (securityAnswer !== null && securityAnswer.length > 200) { res.status(400).json({ error: "Security answer is too long." }); return; }
  if (!securityQuestion && securityAnswer) { res.status(400).json({ error: "Choose a security question before saving its answer." }); return; }
  await ensureRecoveryProfileSchema();
  const prior = await pool.query("SELECT recovery_email, recovery_email_verified_at, security_question FROM account_recovery_profiles WHERE user_id = $1", [actor.id]);
  const previous = prior.rows[0];
  const nextEmail = recoveryEmail === null ? previous?.recovery_email ?? null : recoveryEmail || null;
  const emailChanged = nextEmail !== (previous?.recovery_email ?? null);
  if (securityQuestion && !securityAnswer && securityQuestion !== (previous?.security_question ?? null)) { res.status(400).json({ error: "Enter an answer when changing your security question." }); return; }
  const answerHash = securityAnswer ? await hashPassword(securityAnswer.toLowerCase()) : null;
  await pool.query(
    "INSERT INTO account_recovery_profiles (user_id, recovery_email, recovery_email_verified_at, recovery_phone, recovery_phone_verified_at, security_question, security_answer_hash, verification_code_hash, verification_expires_at, updated_at) VALUES ($1,$2,$3,$4,NULL,$5,$6,NULL,NULL,now()) ON CONFLICT (user_id) DO UPDATE SET recovery_email = EXCLUDED.recovery_email, recovery_email_verified_at = CASE WHEN $7 THEN NULL ELSE account_recovery_profiles.recovery_email_verified_at END, recovery_phone = EXCLUDED.recovery_phone, recovery_phone_verified_at = CASE WHEN $8 THEN NULL ELSE account_recovery_profiles.recovery_phone_verified_at END, security_question = EXCLUDED.security_question, security_answer_hash = CASE WHEN $9 THEN NULL WHEN EXCLUDED.security_answer_hash IS NOT NULL THEN EXCLUDED.security_answer_hash ELSE account_recovery_profiles.security_answer_hash END, verification_code_hash = CASE WHEN $7 THEN NULL ELSE account_recovery_profiles.verification_code_hash END, verification_expires_at = CASE WHEN $7 THEN NULL ELSE account_recovery_profiles.verification_expires_at END, updated_at = now()",
    [actor.id, nextEmail, emailChanged ? null : previous?.recovery_email_verified_at ?? null, recoveryPhone === null ? null : recoveryPhone || null, securityQuestion || null, answerHash, emailChanged, recoveryPhone !== null, !securityQuestion],
  );
  res.json({ message: "Recovery profile saved. Alternate email must be verified before it can be used for password recovery; phone verification requires an enabled SMS provider.", recoveryEmail: nextEmail, recoveryEmailVerified: !emailChanged && Boolean(previous?.recovery_email_verified_at), recoveryPhone: recoveryPhone, phoneVerified: false, securityQuestion: securityQuestion || null });
});

router.post("/users/me/recovery-email/request-verification", requireAuth, async (req, res): Promise<void> => {
  const actor = req.currentUser!;
  if (!canManageOwnRecoveryProfile(actor.role)) { res.status(403).json({ error: "Not available for owner/admin accounts." }); return; }
  if (!isEmailConfigured()) { res.status(503).json({ error: "Email verification is temporarily unavailable." }); return; }
  const ip = req.ip || "unknown";
  if (await consumeAuthAttempt("recovery-email-verify", String(actor.id), ip, 5, 60 * 60 * 1000, 60 * 60 * 1000)) { res.status(429).json({ error: "Too many verification attempts. Try later." }); return; }
  await ensureRecoveryProfileSchema();
  const found = await pool.query("SELECT recovery_email FROM account_recovery_profiles WHERE user_id = $1", [actor.id]);
  const email = found.rows[0]?.recovery_email as string | undefined;
  if (!email) { res.status(400).json({ error: "Add an alternate email address first." }); return; }
  const code = String(crypto.randomInt(100000, 1000000));
  const digest = crypto.createHash("sha256").update(code).digest("hex");
  await pool.query("UPDATE account_recovery_profiles SET verification_code_hash = $2, verification_expires_at = now() + interval '10 minutes', updated_at = now() WHERE user_id = $1", [actor.id, digest]);
  await sendEmail({ to: [email], subject: "Verify your Dallyletter Elidems recovery email", text: "Your recovery email verification code is " + code + ". It expires in 10 minutes. If you did not request this, ignore this message." });
  res.json({ message: "Verification code sent to your alternate email. It expires in 10 minutes." });
});

router.post("/users/me/recovery-email/confirm", requireAuth, async (req, res): Promise<void> => {
  const actor = req.currentUser!;
  if (!canManageOwnRecoveryProfile(actor.role)) { res.status(403).json({ error: "Not available for owner/admin accounts." }); return; }
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
  if (!/^\\d{6}$/.test(code)) { res.status(400).json({ error: "Enter the six-digit verification code." }); return; }
  const ip = req.ip || "unknown";
  if (await consumeAuthAttempt("recovery-email-confirm", String(actor.id), ip, 8, 15 * 60 * 1000, 15 * 60 * 1000)) { res.status(429).json({ error: "Too many verification attempts. Try later." }); return; }
  await ensureRecoveryProfileSchema();
  const digest = crypto.createHash("sha256").update(code).digest("hex");
  const result = await pool.query("UPDATE account_recovery_profiles SET recovery_email_verified_at = now(), verification_code_hash = NULL, verification_expires_at = NULL, updated_at = now() WHERE user_id = $1 AND verification_code_hash = $2 AND verification_expires_at > now() RETURNING recovery_email", [actor.id, digest]);
  if (!result.rows.length) { res.status(400).json({ error: "Verification code is invalid or expired." }); return; }
  res.json({ message: "Alternate recovery email verified.", recoveryEmail: result.rows[0].recovery_email, recoveryEmailVerified: true });
});

router.delete("/users/:id", requireAuth, requireOwner, async (req, res): Promise<void> => {
  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(usersTable).where(eq(usersTable.id, params.data.id));
  res.sendStatus(204);
});

router.patch("/users/:id/block", requireAuth, requireOwner, async (req, res): Promise<void> => {
  const params = BlockUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = BlockUserBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [user] = await db.update(usersTable).set({ isBlocked: body.data.isBlocked }).where(eq(usersTable.id, params.data.id)).returning(safeUserFields);
  if (body.data.isBlocked) await revokeUserSessions(params.data.id);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ ...user, createdAt: user.createdAt.toISOString() });
});

router.patch("/users/:id/suspend", requireAuth, requireOwner, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { isSuspended } = req.body as { isSuspended: boolean };
  if (typeof isSuspended !== "boolean") { res.status(400).json({ error: "isSuspended must be boolean" }); return; }
  const [user] = await db.update(usersTable).set({ isSuspended }).where(eq(usersTable.id, id)).returning(safeUserFields);
  if (isSuspended) await revokeUserSessions(id);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ ...user, createdAt: user.createdAt.toISOString() });
});

router.patch("/users/:id/promote", requireAuth, requireOwner, async (req, res): Promise<void> => {
  const params = PromoteUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = PromoteUserBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const updates: Record<string, unknown> = {};
  if (body.data.role != null) updates.role = body.data.role;
  if (body.data.isPrefect != null) updates.isPrefect = body.data.isPrefect;
  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, params.data.id)).returning(safeUserFields);
  if (body.data.role != null) await revokeUserSessions(params.data.id);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ ...user, createdAt: user.createdAt.toISOString() });
});

router.patch("/users/:id/promote-manager", requireAuth, requireOwner, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { isManager, managerLevel } = req.body as { isManager?: boolean; managerLevel?: string };
  if (typeof isManager !== "boolean" && managerLevel == null) { res.status(400).json({ error: "Provide isManager or managerLevel" }); return; }
  const updates: Record<string, unknown> = {};
  if (typeof isManager === "boolean") updates.isManager = isManager;
  if (managerLevel != null) { if (!["junior","senior"].includes(managerLevel)) { res.status(400).json({ error: "managerLevel must be junior or senior" }); return; } updates.managerLevel = managerLevel; }
  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning(safeUserFields);
  await revokeUserSessions(id);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ ...user, createdAt: user.createdAt.toISOString() });
});

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      void ensureMediaDirectory().then(() => callback(null, getMediaDirectory())).catch(error => callback(error as Error, ""));
    },
    filename: (_req, _file, callback) => callback(null, createMediaStorageKey()),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => callback(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)),
});

router.post("/users/me/avatar", requireAuth, (req, res, next): void => {
  avatarUpload.single("file")(req, res, error => {
    void (async () => {
      if (error instanceof multer.MulterError) { res.status(400).json({ error: "Choose a JPG, PNG, or WebP image up to 8 MB" }); return; }
      if (error) { next(error); return; }
      const file = req.file;
      if (!file) { res.status(415).json({ error: "Choose a JPG, PNG, or WebP image" }); return; }
      const actor = req.currentUser!;
      try {
        const [before] = await db.select({ avatarUrl: usersTable.avatarUrl }).from(usersTable).where(eq(usersTable.id, actor.id));
        await persistUploadedMedia(file.filename, file.mimetype, file.path);
        const avatarUrl = "/api/lessons/media/" + file.filename + "?type=" + file.mimetype;
        const [user] = await db.update(usersTable).set({ avatarUrl }).where(eq(usersTable.id, actor.id)).returning(safeUserFields);
        if (!user) { await removeStoredMedia(file.filename); res.status(404).json({ error: "User not found" }); return; }
        const oldKey = typeof before?.avatarUrl === "string" ? before.avatarUrl.match(/^\/api\/lessons\/media\/([a-f0-9-]{36})\?type=image\/(?:jpeg|png|webp)$/i)?.[1] : null;
        if (oldKey && oldKey !== file.filename) await removeStoredMedia(oldKey).catch(() => undefined);
        res.status(200).json({ ...user, createdAt: user.createdAt.toISOString() });
      } catch {
        await removeStoredMedia(file.filename).catch(() => undefined);
        if (!res.headersSent) res.status(503).json({ error: "Persistent profile image storage is unavailable. Please retry." });
      }
    })().catch(() => { if (!res.headersSent) res.status(500).json({ error: "Profile image upload failed" }); });
  });
});

// Structured CV fields for teacher applications. Only the teacher can edit their own CV.
router.get("/users/me/teacher-cv", requireAuth, async (req, res): Promise<void> => {
  if (req.currentUser!.role !== "teacher") { res.status(403).json({ error: "Teacher account required" }); return; }
  await pool.query("CREATE TABLE IF NOT EXISTS teacher_profiles (user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, cv jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now())");
  const result = await pool.query("SELECT cv, updated_at FROM teacher_profiles WHERE user_id = $1", [req.currentUser!.id]);
  res.json(result.rows[0] ?? { cv: {}, updated_at: null });
});

router.patch("/users/me/teacher-cv", requireAuth, async (req, res): Promise<void> => {
  const actor = req.currentUser!;
  if (actor.role !== "teacher") { res.status(403).json({ error: "Teacher account required" }); return; }
  const body = req.body?.cv;
  if (!body || typeof body !== "object" || Array.isArray(body)) { res.status(400).json({ error: "Provide a CV object." }); return; }
  const allowed = ["professionalSummary", "education", "experience", "subjects", "address", "certifications", "languages", "references"];
  const cv: Record<string, string> = {};
  for (const key of allowed) {
    const value = body[key];
    if (value !== undefined) {
      if (typeof value !== "string" || value.length > 8000) { res.status(400).json({ error: "CV fields must be text up to 8000 characters." }); return; }
      cv[key] = value.trim();
    }
  }
  await pool.query("CREATE TABLE IF NOT EXISTS teacher_profiles (user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, cv jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now())");
  const result = await pool.query("INSERT INTO teacher_profiles (user_id, cv) VALUES ($1, $2::jsonb) ON CONFLICT (user_id) DO UPDATE SET cv = teacher_profiles.cv || EXCLUDED.cv, updated_at = now() RETURNING cv, updated_at", [actor.id, JSON.stringify(cv)]);
  res.json(result.rows[0]);
});

const teacherDocumentUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post("/users/me/teacher-documents", requireAuth, (req, res): void => {
  teacherDocumentUpload.single("file")(req, res, (error) => {
    void (async () => {
      if (error || !req.file) { res.status(400).json({ error: "Upload a PDF, image or document up to 10 MB" }); return; }
      if (req.currentUser!.role !== "teacher") { res.status(403).json({ error: "Teacher account required" }); return; }
      const documentType = typeof req.body?.documentType === "string" ? req.body.documentType.trim() : "";
      if (!["resume", "certificate", "proof"].includes(documentType)) { res.status(400).json({ error: "Choose resume, certificate or proof" }); return; }
      const allowed = ["application/pdf","image/jpeg","image/png","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
      if (!allowed.includes(req.file.mimetype)) { res.status(415).json({ error: "Unsupported document type" }); return; }
      const result = await pool.query(
        "INSERT INTO teacher_documents (user_id, document_type, file_name, mime_type, size_bytes, data) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, document_type, file_name, mime_type, size_bytes, created_at",
        [req.currentUser!.id, documentType, req.file.originalname, req.file.mimetype, req.file.size, req.file.buffer],
      );
      res.status(201).json(result.rows[0]);
    })().catch(() => res.status(500).json({ error: "Qualification document upload failed" }));
  });
});

router.get("/users/:id/teacher-documents", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id); const actor = req.currentUser!;
  if (!Number.isInteger(id) || (!canAccessManager(actor) && actor.id !== id)) { res.status(403).json({ error: "Access denied" }); return; }
  const result = await pool.query("SELECT id, document_type, file_name, mime_type, size_bytes, created_at FROM teacher_documents WHERE user_id = $1 ORDER BY created_at DESC", [id]);
  res.json(result.rows);
});

router.get("/users/:id/teacher-documents/:docId", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id); const docId = Number(req.params.docId); const actor = req.currentUser!;
  if (!Number.isInteger(id) || !Number.isInteger(docId) || (!canAccessManager(actor) && actor.id !== id)) { res.status(403).json({ error: "Access denied" }); return; }
  const result = await pool.query("SELECT file_name, mime_type, size_bytes, data FROM teacher_documents WHERE id = $1 AND user_id = $2 LIMIT 1", [docId, id]);
  if (!result.rows[0]) { res.status(404).json({ error: "Document not found" }); return; }
  const row = result.rows[0] as { file_name:string; mime_type:string; size_bytes:number; data:Buffer };
  res.setHeader("Content-Type", row.mime_type); res.setHeader("Content-Length", row.size_bytes); res.setHeader("Content-Disposition", "inline; filename*=UTF-8''" + encodeURIComponent(row.file_name)); res.end(row.data);
});

router.patch("/users/:id/teacher-review", requireAuth, async (req, res): Promise<void> => {
  const actor = req.currentUser!;
  if (!isOwnerRole(actor.role)) { res.status(403).json({ error: "Owner approval is required for teacher applications." }); return; }
  const id = Number(req.params.id);
  const action = req.body?.action;
  if (!Number.isInteger(id) || !["approve", "reject", "convert_to_learner"].includes(action)) { res.status(400).json({ error: "Invalid teacher review action" }); return; }
  const [target] = await db.select({ id: usersTable.id, role: usersTable.role, teacherApplicationStatus: usersTable.teacherApplicationStatus, paymentInfo: usersTable.paymentInfo })
    .from(usersTable).where(eq(usersTable.id, id));
  if (!target || target.role !== "teacher" || target.teacherApplicationStatus !== "pending_review") {
    res.status(409).json({ error: "Only pending teacher applications can be reviewed" }); return;
  }
  if (action === "approve") {
    await pool.query("CREATE TABLE IF NOT EXISTS teacher_profiles (user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, cv jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now())");
    const cvResult = await pool.query("SELECT cv FROM teacher_profiles WHERE user_id = $1", [id]);
    const cv = (cvResult.rows[0]?.cv ?? {}) as Record<string, unknown>;
    const requiredFields = ["professionalSummary", "education", "experience", "subjects", "address"];
    const missingFields = requiredFields.filter((key) => typeof cv[key] !== "string" || (cv[key] as string).trim().length < 2);
    const docs = await pool.query("SELECT 1 FROM teacher_documents WHERE user_id = $1 AND document_type IN ('resume','certificate') LIMIT 1", [id]);
    if (missingFields.length || !target.paymentInfo || !docs.rows.length) {
      res.status(409).json({
        error: "Teacher application is incomplete. Complete the CV, add payment information, and upload a resume or certificate before owner approval.",
        missingFields,
        paymentInformationComplete: Boolean(target.paymentInfo),
        qualificationDocumentUploaded: Boolean(docs.rows.length),
      });
      return;
    }
  }
  const [user] = await db.update(usersTable).set(
    action === "approve"
      ? { role: "teacher", teacherApplicationStatus: "approved", teacherReviewDeadline: null }
      : { role: "student", teacherApplicationStatus: action === "reject" ? "rejected" : "manual_conversion", teacherReviewDeadline: null, subject: null, isManager: false, isPrefect: false },
  ).where(eq(usersTable.id, id)).returning(safeUserFields);
  await revokeUserSessions(id);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ ...user, createdAt: user.createdAt.toISOString() });
});

router.patch("/users/:id/payment-info", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const currentUser = req.currentUser!;
  if (currentUser.role !== "owner" && currentUser.id !== id) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const { paymentInfo } = req.body as { paymentInfo: string };
  const [user] = await db.update(usersTable).set({ paymentInfo: JSON.stringify(paymentInfo) }).where(eq(usersTable.id, id)).returning(safeUserFields);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ ...user, createdAt: user.createdAt.toISOString() });
});

export default router;
