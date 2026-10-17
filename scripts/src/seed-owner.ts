import crypto from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db, pool, usersTable } from "@workspace/db";

function hashPassword(value: string): string {
  return crypto.createHash("sha256").update(value + "dallyletter_salt_2024").digest("hex");
}

async function seedOwner(): Promise<void> {
  const email = process.env.OWNER_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.OWNER_BOOTSTRAP_PASSWORD;
  const name = process.env.OWNER_BOOTSTRAP_NAME?.trim() || "Platform Owner";

  // Never ship or create a default owner credential. A new database can be
  // provisioned by setting one-time/managed Render environment secrets. When
  // absent, skip seeding so the build remains safe and ordinary signup works.
  if (!email || !password) {
    console.log("Owner bootstrap skipped: OWNER_BOOTSTRAP_EMAIL/PASSWORD are not configured.");
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("OWNER_BOOTSTRAP_EMAIL must be a valid email address.");
  }
  if (password.length < 12) {
    throw new Error("OWNER_BOOTSTRAP_PASSWORD must contain at least 12 characters.");
  }

  const result = await db.transaction(async (tx) => {
    const [existingPrivileged] = await tx
      .select({ email: usersTable.email, role: usersTable.role })
      .from(usersTable)
      .where(inArray(usersTable.role, ["owner", "admin"]))
      .limit(1);

    if (existingPrivileged) {
      return { created: false, user: existingPrivileged };
    }

    const [existingEmail] = await tx
      .select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    if (existingEmail) {
      throw new Error("OWNER_BOOTSTRAP_EMAIL is already registered without owner privileges; no role was changed.");
    }

    const [user] = await tx
      .insert(usersTable)
      .values({
        email,
        passwordHash: hashPassword(password),
        name,
        role: "owner",
        isPrefect: false,
        isManager: false,
        isBlocked: false,
        isSuspended: false,
      })
      .returning({ email: usersTable.email, role: usersTable.role });

    return { created: true, user };
  });

  console.log(
    result.created
      ? "Owner bootstrap account created from configured environment secrets."
      : `Privileged account already exists: ${result.user.email} (${result.user.role}); no account changed.`,
  );
}

try {
  await seedOwner();
} finally {
  await pool.end();
}
