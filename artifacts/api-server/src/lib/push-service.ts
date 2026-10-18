import { createCipheriv, createHmac, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, diffieHellman, type KeyObject } from "node:crypto";
import { pool } from "@workspace/db";
import { logger } from "./logger";

const b64 = (value: Buffer | string) => Buffer.from(value).toString("base64url");
const fromB64 = (value: string) => Buffer.from(value, "base64url");

function hkdfExtract(salt: Buffer, ikm: Buffer): Buffer {
  return createHmac("sha256", salt).update(ikm).digest();
}

function hkdfExpand(prk: Buffer, info: Buffer, length: number): Buffer {
  let previous = Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for (let counter = 1; Buffer.concat(chunks).length < length; counter++) {
    previous = createHmac("sha256", prk).update(Buffer.concat([previous, info, Buffer.from([counter])])).digest();
    chunks.push(previous);
  }
  return Buffer.concat(chunks).subarray(0, length);
}

function publicKeyRaw(key: KeyObject): Buffer {
  const jwk = key.export({ format: "jwk" }) as { x: string; y: string };
  return Buffer.concat([Buffer.from([4]), fromB64(jwk.x), fromB64(jwk.y)]);
}

function vapidConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  const rawPublic = fromB64(publicKey);
  const rawPrivate = fromB64(privateKey);
  if (rawPublic.length !== 65 || rawPublic[0] !== 4 || rawPrivate.length !== 32) throw new Error("Invalid VAPID key format");
  const key = createPrivateKey({
    key: {
      kty: "EC", crv: "P-256",
      x: b64(rawPublic.subarray(1, 33)),
      y: b64(rawPublic.subarray(33, 65)),
      d: b64(rawPrivate),
    },
    format: "jwk",
  });
  return { publicKey: b64(rawPublic), rawPublic, key, subject };
}

export function isPushConfigured(): boolean {
  try { return vapidConfig() !== null; }
  catch { return false; }
}

export function getVapidPublicKey(): string | null {
  try { return vapidConfig()?.publicKey ?? null; }
  catch { return null; }
}

function vapidJwt(endpoint: string, cfg: NonNullable<ReturnType<typeof vapidConfig>>): string {
  const header = b64(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64(Buffer.from(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: cfg.subject,
  })));
  const input = `${header}.${payload}`;
  const signature = sign("sha256", Buffer.from(input), { key: cfg.key, dsaEncoding: "ieee-p1363" });
  return `${input}.${b64(signature)}`;
}

async function encryptPayload(payload: string, p256dh: string, auth: string): Promise<Buffer> {
  const uaRaw = fromB64(p256dh);
  const authSecret = fromB64(auth);
  if (uaRaw.length !== 65 || uaRaw[0] !== 4 || authSecret.length !== 16) throw new Error("Invalid push subscription keys");

  // Subscription p256dh is a public key. Import it as a public KeyObject;
  // createPrivateKey rejects a JWK that has no private d member.
  const uaKey = createPublicKey({
    key: {
      kty: "EC", crv: "P-256",
      x: b64(uaRaw.subarray(1, 33)),
      y: b64(uaRaw.subarray(33, 65)),
    },
    format: "jwk",
  });
  const ephemeral = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const asRaw = publicKeyRaw(ephemeral.publicKey);
  const ecdhSecret = diffieHellman({ privateKey: ephemeral.privateKey, publicKey: uaKey });

  const prkKey = hkdfExtract(authSecret, ecdhSecret);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info"), Buffer.from([0]), uaRaw, asRaw]);
  const ikm = hkdfExpand(prkKey, keyInfo, 32);
  const salt = randomBytes(16);
  const prk = hkdfExtract(salt, ikm);
  const cek = hkdfExpand(prk, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdfExpand(prk, Buffer.from("Content-Encoding: nonce\0"), 12);

  const plaintext = Buffer.concat([Buffer.from(payload, "utf8"), Buffer.from([2])]);
  const recordSize = 4096;
  if (plaintext.length + 16 >= recordSize) throw new Error("Push payload too large");
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.concat([
    salt,
    Buffer.from([0, 0, 16, 0]),
    Buffer.from([asRaw.length]),
    asRaw,
  ]);
  return Buffer.concat([header, ciphertext]);
}

async function sendOne(endpoint: string, p256dh: string, auth: string, payload: string): Promise<"ok" | "gone"> {
  const cfg = vapidConfig();
  if (!cfg) throw new Error("VAPID is not configured");
  const body = await encryptPayload(payload, p256dh, auth);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${vapidJwt(endpoint, cfg)}, k=${cfg.publicKey}`,
      TTL: "60",
      Urgency: "normal",
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
    },
    body,
  });
  if (response.status === 404 || response.status === 410) return "gone";
  if (!response.ok) throw new Error(`Push service returned HTTP ${response.status}`);
  return "ok";
}

export async function dispatchPendingPushNotifications(): Promise<void> {
  if (!isPushConfigured()) return;

  // Cap each recipient to ten newest notifications per dispatch, not ten
  // globally. Broadcast notifications are fanned out to each subscribed user.
  const { rows } = await pool.query(`
    WITH eligible AS (
      SELECT n.id, n.recipient_id, n.title, n.message, n.link, n.created_at, n.push_attempts,
             ps.id AS subscription_id, ps.user_id, ps.endpoint, ps.p256dh, ps.auth,
             ROW_NUMBER() OVER (
               PARTITION BY ps.user_id
               ORDER BY n.created_at DESC, n.id DESC
             ) AS recipient_rank
      FROM notifications n
      JOIN push_subscriptions ps ON (n.recipient_id = ps.user_id OR n.recipient_id IS NULL)
      LEFT JOIN notification_preferences np ON np.user_id = ps.user_id
      WHERE n.push_sent_at IS NULL
        AND n.is_read = false
        AND COALESCE(np.push_enabled, true) = true
        AND (n.push_next_attempt_at IS NULL OR n.push_next_attempt_at <= now())
    )
    SELECT id, recipient_id, title, message, link, push_attempts, subscription_id, user_id, endpoint, p256dh, auth
    FROM eligible
    WHERE recipient_rank <= 10
    ORDER BY created_at DESC, id DESC
  `);
  const grouped = new Map<number, typeof rows>();
  for (const row of rows) grouped.set(row.id, [...(grouped.get(row.id) ?? []), row]);

  for (const [notificationId, subscriptions] of grouped) {
    let retry = false;
    let delivered = false;
    let lastError = "delivery_failed";
    for (const sub of subscriptions) {
      try {
        const result = await sendOne(sub.endpoint, sub.p256dh, sub.auth, JSON.stringify({
          id: notificationId,
          title: sub.title,
          body: sub.message,
          url: sub.link || "/student/notifications",
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
        }));
        if (result === "gone") {
          await pool.query("DELETE FROM push_subscriptions WHERE id = $1", [sub.subscription_id]);
        } else {
          delivered = true;
          logger.info({ notificationId, subscriptionId: sub.subscription_id }, "Web push notification delivered");
        }
      } catch (error) {
        retry = true;
        lastError = error instanceof Error ? error.message.slice(0, 300) : "Unknown push delivery error";
        let endpointHost = "invalid-endpoint";
        try { endpointHost = new URL(sub.endpoint).host; } catch { /* Never log subscription secrets. */ }
        logger.warn({
          notificationId,
          subscriptionId: sub.subscription_id,
          endpointHost,
          error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 300) } : "Unknown push delivery error",
        }, "Web push delivery failed; notification remains eligible for retry");
      }
    }
    if (!retry) {
      await pool.query(
        "UPDATE notifications SET push_sent_at = now(), push_next_attempt_at = NULL, push_last_error = $2 WHERE id = $1",
        [notificationId, delivered ? null : "All push subscriptions expired (HTTP 404/410)"],
      );
    } else {
      // Retry with bounded exponential backoff; do not abandon notifications after 24 hours.
      const attempts = Math.max(0, Number(subscriptions[0]?.push_attempts) || 0);
      const delaySeconds = Math.min(3600, 15 * (2 ** Math.min(attempts, 8)));
      await pool.query(
        "UPDATE notifications SET push_attempts = COALESCE(push_attempts, 0) + 1, push_next_attempt_at = now() + ($2 * interval '1 second'), push_last_error = $3 WHERE id = $1",
        [notificationId, delaySeconds, lastError],
      );
    }
  }
}

export function startPushDispatcher(): void {
  if (!isPushConfigured()) {
    logger.warn({
      publicKeyConfigured: Boolean(process.env.VAPID_PUBLIC_KEY?.trim()),
      privateKeyConfigured: Boolean(process.env.VAPID_PRIVATE_KEY?.trim()),
      subjectConfigured: Boolean(process.env.VAPID_SUBJECT?.trim()),
    }, "Web push is disabled because VAPID configuration is missing or invalid");
    return;
  }
  const run = () => dispatchPendingPushNotifications().catch((error) => {
    logger.error({
      error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : "Unknown dispatcher error",
    }, "Web push dispatcher cycle failed");
  });
  void run();
  setInterval(run, 60000).unref();
}
