import crypto from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pool, usersTable } from "@workspace/db";

function hashPassword(value: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(value, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$16384$8$1$${salt.toString("hex")}$${derived.toString("hex")}`;
}

async function seedOwner(): Promise<void> {
  const email = process.env.OWNER_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.OWNER_BOOTSTRAP_PASSWORD;
  const name = process.env.OWNER_BOOTSTRAP_NAME?.trim() || "Platform Owner";

  // This is an explicit, operator-run recovery task, never a public signup route.
  // Without both protected secrets, do nothing.
  if (!email || !password) {
    console.log("Owner bootstrap skipped: OWNER_BOOTSTRAP_EMAIL/PASSWORD are not configured.");
    return;
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("OWNER_BOOTSTRAP_EMAIL must be a valid email.");
  }
  if (password.length < 12 || password.length > 256) {
    throw new Error("OWNER_BOOTSTRAP_PASSWORD must contain 12–256 characters.");
  }

  const resetId = process.env.OWNER_BOOTSTRAP_RESET_ID?.trim();
  if (resetId && !/^[A-Za-z0-9_-]{16,128}$/.test(resetId)) {
    throw new Error("OWNER_BOOTSTRAP_RESET_ID must be 16–128 letters, numbers, underscores, or hyphens.");
  }

  if (resetId) {
    // The seed command runs during the build, before the API server starts.
    // Ensure these tables exist before a recovery transaction touches them.
    await pool.query(`CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash text PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token_hash text PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS owner_bootstrap_reset_runs (
      reset_id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
  }

  const result = await db.transaction(async (tx) => {
    // Serialize concurrent bootstrap attempts so two jobs cannot both observe
    // an empty privileged-account set and create competing owners.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('dallyletter-owner-bootstrap'))`);

    const [targetAccount] = await tx.select({ id: usersTable.id, email: usersTable.email, role: usersTable.role })
      .from(usersTable).where(eq(usersTable.email, email)).limit(1);
    const [existingPrivileged] = await tx.select({ id: usersTable.id, email: usersTable.email, role: usersTable.role })
      .from(usersTable).where(inArray(usersTable.role, ["owner", "admin"])).limit(1);

    // Recovery only applies when the configured email is already an owner.
    // Never reset an unrelated admin/owner or promote a normal account while a
    // privileged account exists. The reset marker and credential change are atomic.
    if (targetAccount && targetAccount.role === "owner" && resetId) {
      const marker = await tx.execute(sql`INSERT INTO owner_bootstrap_reset_runs (reset_id)
        VALUES (${resetId}) ON CONFLICT (reset_id) DO NOTHING RETURNING reset_id`) as unknown as { rows?: unknown[] };
      if (marker.rows?.length) {
        const [user] = await tx.update(usersTable).set({
          passwordHash: hashPassword(password),
          isBlocked: false,
          isSuspended: false,
          updatedAt: new Date(),
        }).where(eq(usersTable.id, targetAccount.id))
          .returning({ email: usersTable.email, role: usersTable.role });
        await tx.execute(sql`UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = ${targetAccount.id}`);
        await tx.execute(sql`UPDATE password_reset_tokens SET used_at = COALESCE(used_at, now()) WHERE user_id = ${targetAccount.id} AND used_at IS NULL`);
        return { outcome: "reset" as const, user };
      }
      return { outcome: "unchanged" as const, user: targetAccount };
    }
    if (existingPrivileged) {
      return { outcome: "unchanged" as const, user: existingPrivileged };
    }

    const [existingEmail] = await tx.select({ id: usersTable.id, email: usersTable.email, role: usersTable.role })
      .from(usersTable).where(eq(usersTable.email, email)).limit(1);

    if (existingEmail) {
      const [user] = await tx.update(usersTable).set({
        passwordHash: hashPassword(password),
        role: "owner",
        isPrefect: false,
        isManager: false,
        isBlocked: false,
        isSuspended: false,
        updatedAt: new Date(),
      }).where(eq(usersTable.id, existingEmail.id))
        .returning({ email: usersTable.email, role: usersTable.role });
      return { outcome: "promoted" as const, user };
    }

    const [user] = await tx.insert(usersTable).values({
      email,
      passwordHash: hashPassword(password),
      name,
      role: "owner",
      isPrefect: false,
      isManager: false,
      isBlocked: false,
      isSuspended: false,
    }).returning({ email: usersTable.email, role: usersTable.role });
    return { outcome: "created" as const, user };
  });

  if (result.outcome === "unchanged") {
    console.log("Owner bootstrap made no changes because a privileged account already exists or the one-time reset was already consumed.");
  } else if (result.outcome === "reset") {
    console.log("Configured owner password reset applied once; existing sessions must be revoked by the owner.");
  } else if (result.outcome === "promoted") {
    console.log("Existing account promoted to owner using configured bootstrap secrets.");
  } else {
    console.log("Owner bootstrap account created using configured bootstrap secrets.");
  }
}

try {
  await seedOwner();
} finally {
  await pool.end();
}
