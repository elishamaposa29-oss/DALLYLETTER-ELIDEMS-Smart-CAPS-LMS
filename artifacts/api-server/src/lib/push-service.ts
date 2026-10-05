import { createCipheriv, createHmac, createPrivateKey, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { pool } from "@workspace/db";

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

function publicKeyRaw(key: ReturnType<typeof generateKeyPairSync>["publicKey"]): Buffer {
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
  return vapidConfig() !== null;
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
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

  const uaKey = createPrivateKey({
    key: {
      kty: "EC", crv: "P-256",
      x: b64(uaRaw.subarray(1, 33)),
      y: b64(uaRaw.subarray(33, 65)),
    },
    format: "jwk",
  });
  const ephemeral = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const asRaw = publicKeyRaw(ephemeral.publicKey);
  const ecdhSecret = require("node:crypto").diffieHellman({ privateKey: ephemeral.privateKey, publicKey: uaKey }) as Buffer;

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
  const { rows } = await pool.query(`
    SELECT n.id, n.recipient_id, n.title, n.message, n.link,
           ps.id AS subscription_id, ps.endpoint, ps.p256dh, ps.auth
    FROM notifications n
    JOIN push_subscriptions ps ON (n.recipient_id = ps.user_id OR n.recipient_id IS NULL)
    LEFT JOIN notification_preferences np ON np.user_id = ps.user_id
    WHERE n.push_sent_at IS NULL
      AND COALESCE(np.push_enabled, true) = true
      AND n.created_at > now() - interval '24 hours'
    ORDER BY n.id ASC
    LIMIT 100
  `);
  const grouped = new Map<number, typeof rows>();
  for (const row of rows) grouped.set(row.id, [...(grouped.get(row.id) ?? []), row]);

  for (const [notificationId, subscriptions] of grouped) {
    let retry = false;
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
        if (result === "gone") await pool.query("DELETE FROM push_subscriptions WHERE id = $1", [sub.subscription_id]);
      } catch {
        retry = true;
      }
    }
    if (!retry) await pool.query("UPDATE notifications SET push_sent_at = now() WHERE id = $1", [notificationId]);
  }
}

export function startPushDispatcher(): void {
  if (!isPushConfigured()) return;
  const run = () => dispatchPendingPushNotifications().catch(() => undefined);
  void run();
  setInterval(run, 5000).unref();
}
