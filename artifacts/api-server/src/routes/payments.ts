// Payments routes — track and manage school fee payments
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, paymentsTable, usersTable, activityLogTable, notificationsTable } from "@workspace/db";
import {
  RecordPaymentBody,
  GetPaymentParams,
} from "@workspace/api-zod";
import { requireAuth, requireTeacherOrOwner } from "../lib/auth-middleware";

const router: IRouter = Router();

// GET /payments — List payments (owner sees all, student sees own)
router.get("/payments", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;

  let payments;
  if (currentUser.role === "owner" || currentUser.role === "teacher") {
    // Owner/teacher sees all payments
    payments = await db.select().from(paymentsTable).orderBy(paymentsTable.createdAt);
  } else {
    // Student sees only their own payments
    payments = await db.select().from(paymentsTable)
      .where(eq(paymentsTable.studentId, currentUser.id))
      .orderBy(paymentsTable.createdAt);
  }

  res.json(payments.map(p => ({
    ...p,
    amount: Number(p.amount),
    createdAt: p.createdAt.toISOString(),
  })));
});

// POST /payments — Record a payment (teacher/owner only)
router.post("/payments", requireAuth, requireTeacherOrOwner, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;

  const parsed = RecordPaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Get student name
  const [student] = await db.select().from(usersTable).where(eq(usersTable.id, parsed.data.studentId));
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  const [payment] = await db.insert(paymentsTable).values({
    ...parsed.data,
    studentName: student.name,
    recordedBy: currentUser.id,
    amount: String(parsed.data.amount),
  }).returning();

  // Update student's lastPaymentDate if status is paid
  if (parsed.data.status === "paid") {
    await db.update(usersTable)
      .set({ lastPaymentDate: new Date().toISOString() })
      .where(eq(usersTable.id, parsed.data.studentId));
  }

  // Log activity
  await db.insert(activityLogTable).values({
    type: "payment_recorded",
    description: `Payment of $${parsed.data.amount} recorded for ${student.name} (${parsed.data.month} ${parsed.data.year})`,
    actorName: currentUser.name,
  });

  // If overdue, send notification
  if (parsed.data.status === "overdue") {
    await db.insert(notificationsTable).values({
      recipientId: parsed.data.studentId,
      title: "Payment Overdue",
      message: `Your payment for ${parsed.data.month} ${parsed.data.year} is overdue. Please pay your school fees to avoid account suspension.`,
      type: "payment_overdue",
      isRead: false,
    });
  }

  res.status(201).json({
    ...payment,
    amount: Number(payment.amount),
    createdAt: payment.createdAt.toISOString(),
  });
});

// GET /payments/:id — Get payment by ID
router.get("/payments/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetPaymentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, params.data.id));
  if (!payment) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }

  res.json({
    ...payment,
    amount: Number(payment.amount),
    createdAt: payment.createdAt.toISOString(),
  });
});

export default router;
