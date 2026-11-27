import type { NextFunction, Request, Response } from "express";
import { pool } from "@workspace/db";
import { classifyIdempotencyRecord, hashIdempotentRequest, isValidIdempotencyKey } from "./idempotency-core";

let schemaReady: Promise<void> | null = null;
async function ensureSchema(): Promise<void> {
  if (!schemaReady) schemaReady = (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS api_idempotency_records (
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      idempotency_key text NOT NULL,
      request_hash char(64) NOT NULL,
      state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','complete')),
      response_status integer,
      response_body jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL DEFAULT (now() + interval '60 days'),
      PRIMARY KEY (user_id, idempotency_key)
    )`);
    await pool.query("CREATE INDEX IF NOT EXISTS api_idempotency_expiry_idx ON api_idempotency_records(expires_at)");
    await pool.query("DELETE FROM api_idempotency_records WHERE expires_at < now()");
  })().catch(error => { schemaReady = null; throw error; });
  return schemaReady;
}

/** Server-side replay protection for authenticated write requests. Keys are scoped to
 * the authenticated account and bound to a canonical request-body hash. */
export async function idempotencyMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const rawKey = req.get("Idempotency-Key") || (typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey : undefined);
  if (!rawKey) { next(); return; }
  const userId = Number(req.currentUser?.id);
  if (!Number.isSafeInteger(userId) || userId < 1) { res.status(401).json({ error: "Authentication required" }); return; }
  const key = rawKey.trim();
  if (!isValidIdempotencyKey(key)) { res.status(400).json({ error: "Invalid Idempotency-Key" }); return; }
  try {
    await ensureSchema();
    await pool.query("DELETE FROM api_idempotency_records WHERE user_id=$1 AND idempotency_key=$2 AND expires_at<now()", [userId, key]);
    const requestHash = hashIdempotentRequest(req.method, req.originalUrl, req.body ?? null);
    const inserted = await pool.query(
      "INSERT INTO api_idempotency_records(user_id,idempotency_key,request_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING idempotency_key",
      [userId, key, requestHash],
    );
    if (!inserted.rowCount) {
      const existing = await pool.query(
        "SELECT request_hash,state,response_status,response_body FROM api_idempotency_records WHERE user_id=$1 AND idempotency_key=$2 AND expires_at>now()",
        [userId, key],
      );
      const record = existing.rows[0];
      if (!record) { res.status(409).json({ error: "Idempotency record is being recovered; retry with the same key shortly." }); return; }
      const decision = classifyIdempotencyRecord({ requestHash:record.request_hash, state:record.state, responseStatus:record.response_status == null ? null : Number(record.response_status), responseBody:record.response_body }, requestHash);
      if (decision.kind === "conflict") { res.status(409).json({ error: "This Idempotency-Key was already used with a different request body." }); return; }
      if (decision.kind === "pending") {
        res.setHeader("Retry-After", "3");
        res.status(409).json({ error: "An operation with this key is still processing. Retry with the same key." });
        return;
      }
      res.setHeader("Idempotency-Replayed", "true");
      res.status(decision.status).json(decision.body);
      return;
    }

    const sendJson = res.json.bind(res);
    let sent = false;
    res.json = ((body: unknown) => {
      if (sent) return res;
      sent = true;
      const status = res.statusCode;
      if (status >= 200 && status < 300) {
        void pool.query(
          "UPDATE api_idempotency_records SET state='complete',response_status=$3,response_body=$4::jsonb WHERE user_id=$1 AND idempotency_key=$2",
          [userId, key, status, JSON.stringify(body ?? null)],
        ).then(() => sendJson(body)).catch(() => {
          if (!res.headersSent) { res.statusCode = 503; sendJson({ error: "The operation was processed but its acknowledgement could not be stored. Retry with the same key." }); }
        });
      } else {
        void pool.query("DELETE FROM api_idempotency_records WHERE user_id=$1 AND idempotency_key=$2", [userId, key])
          .finally(() => sendJson(body));
      }
      return res;
    }) as Response["json"];
    next();
  } catch {
    res.status(503).json({ error: "Idempotency protection is temporarily unavailable. No submission was accepted." });
  }
}
