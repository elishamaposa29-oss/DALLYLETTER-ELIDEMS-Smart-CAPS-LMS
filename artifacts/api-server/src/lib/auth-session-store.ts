import crypto from "node:crypto";
import { pool } from "@workspace/db";

const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;

function digest(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function ensureAuthSessionSchema(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash text PRIMARY KEY,
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query("CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions(expires_at)");
  await pool.query(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_hash text PRIMARY KEY,
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query("CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens(user_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS password_reset_tokens_expiry_idx ON password_reset_tokens(expires_at)");
}

export async function createAuthSession(token: string, userId: number): Promise<void> {
  await pool.query(
    "INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3) ON CONFLICT (token_hash) DO UPDATE SET user_id = EXCLUDED.user_id, expires_at = EXCLUDED.expires_at, revoked_at = NULL",
    [digest(token), userId, new Date(Date.now() + SESSION_TTL_MS)],
  );
}

export async function isAuthSessionActive(token: string): Promise<boolean> {
  const result = await pool.query(
    "SELECT 1 FROM auth_sessions WHERE token_hash = $1 AND expires_at > now() AND revoked_at IS NULL LIMIT 1",
    [digest(token)],
  );
  return result.rowCount === 1;
}

export async function revokeAuthSession(token: string): Promise<void> {
  await pool.query("UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE token_hash = $1", [digest(token)]);
}

export async function revokeUserSessions(userId: number): Promise<void> {
  await pool.query("UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = $1", [userId]);
}

export async function createPasswordResetToken(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  await pool.query("UPDATE password_reset_tokens SET used_at = COALESCE(used_at, now()) WHERE user_id = $1 AND used_at IS NULL", [userId]);
  await pool.query(
    "INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
    [digest(token), userId, new Date(Date.now() + RESET_TTL_MS)],
  );
  return token;
}

export async function consumePasswordResetToken(token: string, passwordHash: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      "SELECT user_id FROM password_reset_tokens WHERE token_hash = $1 AND expires_at > now() AND used_at IS NULL FOR UPDATE",
      [digest(token)],
    );
    if (!found.rows[0]) {
      await client.query("ROLLBACK");
      return false;
    }
    const userId = Number(found.rows[0].user_id);
    await client.query("UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2", [passwordHash, userId]);
    await client.query("UPDATE password_reset_tokens SET used_at = now() WHERE token_hash = $1", [digest(token)]);
    await client.query("UPDATE password_reset_tokens SET used_at = COALESCE(used_at, now()) WHERE user_id = $1 AND used_at IS NULL", [userId]);
    await client.query("UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = $1", [userId]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
