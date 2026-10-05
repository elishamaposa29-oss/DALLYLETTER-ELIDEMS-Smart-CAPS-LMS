import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import multer from "multer";
import { db, usersTable, pool } from "@workspace/db";
import {
  GetUserParams, UpdateUserParams, UpdateUserBody,
  DeleteUserParams, BlockUserParams, BlockUserBody,
  PromoteUserParams, PromoteUserBody,
} from "@workspace/api-zod";
import { requireAuth, requireOwner, canAccessManager } from "../lib/auth-middleware";

const router: IRouter = Router();

const safeUserFields = {
  id: usersTable.id,
  email: usersTable.email,
  name: usersTable.name,
  role: usersTable.role,
  isPrefect: usersTable.isPrefect,
  isManager: usersTable.isManager,
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
  const fields = req.currentUser!.role === "owner" ? safeUserFields : directoryUserFields;
  const users = await db.select(fields).from(usersTable).orderBy(usersTable.createdAt);
  res.json(users.map(u => ({ ...u, createdAt: u.createdAt.toISOString() })));
});

router.get("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
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
  if (currentUser.role !== "owner" && currentUser.id !== params.data.id) {
    res.status(403).json({ error: "Cannot update another user's profile" }); return;
  }
  const updates: Record<string, unknown> = {};
  if (body.data.name != null) updates.name = body.data.name;
  if (body.data.email != null) updates.email = body.data.email;
  if (body.data.phone != null) updates.phone = body.data.phone;
  if (body.data.grade != null) updates.grade = body.data.grade;
  if (body.data.subject != null) updates.subject = body.data.subject;
  if (body.data.avatarUrl != null) updates.avatarUrl = body.data.avatarUrl;
  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, params.data.id)).returning(safeUserFields);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ ...user, createdAt: user.createdAt.toISOString() });
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
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ ...user, createdAt: user.createdAt.toISOString() });
});

router.patch("/users/:id/suspend", requireAuth, requireOwner, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { isSuspended } = req.body as { isSuspended: boolean };
  if (typeof isSuspended !== "boolean") { res.status(400).json({ error: "isSuspended must be boolean" }); return; }
  const [user] = await db.update(usersTable).set({ isSuspended }).where(eq(usersTable.id, id)).returning(safeUserFields);
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
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ ...user, createdAt: user.createdAt.toISOString() });
});

router.patch("/users/:id/promote-manager", requireAuth, requireOwner, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { isManager } = req.body as { isManager: boolean };
  if (typeof isManager !== "boolean") { res.status(400).json({ error: "isManager must be boolean" }); return; }
  const [user] = await db.update(usersTable).set({ isManager }).where(eq(usersTable.id, id)).returning(safeUserFields);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ ...user, createdAt: user.createdAt.toISOString() });
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
  if (!canAccessManager(actor)) { res.status(403).json({ error: "Manager or owner access required" }); return; }
  const id = Number(req.params.id);
  const action = req.body?.action;
  if (!Number.isInteger(id) || !["approve", "reject", "convert_to_learner"].includes(action)) { res.status(400).json({ error: "Invalid teacher review action" }); return; }
  const [target] = await db.select({ id: usersTable.id, role: usersTable.role, teacherApplicationStatus: usersTable.teacherApplicationStatus })
    .from(usersTable).where(eq(usersTable.id, id));
  if (!target || target.role !== "teacher" || target.teacherApplicationStatus !== "pending_review") {
    res.status(409).json({ error: "Only pending teacher applications can be reviewed" }); return;
  }
  const [user] = await db.update(usersTable).set(
    action === "approve"
      ? { role: "teacher", teacherApplicationStatus: "approved", teacherReviewDeadline: null }
      : { role: "student", teacherApplicationStatus: action === "reject" ? "rejected" : "manual_conversion", teacherReviewDeadline: null, subject: null, isManager: false, isPrefect: false },
  ).where(eq(usersTable.id, id)).returning(safeUserFields);
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
