/**
 * Password-reset token policy.
 *
 * The rules, separated from the plumbing, so the expiry can be tested without waiting an hour and
 * the web app can phrase "this link has expired" using the same number the API enforces.
 */

/**
 * How long a reset link works.
 *
 * An hour is the usual compromise and it is the right one here: long enough for someone who
 * requested a reset, got distracted by a patient, and came back after lunch; short enough that a
 * link sitting in a mailbox that is itself later compromised is almost always already dead.
 */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

/** Bytes of entropy in the raw token. 32 is 256 bits — not guessable, and still a tidy URL. */
export const PASSWORD_RESET_TOKEN_BYTES = 32;

export function passwordResetExpiry(now: Date): Date {
  return new Date(now.getTime() + PASSWORD_RESET_TTL_MS);
}

export interface ResetTokenState {
  expiresAt: Date;
  usedAt: Date | null;
}

/**
 * Whether a stored token may still be redeemed.
 *
 * Single use, and enforced here rather than by deleting the row: keeping a spent token lets the
 * system tell "this link was already used" apart from "this link never existed", which is the
 * difference between reassuring a confused user and leaving them guessing. The row is cleaned up
 * on the next successful reset for that account.
 */
export function isRedeemable(token: ResetTokenState | null | undefined, now: Date): boolean {
  if (!token) return false;
  if (token.usedAt) return false;
  return token.expiresAt.getTime() > now.getTime();
}

/** Minutes a link has left, for a message to the person holding it. */
export function minutesUntilExpiry(expiresAt: Date, now: Date): number {
  return Math.max(0, Math.round((expiresAt.getTime() - now.getTime()) / 60_000));
}
