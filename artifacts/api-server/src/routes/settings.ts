import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, platformSettingsTable } from "@workspace/db";
import { requireAuth, requireOwner } from "../lib/auth-middleware";

const router: IRouter = Router();

const DEFAULT_SETTINGS = {
  paypal_url: "",
  trust_wallet: "",
  ecocash_number: "",
  payment_instructions: "Pay your school fees using any of the methods below. After paying, click 'I\'ve Paid' to notify the school.",
};

// GET /settings — Public settings (payment info visible to all logged-in users)
router.get("/settings", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(platformSettingsTable);
  const settings: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  res.json(settings);
});

// PATCH /settings — Update settings (owner only)
router.patch("/settings", requireAuth, requireOwner, async (req, res): Promise<void> => {
  const updates = req.body as Record<string, string>;

  for (const [key, value] of Object.entries(updates)) {
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
    settings[row.key] = row.value;
  }
  res.json(settings);
});

export default router;
