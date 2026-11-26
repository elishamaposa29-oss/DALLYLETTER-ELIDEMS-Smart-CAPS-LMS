import { Router, type IRouter } from "express";
import { eq, sql, inArray } from "drizzle-orm";
import { db, auditLogsTable, platformSettingsTable, paymentsTable, usersTable } from "@workspace/db";
import { requireAuth, requireOwner } from "../lib/auth-middleware";

const router: IRouter = Router();

const PUBLIC_SETTING_KEYS = new Set(["paynow_url", "paypal_url", "trust_wallet", "ecocash_number", "payment_instructions", "docs_url", "school_fee_amount"]);

const DEFAULT_SETTINGS = {
  paynow_url: "",
  paypal_url: "",
  trust_wallet: "",
  ecocash_number: "",
  payment_instructions: "Pay your school fees using any of the methods below. After paying, click 'I\'ve Paid' to notify the school.",
  docs_url: "/docs",
  school_fee_amount: "",
};

// GET /settings — Public settings (payment info visible to all logged-in users)
router.get("/settings", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(platformSettingsTable);
  const settings: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (PUBLIC_SETTING_KEYS.has(row.key)) settings[row.key] = row.value;
  }
  res.json(settings);
});

// PATCH /settings — Update settings (owner only)
router.patch("/settings", requireAuth, requireOwner, async (req, res): Promise<void> => {
  const updates = Object.entries(req.body as Record<string, unknown>)
    .filter(([key, value]) => PUBLIC_SETTING_KEYS.has(key) && typeof value === "string") as [string, string][];
  const feeUpdate = updates.find(([key]) => key === "school_fee_amount");
  if (feeUpdate) {
    const raw = feeUpdate[1].trim();
    if (raw && (!/^\d{1,6}(?:\.\d{1,2})?$/.test(raw) || Number(raw) <= 0 || Number(raw) > 100000)) {
      res.status(400).json({ error: "Default school fee must be a positive amount up to 100000, or blank to leave unset." });
      return;
    }
  }

  for (const [key, value] of updates) {
    if (typeof value !== "string") continue;
    // Upsert each key
    const existing = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, key));
    if (existing.length > 0) {
      await db.update(platformSettingsTable).set({ value }).where(eq(platformSettingsTable.key, key));
    } else {
      await db.insert(platformSettingsTable).values({ key, value });
    }
  }

  const rows = await db.select().from(platformSettingsTable);
  const settings: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (PUBLIC_SETTING_KEYS.has(row.key)) settings[row.key] = row.value;
  }

  if (updates.length > 0) {
    await db.insert(auditLogsTable).values({
      action: "Updated platform payment settings",
      category: "admin",
      performedBy: req.currentUser!.id,
      details: JSON.stringify({ keys: updates.map(([key]) => key) }),
    });
  }

  res.json(settings);
});


// POST /settings/school-fees/apply — Owner applies the configured fee to a billing period.
// A transaction-scoped advisory lock plus existing-invoice check makes retries/concurrent clicks safe.
router.post("/settings/school-fees/apply", requireAuth, requireOwner, async (req, res): Promise<void> => {
  const rows = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, "school_fee_amount"));
  const amount = Number(rows[0]?.value ?? 0);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) { res.status(409).json({ error: "Set a valid default school fee before applying fees." }); return; }
  const now = new Date();
  const month = typeof req.body?.month === "string" && req.body.month.trim() ? req.body.month.trim() : now.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const year = Number(req.body?.year ?? now.getUTCFullYear());
  if (!/^[A-Za-z][A-Za-z -]{1,19}$/.test(month) || !Number.isInteger(year) || year < 2020 || year > 2200) { res.status(400).json({ error: "Choose a valid billing month and year." }); return; }
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"school-fees:" + month.toLowerCase() + ":" + year}))`);
    const learners = await tx.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.role, ["student", "learner"]));
    let created = 0, unchanged = 0;
    for (const learner of learners) {
      const existing = await tx.select({ id: paymentsTable.id }).from(paymentsTable).where(sql`${paymentsTable.studentId}=${learner.id} AND lower(${paymentsTable.month})=lower(${month}) AND ${paymentsTable.year}=${year}`).limit(1);
      if (existing.length) { unchanged++; continue; }
      await tx.insert(paymentsTable).values({ studentId: learner.id, studentName: learner.name, amount: amount.toFixed(2), month, year, status: "pending", notes: "Owner-applied school fee", recordedBy: req.currentUser!.id });
      created++;
    }
    await tx.insert(auditLogsTable).values({ action: "Applied school fees", category: "admin", performedBy: req.currentUser!.id, details: JSON.stringify({ month, year, amount: amount.toFixed(2), created, unchanged }) });
    return { created, unchanged };
  });
  res.json({ applied: true, month, year, amount, ...result });
});

export default router;
