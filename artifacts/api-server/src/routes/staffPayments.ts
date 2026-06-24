import { Router } from "express";
import { db } from "@workspace/db";
import { staffPaymentsTable, usersTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";

const router = Router();

router.get("/staff-payments", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  if (user.role !== "owner") { res.status(403).json({ error: "Forbidden" }); return; }
  const rows = await db.select().from(staffPaymentsTable).orderBy(desc(staffPaymentsTable.createdAt));
  res.json(rows);
});

router.get("/staff-payments/my", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const rows = await db.select().from(staffPaymentsTable)
    .where(eq(staffPaymentsTable.recipientId, user.id))
    .orderBy(desc(staffPaymentsTable.createdAt));
  res.json(rows);
});

router.get("/staff-payments/summary", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  if (user.role !== "owner") { res.status(403).json({ error: "Forbidden" }); return; }
  const rows = await db.select().from(staffPaymentsTable);
  const total = rows.reduce((s: number, r: any) => s + parseFloat(r.amount ?? "0"), 0);
  const byRole: Record<string, number> = {};
  rows.forEach((r: any) => {
    byRole[r.recipientRole] = (byRole[r.recipientRole] ?? 0) + parseFloat(r.amount ?? "0");
  });
  res.json({ total, byRole, count: rows.length });
});

router.post("/staff-payments", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  if (user.role !== "owner") { res.status(403).json({ error: "Forbidden" }); return; }
  const { recipientId, amount, reason, description, paymentMethod, referenceNumber, period } = req.body;
  if (!recipientId || !amount) { res.status(400).json({ error: "recipientId and amount required" }); return; }
  const [recipient] = await db.select().from(usersTable).where(eq(usersTable.id, recipientId));
  if (!recipient) { res.status(404).json({ error: "Recipient not found" }); return; }
  const [row] = await db.insert(staffPaymentsTable).values({
    recipientId, recipientName: recipient.name, recipientRole: recipient.role,
    amount, reason: reason ?? "salary", description,
    paymentMethod: paymentMethod ?? "bank_transfer", referenceNumber, period,
    paidBy: user.id, paidByName: user.name,
  }).returning();
  res.status(201).json(row);
});

router.delete("/staff-payments/:id", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  if (user.role !== "owner") { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(staffPaymentsTable).where(eq(staffPaymentsTable.id, parseInt(String(req.params.id))));
  res.json({ ok: true });
});

export default router;
