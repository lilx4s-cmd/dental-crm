"use strict";
/**
 * Account lockout after repeated failed sign-ins.
 *
 * Before this, `/api/auth/login` sat under the global 300-requests-per-15-minutes limiter — the
 * same budget as browsing the app — on a system with no second factor. Three hundred password
 * guesses per IP per quarter hour against a clinic where staff pick their own passwords is a
 * credential-stuffing run that finishes in an afternoon.
 *
 * Two independent limits, because each covers the other's blind spot: a per-IP rate limit
 * (wired in `main.ts`) stops one machine grinding through many accounts, and this per-account
 * lockout stops a botnet grinding through one account from many machines.
 *
 * Pure functions with an injected `now`, so the escalation can be tested without waiting a
 * quarter of an hour for a real clock.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_FAILED_LOGIN_ATTEMPTS = void 0;
exports.lockoutDurationMs = lockoutDurationMs;
exports.isLocked = isLocked;
exports.minutesUntilUnlock = minutesUntilUnlock;
exports.afterFailedAttempt = afterFailedAttempt;
exports.afterSuccessfulLogin = afterSuccessfulLogin;
/** Failures tolerated before the account locks. Five is enough for a typo and a bad memory. */
exports.MAX_FAILED_LOGIN_ATTEMPTS = 5;
const MINUTE = 60_000;
/**
 * How long the account stays locked, escalating with persistence.
 *
 * Deliberately minutes rather than "until an administrator unlocks it". A permanent lock hands
 * an attacker a denial-of-service: anyone who knows a coordinator's email address could keep
 * them out of the system indefinitely by guessing wrong on purpose, which costs the clinic more
 * than the attack it prevents. Fifteen minutes makes brute force arithmetically hopeless while
 * a real person locked out by accident goes and makes a coffee.
 */
function lockoutDurationMs(failedAttempts) {
    if (failedAttempts >= 15)
        return 60 * MINUTE;
    if (failedAttempts >= 10)
        return 30 * MINUTE;
    return 15 * MINUTE;
}
function isLocked(lockedUntil, now) {
    return !!lockedUntil && lockedUntil.getTime() > now.getTime();
}
/** Whole minutes remaining, rounded up — "1 minute" reads better than "0 minutes". */
function minutesUntilUnlock(lockedUntil, now) {
    return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / MINUTE));
}
/**
 * The account's new state after a failed attempt.
 *
 * The counter keeps climbing past the threshold rather than resetting, so the escalation in
 * `lockoutDurationMs` can see the difference between someone who mistyped twice over a month and
 * someone who has been guessing for an hour. It is cleared only by a successful sign-in.
 */
function afterFailedAttempt(current, now) {
    const failedLoginAttempts = current + 1;
    const shouldLock = failedLoginAttempts >= exports.MAX_FAILED_LOGIN_ATTEMPTS;
    return {
        failedLoginAttempts,
        lockedUntil: shouldLock ? new Date(now.getTime() + lockoutDurationMs(failedLoginAttempts)) : null,
    };
}
/** A clean slate. Applied on every successful sign-in. */
function afterSuccessfulLogin() {
    return { failedLoginAttempts: 0, lockedUntil: null };
}
//# sourceMappingURL=lockout.js.map