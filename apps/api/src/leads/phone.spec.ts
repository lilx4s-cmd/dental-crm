import {
  DEFAULT_DIAL_COUNTRY,
  DIAL_COUNTRIES,
  dialInfo,
  normalisePhoneNumber,
  phoneMatchKey,
  toE164Digits,
} from '@dental-crm/shared';

/**
 * Lives in apps/api rather than beside the source it tests, because packages/shared has no test
 * runner of its own — the API's jest maps `@dental-crm/shared` to source and is where the other
 * shared-logic suites already sit (see auth/lockout.spec.ts, auth/password-policy.spec.ts).
 *
 * The bug these exist for: every leading zero was read as Turkish, so a Saudi patient's
 * `055 512 3456` became a real Turkish number belonging to somebody else. The clinic advertises
 * across the Gulf, so that was not an edge case — it was every lead from Riyadh and Kuwait who
 * wrote their number the way they write it at home.
 */
describe('normalisePhoneNumber', () => {
  it('resolves a trunk zero against the country, not against Turkey', () => {
    expect(normalisePhoneNumber('055 512 3456', 'SA')?.e164).toBe('966555123456');
    expect(normalisePhoneNumber('0555 123 45 67', 'TR')?.e164).toBe('905551234567');
    expect(normalisePhoneNumber('050 123 4567', 'AE')?.e164).toBe('971501234567');
  });

  it('lets an explicit international prefix win over the country field', () => {
    // Someone who typed +44 means +44, whatever the dropdown happens to say. Overriding them
    // would be the same class of mistake as assuming Turkey.
    expect(normalisePhoneNumber('+44 7700 900123', 'TR')?.e164).toBe('447700900123');
    expect(normalisePhoneNumber('0044 7700 900123', 'SA')?.e164).toBe('447700900123');
  });

  it('treats 00 as the international prefix, not a trunk zero', () => {
    expect(normalisePhoneNumber('00966 55 512 3456', 'TR')?.e164).toBe('966555123456');
  });

  it('keeps a number that already carries its country code', () => {
    expect(normalisePhoneNumber('905551234567', 'TR')?.e164).toBe('905551234567');
    expect(normalisePhoneNumber('966555123456', 'SA')?.e164).toBe('966555123456');
  });

  it('strips whatever punctuation people type', () => {
    expect(normalisePhoneNumber('+90 (555) 123-45-67')?.e164).toBe('905551234567');
    expect(normalisePhoneNumber('0555.123.45.67', 'TR')?.e164).toBe('905551234567');
  });

  it('flags a local number with no country instead of guessing one', () => {
    // The whole point. Unresolvable is a state a screen can show; a silent wrong guess is not.
    const result = normalisePhoneNumber('055 512 3456');
    expect(result?.confident).toBe(false);
    expect(result?.e164).toBe('555123456');
  });

  it('flags a length the country does not use', () => {
    // Saudi mobiles are 9 digits after the trunk zero. A Turkish-length 10 is either a typo or the
    // wrong country selected, and saying so beats storing it as though it were fine.
    expect(normalisePhoneNumber('0555 123 4567', 'SA')?.confident).toBe(false);
    expect(normalisePhoneNumber('055 512 3456', 'SA')?.confident).toBe(true);
    expect(normalisePhoneNumber('0555', 'SA')?.confident).toBe(false);
  });

  it('does not mistake a long dialling code for a short one', () => {
    // 971 must not be read as 9, and 966 must not be read as 9 — hence longest-prefix matching.
    expect(normalisePhoneNumber('+971501234567')?.display).toBe('+971 501 234 567');
    expect(normalisePhoneNumber('+966555123456')?.display).toBe('+966 555 123 456');
  });

  it('returns null for nothing usable', () => {
    expect(normalisePhoneNumber(null)).toBeNull();
    expect(normalisePhoneNumber(undefined)).toBeNull();
    expect(normalisePhoneNumber('')).toBeNull();
    expect(normalisePhoneNumber('n/a')).toBeNull();
    expect(normalisePhoneNumber('—')).toBeNull();
  });

  it('groups the display form so a person can read it back', () => {
    expect(normalisePhoneNumber('055 512 3456', 'SA')?.display).toBe('+966 555 123 456');
  });
});

describe('phoneMatchKey', () => {
  it('matches the same phone however it was written', () => {
    // The existing bug this fixes: the old normaliser stored +90 555 111 22 33 as
    // "905551112233" and the same phone written 0555 111 22 33 as "05551112233", so the duplicate
    // check compared two different strings and found nothing. Every lead entered once each way has
    // been sitting in the pipeline as two deals.
    const written = [
      ['+90 555 111 22 33', undefined],
      ['0555 111 22 33', 'TR'],
      ['905551112233', undefined],
      ['0090 555 111 22 33', undefined],
    ] as const;

    const keys = new Set(written.map(([n, c]) => phoneMatchKey(n, c)));
    expect(keys.size).toBe(1);
  });

  it('matches a local number against its international form even with no country given', () => {
    // The realistic case: one row imported from a CSV as +966…, the other typed as 055…
    expect(phoneMatchKey('+966 55 512 3456')).toBe(phoneMatchKey('055 512 3456'));
  });

  it('does not collide two genuinely different numbers', () => {
    expect(phoneMatchKey('+90 555 111 22 33')).not.toBe(phoneMatchKey('+90 555 111 22 34'));
  });

  it('returns null when there is nothing to match on', () => {
    expect(phoneMatchKey(null)).toBeNull();
    expect(phoneMatchKey('n/a')).toBeNull();
  });

  it('keeps a short number whole rather than padding or truncating it', () => {
    expect(phoneMatchKey('12345')).toBe('12345');
  });
});

describe('toE164Digits', () => {
  it('is the digits alone, for callers that need nothing else', () => {
    expect(toE164Digits('055 512 3456', 'SA')).toBe('966555123456');
    expect(toE164Digits(null)).toBeNull();
  });
});

describe('DIAL_COUNTRIES', () => {
  it('defaults to the clinic\'s own country', () => {
    expect(dialInfo(DEFAULT_DIAL_COUNTRY)?.name).toBe('Türkiye');
  });

  it('covers the markets this clinic actually advertises in', () => {
    const codes = DIAL_COUNTRIES.map((c) => c.code);
    for (const expected of ['TR', 'SA', 'AE', 'KW', 'QA', 'IQ', 'GB', 'DE']) {
      expect(codes).toContain(expected);
    }
  });

  it('has no duplicate country codes', () => {
    expect(new Set(DIAL_COUNTRIES.map((c) => c.code)).size).toBe(DIAL_COUNTRIES.length);
  });

  it('looks up case-insensitively, since a CSV will not be tidy', () => {
    expect(dialInfo('sa')?.dial).toBe('966');
    expect(dialInfo(' TR ')?.dial).toBe('90');
    expect(dialInfo('ZZ')).toBeUndefined();
    expect(dialInfo(null)).toBeUndefined();
  });
});
