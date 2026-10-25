/** Public signup may create learner accounts or submit teacher applications only. */
export function isAllowedPublicRegistrationRole(role: unknown): boolean {
  return typeof role === "string" && ["student", "teacher"].includes(role.trim().toLowerCase());
}
