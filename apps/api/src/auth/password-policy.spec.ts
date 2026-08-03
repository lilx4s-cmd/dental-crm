import {
  MIN_PASSWORD_LENGTH,
  isAcceptablePassword,
  passwordProblems,
} from '@dental-crm/shared';

/**
 * The bar these replace: `min(8)` at user creation and `min(6)` at login. "password" and
 * "12345678" both cleared it, on accounts that can read every patient's medical history.
 */
describe('passwordProblems', () => {
  it('accepts a long memorable phrase', () => {
    // The kind of password the policy is trying to encourage: long, no character-class gymnastics.
    expect(passwordProblems('correct horse battery staple')).toEqual([]);
    expect(isAcceptablePassword('the seventh chair squeaks')).toBe(true);
  });

  it('rejects anything shorter than the minimum', () => {
    expect(passwordProblems('short')).toContainEqual(expect.stringContaining(String(MIN_PASSWORD_LENGTH)));
    expect(passwordProblems('elevenchars')).not.toEqual([]);
    expect(passwordProblems('twelvechars!')).toEqual([]);
  });

  it('rejects the passwords that were previously legal', () => {
    // Both cleared the old min(8).
    expect(isAcceptablePassword('password')).toBe(false);
    expect(isAcceptablePassword('12345678')).toBe(false);
  });

  it('rejects a common word even when it is long enough', () => {
    // Length alone would pass all of these.
    expect(isAcceptablePassword('passwordpassword')).toBe(false);
    expect(isAcceptablePassword('qwertyqwertyqwerty')).toBe(false);
    expect(isAcceptablePassword('iloveyouverymuch')).toBe(false);
  });

  it('rejects words specific to this clinic', () => {
    // A generic list would miss these, and they are the first things anyone targeting this
    // particular clinic would try.
    expect(isAcceptablePassword('keremclinic2026')).toBe(false);
    expect(isAcceptablePassword('venedikistanbul')).toBe(false);
  });

  it('rejects one character repeated, however long', () => {
    expect(isAcceptablePassword('aaaaaaaaaaaaaaaaaaaa')).toBe(false);
  });

  it('rejects the user\'s own name and email', () => {
    const context = { email: 'hasan@clinic.com', firstName: 'Hasan', lastName: 'Asfor' };
    expect(isAcceptablePassword('HasanIsGreat123', context)).toBe(false);
    expect(isAcceptablePassword('asfor-the-dentist', context)).toBe(false);
    // Same password, different person — the rule is about *their* name, not a blocklist.
    expect(isAcceptablePassword('HasanIsGreat123', { firstName: 'Mehmet' })).toBe(true);
  });

  it('ignores context fields too short to be meaningful', () => {
    // A two-letter surname would otherwise ban every password containing those two letters.
    expect(isAcceptablePassword('a memorable phrase', { lastName: 'Li' })).toBe(true);
  });

  it('reports every problem at once', () => {
    // A user told "too short", who fixes that and is then told "too common", stops trusting
    // the form.
    expect(passwordProblems('admin').length).toBeGreaterThan(1);
  });

  it('rejects past bcrypt\'s truncation point', () => {
    // bcrypt silently ignores bytes past 72, so a 200-character password is not what the user
    // thinks it is. Better to say so than to accept it and hash something shorter.
    expect(isAcceptablePassword('a memorable phrase '.repeat(20))).toBe(false);
  });

  it('does not throw on empty or missing input', () => {
    expect(() => passwordProblems('')).not.toThrow();
    expect(passwordProblems('')).not.toEqual([]);
  });
});
