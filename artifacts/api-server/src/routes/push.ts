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

router.post("/push/expo-subscriptions", requireAuth, async (req, res): Promise<void> => {
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  if (!/^(?:ExponentPushToken|ExpoPushToken)\[[^\]\s]{8,256}\]$/.test(token)) {
    res.status(400).json({ error: "A valid Expo push token is required" });
    return;
  }
  // Native Expo tokens share the durable subscription table but are explicitly
  // tagged so the dispatcher never attempts Web Push encryption on them.
  await pool.query(`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
    VALUES ($1,$2,'expo','expo')
    ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = 'expo', auth = 'expo', updated_at = now()
  `, [req.currentUser!.id, token]);
  res.status(201).json({ ok: true });
});

router.delete("/push/subscriptions", requireAuth, async (req, res): Promise<void> => {
  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint.trim() : "";
  if (!endpoint) { res.status(400).json({ error: "Endpoint required" }); return; }
  await pool.query("DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2", [req.currentUser!.id, endpoint]);
  res.json({ ok: true });
});


router.post("/push/test", requireAuth, async (req, res): Promise<void> => {
  const userId = req.currentUser!.id;
  const subscription = await pool.query("SELECT 1 FROM push_subscriptions WHERE user_id=$1 LIMIT 1", [userId]);
  if (!subscription.rows.length) { res.status(409).json({ error: "Enable push notifications on this device first, then retry this test" }); return; }
  if (!isPushConfigured()) {
    const native = await pool.query("SELECT 1 FROM push_subscriptions WHERE user_id=$1 AND p256dh='expo' AND auth='expo' LIMIT 1", [userId]);
    if (!native.rows.length) { res.status(503).json({ error: "Web Push is not configured and no native Expo push subscription is registered" }); return; }
  }
  const result = await pool.query(
    "INSERT INTO notifications (recipient_id,title,message,type,is_read,link) VALUES ($1,$2,$3,$4,false,$5) RETURNING id",
    [userId, "Dallyletter push delivery test", "If this appears as a device notification, push delivery reached your device.", "push_test", "/student/notifications"]
  );
  res.status(201).json({ ok: true, notificationId: Number(result.rows[0].id), message: "Test queued. The push dispatcher will send it and retry temporary failures." });
});

router.get("/push/test/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid test ID" }); return; }
  const result = await pool.query(
    "SELECT id,push_sent_at,push_attempts,push_next_attempt_at,push_last_error FROM notifications WHERE id=$1 AND recipient_id=$2 AND type='push_test' LIMIT 1",
    [id, req.currentUser!.id]
  );
  if (!result.rows[0]) { res.status(404).json({ error: "Push test not found" }); return; }
  const row = result.rows[0];
  res.json({ id: Number(row.id), acceptedByPushService: Boolean(row.push_sent_at) && !row.push_last_error, dispatchComplete: Boolean(row.push_sent_at), attempts: Number(row.push_attempts || 0), nextAttemptAt: row.push_next_attempt_at, lastError: row.push_last_error ? String(row.push_last_error).slice(0, 180) : null });
});

export default router;
