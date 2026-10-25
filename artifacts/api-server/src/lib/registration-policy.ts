/** Public signup accepts only canonical roles permitted by the request schema. */
export function isAllowedPublicRegistrationRole(role: unknown): boolean {
  return role === "student" || role === "teacher";
}
