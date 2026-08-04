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
export declare const PASSWORD_RESET_TTL_MS: number;
/** Bytes of entropy in the raw token. 32 is 256 bits — not guessable, and still a tidy URL. */
export declare const PASSWORD_RESET_TOKEN_BYTES = 32;
export declare function passwordResetExpiry(now: Date): Date;
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
export declare function isRedeemable(token: ResetTokenState | null | undefined, now: Date): boolean;
/** Minutes a link has left, for a message to the person holding it. */
export declare function minutesUntilExpiry(expiresAt: Date, now: Date): number;
//# sourceMappingURL=password-reset.d.ts.map