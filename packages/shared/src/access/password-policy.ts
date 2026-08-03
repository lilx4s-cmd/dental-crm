/**
 * What counts as an acceptable password.
 *
 * There was no policy: `CreateUserSchema` asked for eight characters and the login schema asked
 * for six, so "password" and "12345678" were both fine for an account that can read every
 * patient's medical history. Eight characters of anything is roughly a day's work for a
 * commodity GPU against bcrypt at 10 rounds.
 *
 * The rules follow NIST SP 800-63B rather than the older complexity-class orthodoxy: **length is
 * the control that matters**, and forcing an uppercase-digit-symbol mix mostly produces
 * `Password1!` — which is in every word list — while making passwords harder to remember and so
 * more likely to be written on a note by the reception desk. So: twelve characters minimum, a
 * blocklist of the obvious, and a check that the password is not simply the user's own name or
 * email. No mandatory character classes, no forced rotation.
 *
 * Pure and shared, so the login form can show the same rules the API enforces instead of the
 * user discovering them one rejection at a time.
 */

export const MIN_PASSWORD_LENGTH = 12;
/** bcrypt silently truncates past 72 bytes, so anything beyond it is security theatre. */
export const MAX_PASSWORD_LENGTH = 72;

/**
 * Passwords common enough that a length rule alone will not stop them.
 *
 * Deliberately short and matched loosely — this is a speed bump for the worst choices, not a
 * substitute for a breach-corpus check. A real k-anonymity lookup against Have I Been Pwned is
 * the right long-term answer and is recorded in TECHNICAL_DEBT.md.
 */
const COMMON_PASSWORDS = [
  'password',
  'passw0rd',
  'qwerty',
  'azerty',
  'letmein',
  'welcome',
  'monkey',
  'dragon',
  'admin',
  'iloveyou',
  'sunshine',
  'princess',
  'football',
  'baseball',
  'trustno1',
  'clinic',
  'dental',
  'dentist',
  'kerem',
  'venedik',
  'istanbul',
];

export interface PasswordContext {
  email?: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Every reason a password is unacceptable, so the form can show them at once.
 *
 * All of them rather than the first: a user told "too short", who fixes that and is then told
 * "too common", learns to distrust the form. Empty array means acceptable.
 */
export function passwordProblems(password: string, context: PasswordContext = {}): string[] {
  const problems: string[] = [];
  const value = password ?? '';

  if (value.length < MIN_PASSWORD_LENGTH) {
    problems.push(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (value.length > MAX_PASSWORD_LENGTH) {
    problems.push(`Use at most ${MAX_PASSWORD_LENGTH} characters.`);
  }

  const lower = value.toLowerCase();

  if (COMMON_PASSWORDS.some((common) => lower.includes(common))) {
    problems.push('This contains a word that is guessed early in every attack. Choose something else.');
  }

  // A single repeated or sequential run is long but has almost no entropy.
  if (/^(.)\1+$/.test(value) && value.length > 0) {
    problems.push('This is one character repeated. Choose something else.');
  }
  if (/^(0123456789|abcdefghij|qwertyuiop)/i.test(value)) {
    problems.push('This is a keyboard or counting sequence. Choose something else.');
  }

  // Their own name or email address is the first thing anyone targeting this clinic would try.
  const personal = [
    context.firstName,
    context.lastName,
    context.email?.split('@')[0],
  ].filter((part): part is string => !!part && part.length >= 3);

  if (personal.some((part) => lower.includes(part.toLowerCase()))) {
    problems.push('Do not use your own name or email address.');
  }

  return problems;
}

export function isAcceptablePassword(password: string, context: PasswordContext = {}): boolean {
  return passwordProblems(password, context).length === 0;
}

/** The rules, phrased for a person, to show beside the field rather than after a rejection. */
export const PASSWORD_RULES: readonly string[] = [
  `At least ${MIN_PASSWORD_LENGTH} characters`,
  'Not a common word or an obvious sequence',
  'Not your own name or email address',
  'A memorable phrase of several words works well',
];
