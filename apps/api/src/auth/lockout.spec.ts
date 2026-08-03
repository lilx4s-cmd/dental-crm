import {
  MAX_FAILED_LOGIN_ATTEMPTS,
  afterFailedAttempt,
  afterSuccessfulLogin,
  isLocked,
  lockoutDurationMs,
  minutesUntilUnlock,
} from '@dental-crm/shared';

const NOW = new Date('2026-08-03T10:00:00.000Z');
const MINUTE = 60_000;

describe('afterFailedAttempt', () => {
  it('counts up without locking below the threshold', () => {
    for (let attempts = 0; attempts < MAX_FAILED_LOGIN_ATTEMPTS - 1; attempts++) {
      const next = afterFailedAttempt(attempts, NOW);
      expect(next.failedLoginAttempts).toBe(attempts + 1);
      expect(next.lockedUntil).toBeNull();
    }
  });

  it('locks on the fifth failure', () => {
    const next = afterFailedAttempt(MAX_FAILED_LOGIN_ATTEMPTS - 1, NOW);
    expect(next.failedLoginAttempts).toBe(5);
    expect(next.lockedUntil).toEqual(new Date(NOW.getTime() + 15 * MINUTE));
  });

  it('keeps counting past the threshold so the lock can escalate', () => {
    // Resetting the counter on lock would make attempt 6 and attempt 60 indistinguishable, and
    // every subsequent lock would be the same fifteen minutes.
    const next = afterFailedAttempt(12, NOW);
    expect(next.failedLoginAttempts).toBe(13);
    expect(next.lockedUntil).toEqual(new Date(NOW.getTime() + 30 * MINUTE));
  });
});

describe('lockoutDurationMs', () => {
  it('escalates in three steps and then stops', () => {
    expect(lockoutDurationMs(5)).toBe(15 * MINUTE);
    expect(lockoutDurationMs(9)).toBe(15 * MINUTE);
    expect(lockoutDurationMs(10)).toBe(30 * MINUTE);
    expect(lockoutDurationMs(15)).toBe(60 * MINUTE);
    // Capped. A lock that grew without bound would be a denial-of-service an attacker could aim
    // at a named coordinator by deliberately failing.
    expect(lockoutDurationMs(10_000)).toBe(60 * MINUTE);
  });
});

describe('isLocked', () => {
  it('is false when nothing is set', () => {
    expect(isLocked(null, NOW)).toBe(false);
    expect(isLocked(undefined, NOW)).toBe(false);
  });

  it('is false once the moment has passed, with no unlock job needed', () => {
    // The lock expires by being in the past. Nothing has to run to clear it, which matters
    // because there is no scheduler in this system yet.
    expect(isLocked(new Date(NOW.getTime() - 1), NOW)).toBe(false);
    expect(isLocked(new Date(NOW.getTime() + 1), NOW)).toBe(true);
  });
});

describe('minutesUntilUnlock', () => {
  it('rounds up, and never says zero', () => {
    expect(minutesUntilUnlock(new Date(NOW.getTime() + 15 * MINUTE), NOW)).toBe(15);
    expect(minutesUntilUnlock(new Date(NOW.getTime() + 61_000), NOW)).toBe(2);
    expect(minutesUntilUnlock(new Date(NOW.getTime() + 1_000), NOW)).toBe(1);
  });
});

describe('afterSuccessfulLogin', () => {
  it('clears both fields', () => {
    expect(afterSuccessfulLogin()).toEqual({ failedLoginAttempts: 0, lockedUntil: null });
  });
});
