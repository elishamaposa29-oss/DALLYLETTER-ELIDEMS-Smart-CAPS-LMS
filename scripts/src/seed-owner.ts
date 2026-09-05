import crypto from "node:crypto";
import { inArray } from "drizzle-orm";
import { db, pool, usersTable } from "@workspace/db";

const candidates = [
  "elishamaposa29@gmail.com",
  "elishamaposa430@gmail.com",
  "maposadallyletter@gmail.com",
] as const;
const password = "ElishaMaposa2008DEM";

function hashPassword(value: string): string {
  return crypto.createHash("sha256").update(value + "dallyletter_salt_2024").digest("hex");
}

async function seedOwner(): Promise<void> {
  const result = await db.transaction(async (tx) => {
    const [existingPrivileged] = await tx
      .select({ email: usersTable.email, role: usersTable.role })
      .from(usersTable)
      .where(inArray(usersTable.role, ["owner", "admin"]))
      .limit(1);

    if (existingPrivileged) {
      return { created: false, user: existingPrivileged };
    }

    const existingCandidates = await tx
      .select({ email: usersTable.email })
      .from(usersTable)
      .where(inArray(usersTable.email, [...candidates]));
    const occupied = new Set(existingCandidates.map(({ email }) => email));
    const email = candidates.find((candidate) => !occupied.has(candidate));
    if (!email) {
      throw new Error("All configured Owner email candidates are already registered");
    }

    const [user] = await tx
      .insert(usersTable)
      .values({
        email,
        passwordHash: hashPassword(password),
        name: "Elisha Maposa",
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
      ? `Created Owner: ${result.user.email}`
      : `Privileged account exists: ${result.user.email} (${result.user.role})`,
  );
}

try {
  await seedOwner();
} finally {
  await pool.end();
}