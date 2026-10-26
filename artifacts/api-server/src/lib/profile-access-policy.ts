export function canReadPrivateUserProfile(actorId: number, targetId: number, canAccessSensitiveAccounts: boolean): boolean {
  return actorId === targetId || canAccessSensitiveAccounts;
}

/** Public/private profile boundary. Only the account owner/admin role family may inspect another user's private fields. */
export function canReadPrivateProfileByRole(actorId: number, targetId: number, actorRole: unknown): boolean {
  const role = typeof actorRole === "string" ? actorRole.trim().toLowerCase() : "";
  return actorId === targetId || role === "owner" || role === "admin" || role === "platform_owner";
}

/** Mask a payout destination before it crosses an owner-only preview response. */
export function maskPayoutDestination(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes("@")) {
    const [name, domain] = trimmed.split("@");
    return (name.length > 0 ? name.slice(0, 1) : "") + "****@" + domain;
  }
  if (trimmed.length >= 7) return trimmed.slice(0, 3) + "****" + trimmed.slice(-3);
  return "****";
}

export function serializePublicProfile(
  user: { id: number; name: string; avatarUrl: string | null; bio: string | null; role: string },
  qualifications: Array<{ title: string; verification_status: string }>,
  subjects: string[],
) {
  return {
    id: user.id,
    display_name: user.name,
    avatar: user.avatarUrl,
    bio: user.bio,
    role: user.role,
    verified_qualifications: qualifications.filter(item => item.verification_status === "verified").map(item => ({ title: item.title, verified: true })),
    subjects_to_teach: subjects,
  };
}
