// Payments routes — track and manage school fee payments
import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import crypto from "node:crypto";
import { db, paymentsTable, usersTable, activityLogTable, notificationsTable } from "@workspace/db";
import {
  RecordPaymentBody,
  GetPaymentParams,
} from "@workspace/api-zod";
import { requireAuth, requireTeacherOrOwner } from "../lib/auth-middleware";

const router: IRouter = Router();

function paynowHash(values: Record<string, string>, key: string): string {
  const raw = Object.entries(values).filter(([name]) => name.toLowerCase() !== "hash").map(([, value]) => value ?? "").join("") + key;
  return crypto.createHash("sha512").update(raw, "utf8").digest("hex").toUpperCase();
}

function parsePaynow(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(text)) out[key.toLowerCase()] = value;
  return out;
}

router.post("/payments/paynow/create", requireAuth, async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (user.role !== "student") { res.status(403).json({ error: "Learner access required" }); return; }
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) { res.status(400).json({ error: "Enter a valid payment amount" }); return; }
  const integrationId = process.env.PAYNOW_INTEGRATION_ID;
  const integrationKey = process.env.PAYNOW_INTEGRATION_KEY;
  const publicBase = (process.env.PUBLIC_APP_URL || process.env.VITE_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const publicApi = (process.env.PUBLIC_API_URL || "").replace(/\/$/, "");
  if (!integrationId || !integrationKey || !publicBase || !publicApi) {
    res.status(503).json({ error: "Live Paynow payments are not configured yet. Add PAYNOW_INTEGRATION_ID, PAYNOW_INTEGRATION_KEY, PUBLIC_APP_URL and PUBLIC_API_URL to the server secrets." });
    return;
  }
  const reference = "DL-" + user.id + "-" + Date.now();
  const now = new Date();
  const month = now.toLocaleString("en-US", { month: "long" });
  await db.insert(paymentsTable).values({ studentId: user.id, studentName: user.name, amount: amount.toFixed(2), month, year: now.getUTCFullYear(), status: "pending", notes: "Paynow reference " + reference, recordedBy: user.id });
  const fields: Record<string,string> = {
    id: integrationId, reference, amount: amount.toFixed(2),
    additionalinfo: "DallyLetter Elidems school payment",
    returnurl: publicBase + "/student/payments?reference=" + encodeURIComponent(reference),
    resulturl: publicApi + "/api/payments/paynow/result",
    authemail: user.email, status: "Message",
  };
  fields.hash = paynowHash(fields, integrationKey);
  try {
    const response = await fetch("https://www.paynow.co.zw/interface/initiatetransaction", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
    });
    const parsed = parsePaynow(await response.text());
    if (parsed.status?.toLowerCase() === "error") { res.status(502).json({ error: parsed.error || "Paynow rejected the transaction" }); return; }
    if (!parsed.browserurl) { res.status(502).json({ error: "Paynow did not return a checkout URL" }); return; }
    res.status(201).json({ reference, checkoutUrl: parsed.browserurl, status: parsed.status || "ok" });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Paynow is unavailable" });
  }
});

router.post("/payments/paynow/result", async (req, res): Promise<void> => {
  const integrationKey = process.env.PAYNOW_INTEGRATION_KEY;
  if (!integrationKey) { res.status(503).send("Paynow integration is not configured"); return; }
  const body: Record<string,string> = {};
  for (const [key, value] of Object.entries(req.body ?? {})) body[String(key).toLowerCase()] = String(value ?? "");
  if (!body.hash || body.hash.toUpperCase() !== paynowHash(body, integrationKey)) { res.status(400).send("Invalid hash"); return; }
  const reference = body.reference;
  const status = body.status || "Unknown";
  if (reference) {
    const normalizedStatus = status.toLowerCase() === "paid" ? "paid" : status.toLowerCase() === "cancelled" ? "pending" : "pending";
    await db.execute(sql`UPDATE payments SET status = ${normalizedStatus}, notes = CONCAT(COALESCE(notes, ''), CASE WHEN COALESCE(notes,'') = '' THEN '' ELSE ' | ' END, 'Paynow ', ${status}, ' ref ', ${reference}) WHERE notes LIKE ${"%" + reference + "%"}`);
  }
  res.status(200).send("OK");
});

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

// POST /payments/notify-admin — Student self-reports a payment, notifies all owners
router.post("/payments/notify-admin", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;

  if (currentUser.role !== "student") {
    res.status(403).json({ error: "Only students can report payments" });
    return;
  }

  const { amount } = req.body;

  // Find all owner accounts
  const owners = await db.select().from(usersTable).where(eq(usersTable.role, "owner"));

  const amountStr = amount ? `$${Number(amount).toFixed(2)}` : "an amount";

  // Send notification to each owner
  for (const owner of owners) {
    await db.insert(notificationsTable).values({
      recipientId: owner.id,
      title: "💳 Payment Reported by Learner",
      message: `${currentUser.name} has reported paying ${amountStr} via PayPal. Please verify the payment and update their records accordingly.`,
      type: "payment_overdue",
      isRead: false,
    });
  }

  // Log activity
  await db.insert(activityLogTable).values({
    type: "payment_recorded",
    description: `${currentUser.name} self-reported a PayPal payment of ${amountStr}. Awaiting admin verification.`,
    actorName: currentUser.name,
  });

  res.json({ success: true });
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
