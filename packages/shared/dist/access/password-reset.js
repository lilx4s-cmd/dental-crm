"use strict";
/**
 * Password-reset token policy.
 *
 * The rules, separated from the plumbing, so the expiry can be tested without waiting an hour and
 * the web app can phrase "this link has expired" using the same number the API enforces.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PASSWORD_RESET_TOKEN_BYTES = exports.PASSWORD_RESET_TTL_MS = void 0;
exports.passwordResetExpiry = passwordResetExpiry;
exports.isRedeemable = isRedeemable;
exports.minutesUntilExpiry = minutesUntilExpiry;
/**
 * How long a reset link works.
 *
 * An hour is the usual compromise and it is the right one here: long enough for someone who
 * requested a reset, got distracted by a patient, and came back after lunch; short enough that a
 * link sitting in a mailbox that is itself later compromised is almost always already dead.
 */
exports.PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
/** Bytes of entropy in the raw token. 32 is 256 bits — not guessable, and still a tidy URL. */
exports.PASSWORD_RESET_TOKEN_BYTES = 32;
function passwordResetExpiry(now) {
    return new Date(now.getTime() + exports.PASSWORD_RESET_TTL_MS);
}
/**
 * Whether a stored token may still be redeemed.
 *
 * Single use, and enforced here rather than by deleting the row: keeping a spent token lets the
 * system tell "this link was already used" apart from "this link never existed", which is the
 * difference between reassuring a confused user and leaving them guessing. The row is cleaned up
 * on the next successful reset for that account.
 */
function isRedeemable(token, now) {
    if (!token)
        return false;
    if (token.usedAt)
        return false;
    return token.expiresAt.getTime() > now.getTime();
}
/** Minutes a link has left, for a message to the person holding it. */
function minutesUntilExpiry(expiresAt, now) {
    return Math.max(0, Math.round((expiresAt.getTime() - now.getTime()) / 60_000));
}
//# sourceMappingURL=password-reset.js.map