import crypto, { type ScryptOptions } from "node:crypto";

const LEGACY_SALT = "dallyletter_salt_2024";
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS: ScryptOptions = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function derive(password: string, salt: Buffer, length: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, length, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = await derive(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return `scrypt$16384$8$1$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export type PasswordVerification = { valid: boolean; needsRehash: boolean };

export async function verifyPassword(password: string, storedHash: string): Promise<PasswordVerification> {
  if (typeof storedHash !== "string") return { valid: false, needsRehash: false };

  const parts = storedHash.split("$");
  if (parts.length === 6 && parts[0] === "scrypt") {
    const [, n, r, p, saltHex, hashHex] = parts;
    if (n !== "16384" || r !== "8" || p !== "1" || !/^[a-f0-9]{32}$/i.test(saltHex) || !/^[a-f0-9]{128}$/i.test(hashHex)) {
      return { valid: false, needsRehash: false };
    }
    try {
      const salt = Buffer.from(saltHex, "hex");
      const expected = Buffer.from(hashHex, "hex");
      const actual = await derive(password, salt, expected.length, SCRYPT_OPTIONS);
      return { valid: crypto.timingSafeEqual(actual, expected), needsRehash: false };
    } catch {
      return { valid: false, needsRehash: false };
    }
  }

  // Backward compatibility for existing accounts. A successful legacy login
  // triggers an upgrade to scrypt in the caller, without forcing a password reset.
  if (!/^[a-f0-9]{64}$/i.test(storedHash)) return { valid: false, needsRehash: false };
  const expectedLegacy = Buffer.from(storedHash, "hex");
  const actualLegacy = crypto.createHash("sha256").update(password + LEGACY_SALT).digest();
  const valid = expectedLegacy.length === actualLegacy.length && crypto.timingSafeEqual(actualLegacy, expectedLegacy);
  return { valid, needsRehash: valid };
}
