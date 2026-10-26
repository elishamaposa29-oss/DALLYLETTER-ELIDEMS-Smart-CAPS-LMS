import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import multer from "multer";
import { db, usersTable, classesTable, pool } from "@workspace/db";
import {
  GetUserParams, UpdateUserParams, UpdateUserBody,
  DeleteUserParams, BlockUserParams, BlockUserBody,
  PromoteUserParams, PromoteUserBody,
} from "@workspace/api-zod";
import { requireAuth, requireOwner, canAccessManager, isOwnerRole } from "../lib/auth-middleware";
import { createMediaStorageKey, ensureMediaDirectory, getMediaDirectory, persistUploadedMedia, removeStoredMedia, streamStoredMedia } from "../lib/media-storage";
import { canReadPrivateProfileByRole, serializePublicProfile, maskPayoutDestination } from "../lib/profile-access-policy";
import { revokeUserSessions, consumeAuthAttempt } from "../lib/auth-session-store";
import { hashPassword, verifyPassword } from "../lib/password-hash";
import { sendEmail, isEmailConfigured } from "../lib/email-service";
import { enqueueEmailNotification } from "../lib/email-notification-queue";

const router: IRouter = Router();

function hasForbiddenPaymentCredentials(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const forbidden = new Set(["cardnumber","cardcvv","cardcvc","cardexpiry","cvv","cvc","expiry","pin","ecocashpin","paypalpassword","googlepassword","password","savedloginpassword","securitycode"]);
  return Object.keys(body).some(key => forbidden.has(key.toLowerCase().replace(/[^a-z]/g, "")));
}


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
  if (!canReadPrivateProfileByRole(actor.id, params.data.id, actor.role)) { res.status(403).json({ error: "You cannot access this private profile." }); return; }
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
  if (recoveryEmail !== null && recoveryEmail && (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recoveryEmail) || recoveryEmail.length > 254)) { res.status(400).json({ error: "Enter a valid alternate email address." }); return; }
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
  if (!/^\d{6}$/.test(code)) { res.status(400).json({ error: "Enter the six-digit verification code." }); return; }
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

router.get("/users/:id/teacher-cv", requireAuth, async (req, res): Promise<void> => {
  const actor = req.currentUser!;
  if (!isOwnerRole(actor.role)) { res.status(403).json({ error: "Only the owner may review teacher CVs." }); return; }
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid user id." }); return; }
  await pool.query("CREATE TABLE IF NOT EXISTS teacher_profiles (user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, cv jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now())");
  const result = await pool.query("SELECT cv, updated_at FROM teacher_profiles WHERE user_id = $1", [id]);
  if (!result.rows.length) { res.status(404).json({ error: "Teacher CV not found." }); return; }
  res.json(result.rows[0]);
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
      if (!["teacher", "manager", "senior_manager"].includes(String(req.currentUser!.role).toLowerCase())) { res.status(403).json({ error: "Teacher or manager account required" }); return; }
      const documentType = typeof req.body?.documentType === "string" ? req.body.documentType.trim() : "";
      if (!["cv", "resume", "certificate", "proof"].includes(documentType)) { res.status(400).json({ error: "Choose CV, resume, certificate or proof" }); return; }
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
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid user id." }); return; }
  const [target] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found." }); return; }
  const selfOrManager = actor.id === id || canAccessManager(actor);
  const professional = ["teacher", "manager", "senior_manager"].includes(String(target.role).toLowerCase());
  if (!selfOrManager && !professional) { res.status(403).json({ error: "Access denied" }); return; }
  const result = selfOrManager
    ? await pool.query("SELECT id, document_type, file_name, mime_type, size_bytes, created_at FROM teacher_documents WHERE user_id = $1 ORDER BY created_at DESC", [id])
    : await pool.query("SELECT id, document_type, file_name, mime_type, size_bytes, created_at FROM teacher_documents WHERE user_id = $1 AND document_type = 'certificate' ORDER BY created_at DESC", [id]);
  res.json(result.rows);
});

router.get("/users/:id/teacher-documents/:docId", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id); const docId = Number(req.params.docId); const actor = req.currentUser!;
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(docId) || docId <= 0) { res.status(400).json({ error: "Invalid document reference." }); return; }
  const [target] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found." }); return; }
  const selfOrManager = actor.id === id || canAccessManager(actor);
  const professional = ["teacher", "manager", "senior_manager"].includes(String(target.role).toLowerCase());
  const result = selfOrManager
    ? await pool.query("SELECT file_name, mime_type, size_bytes, data FROM teacher_documents WHERE id = $1 AND user_id = $2 LIMIT 1", [docId, id])
    : professional
      ? await pool.query("SELECT file_name, mime_type, size_bytes, data FROM teacher_documents WHERE id = $1 AND user_id = $2 AND document_type = 'certificate' LIMIT 1", [docId, id])
      : { rows: [] as Array<{ file_name:string; mime_type:string; size_bytes:number; data:Buffer }> };
  if (!result.rows[0]) { res.status(404).json({ error: "Document not found." }); return; }
  const row = result.rows[0] as { file_name:string; mime_type:string; size_bytes:number; data:Buffer; storage_key?:string|null };
  res.setHeader("Content-Type", row.mime_type);
  res.setHeader("Content-Disposition", "inline; filename*=UTF-8''" + encodeURIComponent(row.file_name));
  res.setHeader("Cache-Control", "private, no-store");
  if (row.storage_key) {
    const media = await streamStoredMedia(row.storage_key);
    if (!media) { res.status(404).json({ error: "Stored document not found." }); return; }
    const bytes = Buffer.from(await media.arrayBuffer());
    res.setHeader("Content-Length", bytes.length);
    res.end(bytes);
    return;
  }
  res.setHeader("Content-Length", row.size_bytes); res.end(row.data);
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
  if (typeof paymentInfo !== "string" || paymentInfo.length > 4000) { res.status(400).json({ error: "Payment information must be a short text value." }); return; }
  let parsedPaymentInfo: unknown = null;
  try { parsedPaymentInfo = JSON.parse(paymentInfo); } catch { /* Legacy free-text values remain supported after sensitive-data checks. */ }
  if (hasForbiddenPaymentCredentials(parsedPaymentInfo) || /\b(card[_ -]?number|cvv|cvc|security code|ecocash pin|paypal password|google password|password|pin)\b/i.test(paymentInfo) || /\d{13,19}/.test(paymentInfo.replace(/[ -]/g, ""))) {
    res.status(400).json({ error: "Card numbers, CVV/CVC, PINs and passwords must never be collected or stored." }); return;
  }
  const [user] = await db.update(usersTable).set({ paymentInfo: JSON.stringify(paymentInfo) }).where(eq(usersTable.id, id)).returning(safeUserFields);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ ...user, createdAt: user.createdAt.toISOString() });
});




// Public profile is intentionally separate from /users/:id (private profile).
router.get("/users/:id/public-profile", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid user id." }); return; }
  const [user] = await db.select({ id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl, bio: usersTable.bio, role: usersTable.role })
    .from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ error: "User not found." }); return; }
  const isProfessional = ["teacher", "manager", "senior_manager"].includes(String(user.role).toLowerCase());
  const [qualifications, teacherSubjectRows, learnerSubjectRows] = await Promise.all([
    isProfessional
      ? pool.query("SELECT title, verification_status FROM teacher_qualifications WHERE user_id = $1 AND verification_status = 'verified' ORDER BY created_at DESC", [id])
      : Promise.resolve({ rows: [] as Array<{ title: string; verification_status: string }> }),
    isProfessional
      ? pool.query("SELECT subjects_to_teach, primary_subject FROM teacher_subjects WHERE user_id = $1", [id])
      : Promise.resolve({ rows: [] as Array<{ subjects_to_teach: string[]; primary_subject: string | null }> }),
    isProfessional
      ? Promise.resolve({ rows: [] as Array<{ subjects: string[] }> })
      : pool.query("SELECT subjects FROM learner_subjects WHERE user_id = $1", [id]),
  ]);
  const teachingSubjects = Array.isArray(teacherSubjectRows.rows[0]?.subjects_to_teach)
    ? teacherSubjectRows.rows[0].subjects_to_teach.filter((v: unknown) => typeof v === "string")
    : [];
  const learningSubjects = Array.isArray(learnerSubjectRows.rows[0]?.subjects)
    ? learnerSubjectRows.rows[0].subjects.filter((v: unknown) => typeof v === "string")
    : [];
  res.json({
    ...serializePublicProfile(user, qualifications.rows, teachingSubjects),
    subjects: isProfessional ? teachingSubjects : learningSubjects,
    primary_subject: teacherSubjectRows.rows[0]?.primary_subject ?? null,
  });
});

router.get("/users/:id/payout-preview", requireAuth, async (req, res): Promise<void> => {
  const actor = req.currentUser!;
  if (!isOwnerRole(actor.role)) { res.status(403).json({ error: "Owner access required." }); return; }
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid user id." }); return; }
  const result = await pool.query(`SELECT u.id, u.name, u.role, COALESCE(s.subjects_to_teach, '{}') AS subjects,
    p.method, p.ecocash_phone, p.paypal_email, p.bank_name, p.account_name_holder
    FROM users u LEFT JOIN teacher_subjects s ON s.user_id = u.id
    LEFT JOIN payout_preferences p ON p.user_id = u.id WHERE u.id = $1`, [id]);
  const row = result.rows[0];
  if (!row) { res.status(404).json({ error: "User not found." }); return; }
  if (row.role !== "teacher") { res.status(400).json({ error: "Payout preview is only available for teacher accounts." }); return; }
  const destination = row.method === "ecocash" ? row.ecocash_phone : row.method === "paypal" ? row.paypal_email : null;
  const providerReady = row.method === "paypal" && Boolean(destination) && Boolean(process.env.PAYPAL_CLIENT_ID?.trim() && process.env.PAYPAL_CLIENT_SECRET?.trim());
  const maskedDestination = row.method === "bank" ? row.bank_name : destination ? maskPayoutDestination(destination) : null;
  res.json({
    teacher_id: row.id,
    legal_names: row.name,
    subjects: Array.isArray(row.subjects) ? row.subjects : [],
    method: row.method ?? null,
    destination_masked: maskedDestination,
    payout_ready: providerReady,
    message: providerReady ? `Pay ${row.name} via PayPal; destination ${maskedDestination}` :
      row.method === "paypal" && destination ? "PayPal Payouts credentials are not configured." :
      row.method === "ecocash" ? "EcoCash server-to-server payout provider is not configured." :
      row.method === "bank" ? "Bank payout execution is not configured." : "Teacher payout details are not configured.",
  });
});

router.get("/users/me/qualifications", requireAuth, async (req, res): Promise<void> => {
  const result = await pool.query("SELECT id, title, institution, year, verification_status, document_id, source, created_at FROM teacher_qualifications WHERE user_id = $1 ORDER BY created_at DESC", [req.currentUser!.id]);
  res.json(result.rows);
});

router.post("/users/me/qualifications", requireAuth, async (req, res): Promise<void> => {
  if (!["teacher", "manager", "senior_manager"].includes(String(req.currentUser!.role).toLowerCase())) { res.status(403).json({ error: "Teacher or manager account required." }); return; }
  const { title, institution, year, documentId } = req.body ?? {};
  if (typeof title !== "string" || !title.trim() || title.trim().length > 500) { res.status(400).json({ error: "Qualification title is required (maximum 500 characters)." }); return; }
  if (institution != null && (typeof institution !== "string" || institution.length > 300)) { res.status(400).json({ error: "Institution must be text up to 300 characters." }); return; }
  const parsedYear = year == null || year === "" ? null : Number(year);
  if (parsedYear !== null && (!Number.isInteger(parsedYear) || parsedYear < 1900 || parsedYear > new Date().getFullYear() + 5)) { res.status(400).json({ error: "Enter a valid qualification year." }); return; }
  let verifiedDocumentId: number | null = null;
  if (documentId != null) {
    const docId = Number(documentId);
    if (!Number.isSafeInteger(docId) || docId <= 0) { res.status(400).json({ error: "Invalid document id." }); return; }
    const doc = await pool.query("SELECT id FROM teacher_documents WHERE id = $1 AND user_id = $2 AND document_type IN ('certificate','proof')", [docId, req.currentUser!.id]);
    if (!doc.rows.length) { res.status(400).json({ error: "Document must be a certificate or proof uploaded by this account." }); return; }
    verifiedDocumentId = docId;
  }
  const result = await pool.query(`INSERT INTO teacher_qualifications (user_id,title,institution,year,document_id,verification_status,source)
    VALUES ($1,$2,$3,$4,$5,'pending','user')
    RETURNING id,title,institution,year,verification_status,document_id,source,created_at`,
    [req.currentUser!.id, title.trim(), typeof institution === "string" ? institution.trim() || null : null, parsedYear, verifiedDocumentId]);
  res.status(201).json(result.rows[0]);
});


// Owner-only moderation queue for qualifications awaiting verification.
router.get("/qualifications/pending", requireAuth, async(req,res):Promise<void>=>{
  if(!isOwnerRole(req.currentUser!.role)){res.status(403).json({error:"Owner/admin access required."});return;}
  const result=await pool.query("SELECT q.id,q.user_id,u.name AS teacher_name,q.title,q.institution,q.year,q.verification_status,q.document_id,d.file_name AS document_file_name,d.mime_type AS document_mime_type,q.created_at FROM teacher_qualifications q JOIN users u ON u.id=q.user_id LEFT JOIN teacher_documents d ON d.id=q.document_id WHERE q.verification_status='pending' ORDER BY q.created_at ASC");
  res.json(result.rows);
});

// Public list is intentionally minimal; only verified qualifications are public.
router.get("/qualifications/:userId", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.userId);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid user id." }); return; }
  const result = await pool.query("SELECT id,title,institution,year,verification_status,created_at FROM teacher_qualifications WHERE user_id=$1 AND verification_status='verified' ORDER BY created_at DESC", [id]);
  res.json(result.rows);
});

router.post("/qualifications", requireAuth, async (req, res): Promise<void> => {
  const actor = req.currentUser!;
  if (!["teacher", "manager", "senior_manager"].includes(String(actor.role).toLowerCase())) { res.status(403).json({ error: "Teacher or manager account required." }); return; }
  const { title, institution, year } = req.body ?? {};
  if (typeof title !== "string" || !title.trim() || title.trim().length > 500) { res.status(400).json({ error: "Qualification title is required (maximum 500 characters)." }); return; }
  if (institution != null && (typeof institution !== "string" || institution.trim().length > 300)) { res.status(400).json({ error: "Institution must be text up to 300 characters." }); return; }
  const parsedYear = year == null || year === "" ? null : Number(year);
  if (parsedYear !== null && (!Number.isInteger(parsedYear) || parsedYear < 1900 || parsedYear > new Date().getFullYear()+5)) { res.status(400).json({ error: "Enter a valid qualification year." }); return; }
  const result = await pool.query("INSERT INTO teacher_qualifications(user_id,title,institution,year,verification_status,source) VALUES($1,$2,$3,$4,'pending','user') RETURNING id,title,institution,year,verification_status,document_id,created_at", [actor.id,title.trim(),typeof institution==="string"?institution.trim()||null:null,parsedYear]);
  res.status(201).json(result.rows[0]);
});

const qualificationUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => { void ensureMediaDirectory().then(()=>callback(null,getMediaDirectory())).catch(error=>callback(error as Error,"")); },
    filename: (_req, _file, callback) => callback(null,createMediaStorageKey()),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req,file,callback) => callback(null,["application/pdf","image/jpeg","image/png"].includes(file.mimetype)),
});

router.post("/qualifications/:id/document", requireAuth, (req,res,next):void => {
  qualificationUpload.single("file")(req,res,error=>{
    void (async()=>{
      if(error instanceof multer.MulterError){res.status(400).json({error:"Choose a PDF, JPG, or PNG file up to 10 MB."});return;}
      if(error){next(error);return;}
      const file=req.file;
      if(!file){res.status(415).json({error:"Choose a PDF, JPG, or PNG file."});return;}
      const actor=req.currentUser!;
      try{
        const id=Number(req.params.id);
        if(!Number.isSafeInteger(id)||id<=0){res.status(400).json({error:"Invalid qualification id."});return;}
        const q=await pool.query("SELECT id,user_id FROM teacher_qualifications WHERE id=$1",[id]);
        if(!q.rows.length){res.status(404).json({error:"Qualification not found."});return;}
        if(q.rows[0].user_id!==actor.id&&!isOwnerRole(actor.role)){res.status(403).json({error:"You cannot upload documents for this qualification."});return;}
        if(q.rows[0].user_id!==actor.id&&isOwnerRole(actor.role)){res.status(403).json({error:"Upload documents from the qualification owner's account."});return;}
        const bytes=await readFile(file.path);
        const validPdf=file.mimetype==="application/pdf"&&bytes.subarray(0,5).toString()==="%PDF-";
        const validJpeg=file.mimetype==="image/jpeg"&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
        const validPng=file.mimetype==="image/png"&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
        if(!validPdf&&!validJpeg&&!validPng){await import("node:fs/promises").then(fs=>fs.unlink(file.path).catch(()=>undefined));res.status(415).json({error:"The file content does not match a supported PDF/JPG/PNG type."});return;}
        const storageKey=createMediaStorageKey();
        await persistUploadedMedia(storageKey,file.mimetype,file.path);
        const result=await pool.query("INSERT INTO teacher_documents(user_id,document_type,file_name,mime_type,size_bytes,data,storage_key) VALUES($1,'certificate',$2,$3,$4,decode('', 'hex'),$5) RETURNING id,file_name,mime_type,size_bytes,created_at",[actor.id,file.originalname.replace(/[\\r\\n]/g,"").slice(0,255)||"qualification-document",file.mimetype,bytes.length,storageKey]);
        await pool.query("UPDATE teacher_qualifications SET document_id=$1 WHERE id=$2 AND user_id=$3",[result.rows[0].id,id,actor.id]);
        res.status(201).json({document:result.rows[0],message:"Document uploaded; qualification remains pending verification."});
      }catch(error){next(error);}
    })();
  });
});

router.patch("/qualifications/:id/verify", requireAuth, async(req,res):Promise<void>=>{
  if(!isOwnerRole(req.currentUser!.role)){res.status(403).json({error:"Owner/admin access required."});return;}
  const id=Number(req.params.id);
  const status=req.body?.status;
  if(!Number.isSafeInteger(id)||id<=0){res.status(400).json({error:"Invalid qualification id."});return;}
  if(!["verified","rejected"].includes(status)){res.status(400).json({error:"status must be verified or rejected."});return;}
  const result=await pool.query("UPDATE teacher_qualifications SET verification_status=$1 WHERE id=$2 RETURNING id,user_id,title,institution,year,verification_status,document_id,created_at",[status,id]);
  if(!result.rows.length){res.status(404).json({error:"Qualification not found."});return;}
  res.json(result.rows[0]);
});

router.get("/qualifications/:id/document", requireAuth, async(req,res):Promise<void>=>{
  const id=Number(req.params.id), actor=req.currentUser!;
  if(!Number.isSafeInteger(id)||id<=0){res.status(400).json({error:"Invalid document id."});return;}
  const result=await pool.query("SELECT d.id,d.user_id,d.file_name,d.mime_type,d.storage_key,q.verification_status FROM teacher_documents d LEFT JOIN teacher_qualifications q ON q.document_id=d.id WHERE d.id=$1",[id]);
  const doc=result.rows[0];
  if(!doc){res.status(404).json({error:"Document not found."});return;}
  if(doc.user_id!==actor.id&&!isOwnerRole(actor.role)){res.status(403).json({error:"Document access denied."});return;}
  if(!doc.storage_key){res.status(503).json({error:"Document storage key unavailable for this legacy record."});return;}
  const media=await streamStoredMedia(doc.storage_key);
  if(!media){res.status(404).json({error:"Stored document not found."});return;}
  res.setHeader("Content-Type",doc.mime_type);
  res.setHeader("Content-Disposition",`inline; filename="${String(doc.file_name).replace(/["\\r\\n]/g,"")}"`);
  res.setHeader("Cache-Control","private, no-store");
  res.status(media.status);
  const bytes=Buffer.from(await media.arrayBuffer());
  res.send(bytes);
});

router.post("/users/me/notification-email/request", requireAuth, async(req,res):Promise<void>=>{
  const email=typeof req.body?.email==="string"?req.body.email.trim().toLowerCase():"";
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||email.length>254){res.status(400).json({error:"Enter a valid notification email address."});return;}
  if(!isEmailConfigured()){res.status(503).json({error:"Email delivery is not configured; notification email was not changed."});return;}
  if(await consumeAuthAttempt("notification-email-request",String(req.currentUser!.id),req.ip||"unknown",5,60*60*1000,60*60*1000)){res.status(429).json({error:"Too many OTP requests. Try again later."});return;}
  const otp=String(crypto.randomInt(100000,1000000));
  const digest=await hashPassword(String(req.currentUser!.id)+":"+email+":"+otp);
  await pool.query("INSERT INTO notification_email_verifications(user_id,email,otp_hash,expires_at,attempts,created_at) VALUES($1,$2,$3,now()+interval '10 minutes',0,now()) ON CONFLICT(user_id) DO UPDATE SET email=EXCLUDED.email,otp_hash=EXCLUDED.otp_hash,expires_at=EXCLUDED.expires_at,attempts=0,created_at=now()",[req.currentUser!.id,email,digest]);
  try{await sendEmail({to:[email],subject:"Verify your Dallyletter notification email",text:"Your verification code is "+otp+". It expires in 10 minutes. If you did not request this, ignore this message."});}
  catch{await pool.query("DELETE FROM notification_email_verifications WHERE user_id=$1",[req.currentUser!.id]);res.status(503).json({error:"Email provider could not send the code. Try again later."});return;}
  res.json({message:"Verification code sent. It expires in 10 minutes."});
});

router.post("/users/me/notification-email/verify", requireAuth, async(req,res):Promise<void>=>{
  const email=typeof req.body?.email==="string"?req.body.email.trim().toLowerCase():"";
  const otp=typeof req.body?.otp==="string"?req.body.otp.trim():"";
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||!/^[0-9]{6}$/.test(otp)){res.status(400).json({error:"Valid email and six-digit OTP are required."});return;}
  if(await consumeAuthAttempt("notification-email-verify",String(req.currentUser!.id),req.ip||"unknown",8,15*60*1000,15*60*1000)){res.status(429).json({error:"Too many verification attempts. Try again later."});return;}
  const found=await pool.query("SELECT email,otp_hash,expires_at,attempts FROM notification_email_verifications WHERE user_id=$1",[req.currentUser!.id]);
  const saved=found.rows[0];
  const valid=Boolean(saved&&saved.email===email&&saved.attempts<8&&new Date(saved.expires_at).getTime()>Date.now()&&await verifyPassword(String(req.currentUser!.id)+":"+email+":"+otp,String(saved.otp_hash)).then(v=>v.valid).catch(()=>false));
  if(!valid){await pool.query("UPDATE notification_email_verifications SET attempts=attempts+1 WHERE user_id=$1",[req.currentUser!.id]);res.status(400).json({error:"Verification code is invalid or expired."});return;}
  const consumed=await pool.query("DELETE FROM notification_email_verifications WHERE user_id=$1 AND email=$2 AND otp_hash=$3 AND expires_at>now() AND attempts<8 RETURNING email",[req.currentUser!.id,email,saved.otp_hash]);
  if(!consumed.rows.length){res.status(400).json({error:"Verification code has already been used or expired."});return;}
  await pool.query("UPDATE users SET notification_email=$2,notification_email_verified_at=now() WHERE id=$1",[req.currentUser!.id,email]);
  res.json({message:"Notification email verified.",notification_email:email,verified:true});
});

router.get("/users/me/notification-email", requireAuth, async(req,res):Promise<void>=>{
  const result=await pool.query("SELECT notification_email,notification_email_verified_at FROM users WHERE id=$1",[req.currentUser!.id]);
  res.json(result.rows[0]??{notification_email:null,notification_email_verified_at:null});
});

router.post("/classes/:classId/enroll", requireAuth, async(req,res):Promise<void>=>{
  const actor=req.currentUser!;
  const classId=Number(req.params.classId);
  const requestedLearnerId=req.body?.learnerId==null?actor.id:Number(req.body.learnerId);
  if(!Number.isSafeInteger(classId)||classId<=0||!Number.isSafeInteger(requestedLearnerId)||requestedLearnerId<=0){res.status(400).json({error:"Valid class id and learner id are required."});return;}
  const selfEnrollment=requestedLearnerId===actor.id;
  if(!selfEnrollment&&!isOwnerRole(actor.role)&&!canAccessManager(actor)){res.status(403).json({error:"Only the learner or authorized staff may create an enrollment."});return;}
  if(selfEnrollment&&!["student","prefect","learner"].includes(String(actor.role).toLowerCase())){res.status(403).json({error:"Learner account required to self-enroll."});return;}
  const [target]=await db.select({id:usersTable.id,role:usersTable.role}).from(usersTable).where(eq(usersTable.id,requestedLearnerId));
  if(!target||!["student","prefect","learner"].includes(String(target.role).toLowerCase())){res.status(400).json({error:"Enrollment target must be a learner account."});return;}
  const [klass]=await db.select({id:classesTable.id}).from(classesTable).where(eq(classesTable.id,classId));
  if(!klass){res.status(404).json({error:"Class not found."});return;}
  const result=await pool.query("INSERT INTO enrollments(learner_id,class_id,status) VALUES($1,$2,'active') ON CONFLICT(learner_id,class_id) DO UPDATE SET status='active' RETURNING id,learner_id,class_id,enrolled_at,progress_percent,status",[requestedLearnerId,classId]);
  void enqueueEmailNotification(requestedLearnerId,"Class enrollment confirmed","You have been enrolled in a Dallyletter class. Open your Profile Hub to review your enrollment and progress.").catch(error=>console.error("Could not queue enrollment email",error));
  res.status(201).json(result.rows[0]);
});

router.patch("/enrollments/:id/progress", requireAuth, async(req,res):Promise<void>=>{
  const actor=req.currentUser!, id=Number(req.params.id), progress=Number(req.body?.progress_percent);
  if(!Number.isSafeInteger(id)||id<=0||!Number.isInteger(progress)||progress<0||progress>100){res.status(400).json({error:"Valid enrollment id and progress_percent between 0 and 100 are required."});return;}
  const found=await pool.query("SELECT e.id,e.learner_id,e.class_id,c.teacher_id FROM enrollments e JOIN classes c ON c.id=e.class_id WHERE e.id=$1",[id]);
  const row=found.rows[0];
  if(!row){res.status(404).json({error:"Enrollment not found."});return;}
  if(actor.id!==row.learner_id&&actor.id!==row.teacher_id&&!isOwnerRole(actor.role)&&!canAccessManager(actor)){res.status(403).json({error:"Enrollment progress update denied."});return;}
  const result=await pool.query("UPDATE enrollments SET progress_percent=$1,status=CASE WHEN $1=100 THEN 'completed' ELSE 'active' END WHERE id=$2 RETURNING id,learner_id,class_id,enrolled_at,progress_percent,status",[progress,id]);
  res.json(result.rows[0]);
});

router.get("/users/me/enrollments", requireAuth, async(req,res):Promise<void>=>{
  const actor=req.currentUser!;
  const learnerId=actor.id;
  const result=await pool.query(`SELECT e.id,e.class_id,e.enrolled_at,e.progress_percent,e.status,c.title,c.subject,c.grade,c.scheduled_at,c.teacher_id,c.teacher_name
    FROM enrollments e JOIN classes c ON c.id=e.class_id WHERE e.learner_id=$1 AND e.status='active' ORDER BY e.enrolled_at DESC`,[learnerId]);
  res.json(result.rows);
});

router.get("/users/me/enrollments-summary", requireAuth, async(req,res,next):Promise<void>=>{
  try{
    const [enrollments,achievements]=await Promise.all([
      pool.query("SELECT count(*)::int AS enrollment_count, COALESCE(avg(progress_percent),0)::int AS progress_percent FROM enrollments WHERE learner_id=$1 AND status='active'",[req.currentUser!.id]),
      pool.query("SELECT count(*)::int AS achievement_count FROM user_achievements WHERE user_id=$1",[req.currentUser!.id]),
    ]);
    res.json({enrollment_count:enrollments.rows[0]?.enrollment_count??0,progress_percent:enrollments.rows[0]?.progress_percent??0,achievement_count:achievements.rows[0]?.achievement_count??0,completeness:"complete",unavailable_sources:[]});
  }catch(error){next(error);}
});

router.get("/payouts/history", requireAuth, async(req,res):Promise<void>=>{
  if(!isOwnerRole(req.currentUser!.role)){res.status(403).json({error:"Owner/admin access required."});return;}
  const teacherId=req.query.teacherId==null?null:Number(req.query.teacherId);
  if(teacherId!==null&&(!Number.isSafeInteger(teacherId)||teacherId<=0)){res.status(400).json({error:"Invalid teacherId."});return;}
  const result=teacherId===null
    ? await pool.query("SELECT h.id,h.teacher_id,u.name AS teacher_name,h.amount,h.currency,h.method,h.provider_reference,h.status,h.webhook_verified,h.note,h.created_at,h.updated_at FROM payout_history h JOIN users u ON u.id=h.teacher_id ORDER BY h.created_at DESC LIMIT 200")
    : await pool.query("SELECT h.id,h.teacher_id,u.name AS teacher_name,h.amount,h.currency,h.method,h.provider_reference,h.status,h.webhook_verified,h.note,h.created_at,h.updated_at FROM payout_history h JOIN users u ON u.id=h.teacher_id WHERE h.teacher_id=$1 ORDER BY h.created_at DESC LIMIT 200",[teacherId]);
  res.json(result.rows);
});

router.post("/payouts/execute", requireAuth, async(req,res):Promise<void>=>{
  if(!isOwnerRole(req.currentUser!.role)){res.status(403).json({error:"Owner/admin access required."});return;}
  const {teacherId,amount,note}=req.body??{};
  const id=Number(teacherId), value=Number(amount);
  if(!Number.isSafeInteger(id)||id<=0||!Number.isFinite(value)||value<=0||value>10000000){res.status(400).json({error:"Valid teacherId and positive amount are required."});return;}
  if(hasForbiddenPaymentCredentials(req.body)){res.status(400).json({error:"Card details, PINs and passwords are never accepted."});return;}
  const prefs=await pool.query("SELECT p.method,p.paypal_email,p.ecocash_phone,u.role FROM payout_preferences p JOIN users u ON u.id=p.user_id WHERE p.user_id=$1",[id]);
  if(!prefs.rows.length||prefs.rows[0].role!=="teacher"){res.status(404).json({error:"Teacher payout preferences not found."});return;}
  const p=prefs.rows[0];
  if(p.method==="ecocash"){res.status(503).json({error:"EcoCash payout provider is not configured for server-to-server disbursement. No payment was sent.",provider:"ecocash"});return;}
  if(p.method!=="paypal"||!p.paypal_email){res.status(400).json({error:"A verified PayPal payout email is required for this payout route."});return;}
  const clientId=process.env.PAYPAL_CLIENT_ID?.trim(), secret=process.env.PAYPAL_CLIENT_SECRET?.trim();
  if(!clientId||!secret){res.status(503).json({error:"PayPal Payouts credentials are not configured. No payment was sent.",provider:"paypal"});return;}
  const base=(process.env.PAYPAL_API_BASE?.trim()||(process.env.NODE_ENV==="production"?"https://api-m.paypal.com":"https://api-m.sandbox.paypal.com")).replace(/\/$/, "");
  const tokenResponse=await fetch(base+"/v1/oauth2/token",{method:"POST",headers:{Authorization:"Basic "+Buffer.from(clientId+":"+secret).toString("base64"),"Content-Type":"application/x-www-form-urlencoded"},body:"grant_type=client_credentials"});
  if(!tokenResponse.ok){res.status(502).json({error:"PayPal authentication failed; no payout was created."});return;}
  const tokenData=await tokenResponse.json() as {access_token?:string};
  if(!tokenData.access_token){res.status(502).json({error:"PayPal did not return an access token."});return;}
  const reference="TEACHER_"+id+"_"+Date.now();
  const payoutResponse=await fetch(base+"/v1/payments/payouts",{method:"POST",headers:{Authorization:"Bearer "+tokenData.access_token,"Content-Type":"application/json","PayPal-Request-Id":reference},body:JSON.stringify({sender_batch_header:{sender_batch_id:reference,email_subject:"Your Dallyletter teacher payout",email_message:"A teacher payout has been initiated."},items:[{recipient_type:"EMAIL",amount:{value:value.toFixed(2),currency:process.env.PAYOUT_CURRENCY||"USD"},receiver:p.paypal_email,note:typeof note==="string"?note.slice(0,500):"Teacher payout"}]})});
  const payoutBody=await payoutResponse.json().catch(()=>({})) as {batch_header?:{payout_batch_id?:string;batch_status?:string};message?:string};
  if(!payoutResponse.ok){res.status(502).json({error:"PayPal rejected the payout request.",provider_message:payoutBody.message??null});return;}
  const providerReference=payoutBody.batch_header?.payout_batch_id??reference;
  const saved=await pool.query("INSERT INTO payout_history(teacher_id,amount,currency,method,provider_reference,status,note) VALUES($1,$2,$3,'paypal',$4,'pending',$5) RETURNING id,teacher_id,amount,currency,method,provider_reference,status,created_at",[id,value,process.env.PAYOUT_CURRENCY||"USD",providerReference,typeof note==="string"?note.slice(0,500):null]);
  void enqueueEmailNotification(id,"Teacher payout submitted","A teacher payout request was submitted to PayPal. Reference: "+providerReference+". Settlement is pending provider confirmation.").catch(error=>console.error("Could not queue payout email",error));
  res.status(202).json({message:"Payout submitted to PayPal; final settlement awaits provider confirmation.",payout:saved.rows[0]});
});

router.post("/webhooks/paypal", async(req,res):Promise<void>=>{
  const clientId=process.env.PAYPAL_CLIENT_ID?.trim(), secret=process.env.PAYPAL_CLIENT_SECRET?.trim(), webhookId=process.env.PAYPAL_WEBHOOK_ID?.trim();
  if(!clientId||!secret||!webhookId){res.status(503).json({error:"PayPal webhook verification is not configured."});return;}
  const headers={
    auth_algo:req.header("paypal-auth-algo")||"",
    cert_url:req.header("paypal-cert-url")||"",
    transmission_id:req.header("paypal-transmission-id")||"",
    transmission_sig:req.header("paypal-transmission-sig")||"",
    transmission_time:req.header("paypal-transmission-time")||"",
  };
  if(Object.values(headers).some(v=>!v)){res.status(400).json({error:"PayPal signature headers are required."});return;}
  const base=(process.env.PAYPAL_API_BASE?.trim()||(process.env.NODE_ENV==="production"?"https://api-m.paypal.com":"https://api-m.sandbox.paypal.com")).replace(/\/$/,"");
  try{
    const auth=await fetch(base+"/v1/oauth2/token",{method:"POST",headers:{Authorization:"Basic "+Buffer.from(clientId+":"+secret).toString("base64"),"Content-Type":"application/x-www-form-urlencoded"},body:"grant_type=client_credentials"});
    if(!auth.ok){res.status(502).json({error:"PayPal webhook verification authentication failed."});return;}
    const authData=await auth.json() as {access_token?:string};
    if(!authData.access_token){res.status(502).json({error:"PayPal access token unavailable."});return;}
    const verification=await fetch(base+"/v1/notifications/verify-webhook-signature",{method:"POST",headers:{Authorization:"Bearer "+authData.access_token,"Content-Type":"application/json"},body:JSON.stringify({...headers,webhook_id:webhookId,webhook_event:req.body})});
    const verificationData=await verification.json().catch(()=>({})) as {verification_status?:string};
    if(!verification.ok||verificationData.verification_status!=="SUCCESS"){res.status(401).json({error:"PayPal webhook signature is invalid."});return;}
    const eventType=String(req.body?.event_type||"");
    const resource=req.body?.resource||{};
    const batchId=String(resource?.batch_header?.payout_batch_id||resource?.payout_batch_id||resource?.batch_id||"");
    if(!batchId){res.json({received:true,updated:false});return;}
    const normalized=eventType==="PAYMENT.PAYOUTSBATCH.SUCCESS"||eventType==="PAYMENT.PAYOUTS-ITEM.SUCCEEDED"?"paid":
      eventType==="PAYMENT.PAYOUTSBATCH.DENIED"||eventType==="PAYMENT.PAYOUTS-ITEM.FAILED"?"failed":null;
    if(!normalized){res.json({received:true,updated:false});return;}
    const updated=await pool.query("UPDATE payout_history SET status=$1,webhook_verified=true,updated_at=now() WHERE provider_reference=$2 AND method='paypal' AND (webhook_verified=false OR status='pending') RETURNING teacher_id,status,provider_reference",[normalized,batchId]);
    if(updated.rows.length){
      const row=updated.rows[0];
      void enqueueEmailNotification(Number(row.teacher_id),"Teacher payout "+normalized,"Your PayPal payout reference "+row.provider_reference+" is now "+normalized+".").catch(error=>console.error("Could not queue payout status email",error));
    }
    res.json({received:true,updated:updated.rows.length>0});
  }catch(error){res.status(502).json({error:"PayPal webhook verification could not be completed."});}
});

router.post("/webhooks/paynow", async(req,res):Promise<void>=>{
  // This HMAC format is supported only when a trusted integration proxy explicitly signs callbacks this way.
  // Native Paynow callbacks must use the provider's documented hash verifier; never enable this flag by guesswork.
  if(process.env.PAYNOW_WEBHOOK_HMAC_SHA256!=="true"){res.status(503).json({error:"Paynow webhook state changes are disabled until the provider-specific signature verifier is configured."});return;}
  const key=process.env.PAYNOW_KEY?.trim();
  if(!key){res.status(503).json({error:"Paynow webhook verification is not configured."});return;}
  const signature=req.header("x-paynow-signature");
  if(!signature||typeof req.body?.reference!=="string"||typeof req.body?.status!=="string"){res.status(400).json({error:"Signed Paynow reference and status are required."});return;}
  const raw=JSON.stringify(req.body);
  const expected=crypto.createHmac("sha256",key).update(raw).digest("hex");
  const supplied=signature.replace(/^sha256=/,"");
  const a=Buffer.from(expected,"hex"),b=Buffer.from(supplied,"hex");
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b)){res.status(401).json({error:"Invalid Paynow webhook signature."});return;}
  const reference=req.body.reference;
  const status=String(req.body.status).toLowerCase();
  if(!["paid","failed","pending"].includes(status)){res.status(400).json({error:"Unsupported payment status."});return;}
  await pool.query("UPDATE payout_history SET status=$1,webhook_verified=true,updated_at=now() WHERE provider_reference=$2 AND webhook_verified=false",[status,reference]);
  res.json({received:true});
});

router.get("/subjects/catalog", requireAuth, async (_req, res): Promise<void> => {
  const [lessonRows, classRows] = await Promise.all([
    pool.query("SELECT DISTINCT trim(subject) AS subject FROM lessons WHERE subject IS NOT NULL AND trim(subject) <> ''").catch(() => ({ rows: [] as Array<{ subject: string }> })),
    pool.query("SELECT DISTINCT trim(subject) AS subject FROM classes WHERE subject IS NOT NULL AND trim(subject) <> ''").catch(() => ({ rows: [] as Array<{ subject: string }> })),
  ]);
  const subjects = [...new Set([...lessonRows.rows, ...classRows.rows].map((row: { subject: string }) => row.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  res.json({ subjects });
});

router.get("/users/me/subjects", requireAuth, async (req, res): Promise<void> => {
  const role = String(req.currentUser!.role).toLowerCase();
  if (["teacher", "manager", "senior_manager"].includes(role)) {
    const result = await pool.query("SELECT teaching_subjects, subjects_to_teach, primary_subject FROM teacher_subjects WHERE user_id = $1", [req.currentUser!.id]);
    res.json(result.rows[0] ?? { teaching_subjects: [], subjects_to_teach: [], primary_subject: null });
    return;
  }
  const result = await pool.query("SELECT subjects FROM learner_subjects WHERE user_id = $1", [req.currentUser!.id]);
  res.json({ subjects: result.rows[0]?.subjects ?? [], teaching_subjects: [], subjects_to_teach: [] });
});

router.put("/users/me/subjects", requireAuth, async (req, res): Promise<void> => {
  const role = String(req.currentUser!.role).toLowerCase();
  const parseSubjects = (value: unknown): string[] | null => {
    if (!Array.isArray(value) || value.length > 50 || value.some(v => typeof v !== "string" || !v.trim() || v.trim().length > 100)) return null;
    return [...new Set(value.map(v => (v as string).trim()))];
  };
  if (["teacher", "manager", "senior_manager"].includes(role)) {
    if (!["teacher", "manager", "senior_manager"].includes(role)) { res.status(403).json({ error: "Teacher or manager account required." }); return; }
    const teaching = parseSubjects(req.body?.teaching_subjects);
    const toTeach = parseSubjects(req.body?.subjects_to_teach);
    const primary = typeof req.body?.primary_subject === "string" ? req.body.primary_subject.trim() : "";
    if (!teaching || !toTeach || (primary && !toTeach.includes(primary))) {
      res.status(400).json({ error: "Provide valid subject arrays and choose the primary specialization from your teaching subjects." }); return;
    }
    const result = await pool.query(`INSERT INTO teacher_subjects (user_id, teaching_subjects, subjects_to_teach, primary_subject, updated_at)
      VALUES ($1,$2,$3,$4,now()) ON CONFLICT (user_id) DO UPDATE SET teaching_subjects=EXCLUDED.teaching_subjects, subjects_to_teach=EXCLUDED.subjects_to_teach, primary_subject=EXCLUDED.primary_subject, updated_at=now()
      RETURNING teaching_subjects, subjects_to_teach, primary_subject, updated_at`, [req.currentUser!.id, teaching, toTeach, primary || null]);
    res.json(result.rows[0]);
    return;
  }
  if (!["student", "learner", "prefect"].includes(role)) { res.status(403).json({ error: "This account cannot edit learning subjects." }); return; }
  const subjects = parseSubjects(req.body?.subjects ?? req.body?.subjects_to_learn);
  if (!subjects) { res.status(400).json({ error: "Choose up to 50 valid learning subjects." }); return; }
  const result = await pool.query(`INSERT INTO learner_subjects (user_id, subjects, updated_at) VALUES ($1,$2,now())
    ON CONFLICT (user_id) DO UPDATE SET subjects=EXCLUDED.subjects, updated_at=now() RETURNING subjects, updated_at`, [req.currentUser!.id, subjects]);
  res.json(result.rows[0]);
});

router.get("/users/me/payout-preferences", requireAuth, async(req,res):Promise<void>=>{
  if(req.currentUser!.role!=="teacher"){res.status(403).json({error:"Teacher account required."});return;}
  const result=await pool.query("SELECT method,ecocash_phone,paypal_email,bank_name,account_name_holder,updated_at FROM payout_preferences WHERE user_id=$1",[req.currentUser!.id]);
  const row=result.rows[0];
  if(!row){res.json({method:null,destination_masked:null,bank_name:null,account_name_holder:null,payout_ready:false});return;}
  const destination=row.method==="ecocash"?row.ecocash_phone:row.method==="paypal"?row.paypal_email:null;
  res.json({method:row.method,destination_masked:destination?maskPayoutDestination(destination):null,bank_name:row.bank_name,account_name_holder:row.account_name_holder,payout_ready:Boolean(row.method&&destination),updated_at:row.updated_at});
});

router.put("/users/me/payout-preferences", requireAuth, async (req, res): Promise<void> => {
  if (req.currentUser!.role !== "teacher") { res.status(403).json({ error: "Teacher account required." }); return; }
  const body = req.body ?? {};
  if (hasForbiddenPaymentCredentials(body)) { res.status(400).json({ error: "Payment credentials and card security data must never be submitted or stored." }); return; }
  const { method, ecocash_phone, paypal_email, bank_name, account_name_holder } = body;
  if (!["ecocash","paypal","bank"].includes(method)) { res.status(400).json({ error: "Choose ecocash, paypal, or bank." }); return; }
  if (method === "ecocash" && (typeof ecocash_phone !== "string" || ecocash_phone.trim().length < 7 || ecocash_phone.trim().length > 40)) { res.status(400).json({ error: "Enter a valid EcoCash phone number." }); return; }
  if (method === "paypal" && (typeof paypal_email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(paypal_email) || paypal_email.length > 254)) { res.status(400).json({ error: "Enter a valid PayPal email address." }); return; }
  if (method === "bank" && (![bank_name, account_name_holder].every(v => typeof v === "string" && v.trim().length > 0 && v.length <= 200))) { res.status(400).json({ error: "Bank name and account holder are required." }); return; }
  const result = await pool.query(`INSERT INTO payout_preferences (user_id,method,ecocash_phone,paypal_email,bank_name,account_name_holder,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,now()) ON CONFLICT (user_id) DO UPDATE SET method=EXCLUDED.method, ecocash_phone=EXCLUDED.ecocash_phone,
    paypal_email=EXCLUDED.paypal_email, bank_name=EXCLUDED.bank_name, account_name_holder=EXCLUDED.account_name_holder, updated_at=now()
    RETURNING user_id,method,updated_at`, [req.currentUser!.id, method, method === "ecocash" ? ecocash_phone.trim() : null, method === "paypal" ? paypal_email.trim().toLowerCase() : null, method === "bank" ? bank_name.trim() : null, method === "bank" ? account_name_holder.trim() : null]);
  res.json(result.rows[0]);
});

export default router;
