import { createHash, randomBytes } from "node:crypto";

const SCHOOL_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 80 random bits plus a SHA-256-derived check character. */
export function createSchoolId(): string {
  const bytes = randomBytes(16);
  let raw = "";
  for (let index = 0; index < bytes.length; index++) raw += SCHOOL_ID_ALPHABET[bytes[index] % SCHOOL_ID_ALPHABET.length];
  const checksum = createHash("sha256").update(raw).digest()[0] % SCHOOL_ID_ALPHABET.length;
  return "DL-" + raw + SCHOOL_ID_ALPHABET[checksum];
}

export function isValidSchoolId(value: unknown): value is string {
  const code = String(value || "").trim().toUpperCase();
  if (!/^DL-[A-HJ-NP-Z2-9]{17}$/.test(code)) return false;
  const raw = code.slice(3, 19);
  const expected = SCHOOL_ID_ALPHABET[createHash("sha256").update(raw).digest()[0] % SCHOOL_ID_ALPHABET.length];
  return code[19] === expected;
}
