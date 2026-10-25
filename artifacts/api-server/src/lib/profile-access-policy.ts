export function canReadPrivateUserProfile(actorId: number, targetId: number, canAccessSensitiveAccounts: boolean): boolean {
  return actorId === targetId || canAccessSensitiveAccounts;
}
