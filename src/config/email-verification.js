const VERIFICATION_CUTOFF = Date.parse('2025-07-17T00:00:00Z');

export function requiresEmailVerification(user) {
  if (!user || user.emailVerified) return false;
  const creationTime = Date.parse(user.metadata?.creationTime || '');
  return !Number.isFinite(creationTime) || creationTime > VERIFICATION_CUTOFF;
}
