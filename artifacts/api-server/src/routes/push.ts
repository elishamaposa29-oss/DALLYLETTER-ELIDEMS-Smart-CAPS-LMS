import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../lib/auth-middleware";
import { getVapidPublicKey, isPushConfigured } from "../lib/push-service";

const router = Router();

router.get("/push/config", requireAuth, (_req, res) => {
  res.json({ enabled: isPushConfigured(), publicKey: getVapidPublicKey() });
});

router.post("/push/subscriptions", requireAuth, async (req, res): Promise<void> => {
  if (!isPushConfigured()) { res.status(503).json({ error: "Background push is not configured on the server yet" }); return; }
  const userId = req.currentUser!.id;
  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint.trim() : "";
  const p256dh = typeof req.body?.keys?.p256dh === "string" ? req.body.keys.p256dh.trim() : "";
  const auth = typeof req.body?.keys?.auth === "string" ? req.body.keys.auth.trim() : "";
  if (!endpoint || !/^https:\/\//i.test(endpoint) || endpoint.length > 4096 || !p256dh || !auth) {
    res.status(400).json({ error: "A valid push subscription is required" }); return;
  }
  await pool.query(`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, updated_at = now()
  `, [userId, endpoint, p256dh, auth]);
  res.status(201).json({ ok: true });
});

router.delete("/push/subscriptions", requireAuth, async (req, res): Promise<void> => {
  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint.trim() : "";
  if (!endpoint) { res.status(400).json({ error: "Endpoint required" }); return; }
  await pool.query("DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2", [req.currentUser!.id, endpoint]);
  res.json({ ok: true });
});

export default router;
