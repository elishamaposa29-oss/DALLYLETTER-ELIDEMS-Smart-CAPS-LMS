export const ACADEMIC_YEAR_TIME_ZONE = "Africa/Harare";

/**
 * CAPS school years in the Dallyletter deployment follow the January–December
 * calendar year. Resolve the year in the school timezone, not the server's UTC
 * timezone, so requests around midnight on 31 December remain consistent.
 */
export function getCurrentAcademicYear(now: Date = new Date()) {
  const academicYear = new Intl.DateTimeFormat("en", {
    timeZone: ACADEMIC_YEAR_TIME_ZONE,
    year: "numeric",
  }).format(now);
  return {
    academicYear,
    startDate: academicYear + "-01-01",
    endDate: academicYear + "-12-31",
    timeZone: ACADEMIC_YEAR_TIME_ZONE,
  };
}

function dateParts(value: unknown): { year: number; month: number; day: number } | null {
  const raw = value instanceof Date
    ? value.toISOString().slice(0, 10)
    : typeof value === "string" ? value.slice(0, 10) : "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) return null;
  return { year, month, day };
}

/** Returns null for invalid/future dates and handles birthdays not yet reached this year. */
export function calculateAgeOnDate(dateOfBirth: unknown, onDate: unknown = new Date()): number | null {
  const birth = dateParts(dateOfBirth);
  const reference = dateParts(onDate);
  if (!birth || !reference) return null;
  let age = reference.year - birth.year;
  if (reference.month < birth.month || (reference.month === birth.month && reference.day < birth.day)) age -= 1;
  return age >= 0 ? age : null;
}
