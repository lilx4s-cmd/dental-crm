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
/** Failures tolerated before the account locks. Five is enough for a typo and a bad memory. */
export declare const MAX_FAILED_LOGIN_ATTEMPTS = 5;
/**
 * How long the account stays locked, escalating with persistence.
 *
 * Deliberately minutes rather than "until an administrator unlocks it". A permanent lock hands
 * an attacker a denial-of-service: anyone who knows a coordinator's email address could keep
 * them out of the system indefinitely by guessing wrong on purpose, which costs the clinic more
 * than the attack it prevents. Fifteen minutes makes brute force arithmetically hopeless while
 * a real person locked out by accident goes and makes a coffee.
 */
export declare function lockoutDurationMs(failedAttempts: number): number;
export declare function isLocked(lockedUntil: Date | null | undefined, now: Date): boolean;
/** Whole minutes remaining, rounded up — "1 minute" reads better than "0 minutes". */
export declare function minutesUntilUnlock(lockedUntil: Date, now: Date): number;
export interface LockState {
    failedLoginAttempts: number;
    lockedUntil: Date | null;
}
/**
 * The account's new state after a failed attempt.
 *
 * The counter keeps climbing past the threshold rather than resetting, so the escalation in
 * `lockoutDurationMs` can see the difference between someone who mistyped twice over a month and
 * someone who has been guessing for an hour. It is cleared only by a successful sign-in.
 */
export declare function afterFailedAttempt(current: number, now: Date): LockState;
/** A clean slate. Applied on every successful sign-in. */
export declare function afterSuccessfulLogin(): LockState;
//# sourceMappingURL=lockout.d.ts.map