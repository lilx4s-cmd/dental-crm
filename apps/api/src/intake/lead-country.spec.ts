import {
  languageName,
  resolveCountryCode,
  resolveLanguageCode,
  toE164Digits,
} from '@dental-crm/shared';

/**
 * The public enquiry form asked for a country of residence, stored it on the submission, and never
 * copied it to the lead — sitting directly beside the UTM fields, which were copied.
 *
 * That is not a cosmetic gap. `Lead.country` is what decides whether a leading zero on a phone
 * number means Turkey or Saudi Arabia, so every enquiry arriving through the form had its number
 * parsed as Turkish whatever the patient wrote. On production today: 0 of 1005 leads carry a
 * country.
 */
describe('resolveCountryCode', () => {
  it('takes the canonical name', () => {
    expect(resolveCountryCode('Saudi Arabia')).toBe('SA');
    expect(resolveCountryCode('United Arab Emirates')).toBe('AE');
  });

  it('takes what people actually type', () => {
    // A form filled in on a phone gets whatever is quickest.
    expect(resolveCountryCode('saudi')).toBe('SA');
    expect(resolveCountryCode('KSA')).toBe('SA');
    expect(resolveCountryCode('Dubai')).toBe('AE');
    expect(resolveCountryCode('UK')).toBe('GB');
  });

  it('takes Arabic and Turkish spellings', () => {
    // Most of this clinic's patients write in one of the two.
    expect(resolveCountryCode('السعودية')).toBe('SA');
    expect(resolveCountryCode('Suudi Arabistan')).toBe('SA');
    expect(resolveCountryCode('Türkiye')).toBe('TR');
    expect(resolveCountryCode('العراق')).toBe('IQ');
  });

  it('ignores case and surrounding space', () => {
    expect(resolveCountryCode('  sAuDi ArAbIa  ')).toBe('SA');
  });

  it('takes a two-letter code directly', () => {
    expect(resolveCountryCode('SA')).toBe('SA');
    expect(resolveCountryCode('tr')).toBe('TR');
  });

  it('returns null rather than guessing', () => {
    // A wrong country dials a real number belonging to somebody else. Not knowing is safe:
    // toE164Digits falls back to digits-only when the country is unknown.
    expect(resolveCountryCode('Atlantis')).toBeNull();
    expect(resolveCountryCode('')).toBeNull();
    expect(resolveCountryCode(null)).toBeNull();
    expect(resolveCountryCode('   ')).toBeNull();
  });

  it('does not resolve a country the clinic has no patients in', () => {
    // DIAL_COUNTRIES is deliberately short. A country not on it contributes nothing to parsing a
    // number, so admitting it would be a name with no behaviour behind it.
    expect(resolveCountryCode('Japan')).toBeNull();
  });
});

/**
 * The reason the field exists at all.
 */
describe('what a resolved country changes', () => {
  it('dials a Saudi number as Saudi rather than as Turkish', () => {
    // Nine national digits, which is exactly a Saudi mobile. Turkey expects ten, so the same
    // string parsed as Turkish produces a different number — not an error, just the wrong person.
    const typed = '055 512 3456';

    const asSaudi = toE164Digits(typed, resolveCountryCode('Saudi Arabia') ?? undefined);
    const asTurkish = toE164Digits(typed, 'TR');

    expect(asSaudi).toBe('966555123456');
    // Both are dialable. Getting the country wrong does not fail — it calls a stranger, which is
    // why `resolveCountryCode` returns null rather than guessing.
    expect(asTurkish).not.toBe(asSaudi);
    expect(asTurkish).toBe('90555123456');
  });

  it('leaves an unknown country as digits rather than assuming Turkey', () => {
    const digits = toE164Digits('055 512 3456', resolveCountryCode('Atlantis') ?? undefined);
    expect(digits).not.toBe('905555123456');
  });
});

/**
 * Language was dropped in exactly the same place, and matters as much.
 *
 * 125 of the 152 leads that carry one are Arabic, in a clinic whose staff and dossiers are English
 * and Turkish. It decides who picks the case up and whether a translator is booked.
 */
describe('resolveLanguageCode', () => {
  it('takes the English name', () => {
    expect(resolveLanguageCode('Arabic')).toBe('ar');
    expect(resolveLanguageCode('Turkish')).toBe('tr');
  });

  it('takes what the patient would write themselves', () => {
    expect(resolveLanguageCode('العربية')).toBe('ar');
    expect(resolveLanguageCode('Türkçe')).toBe('tr');
    expect(resolveLanguageCode('Français')).toBe('fr');
  });

  it('takes the Turkish names, since the form is offered in Turkish too', () => {
    expect(resolveLanguageCode('Arapça')).toBe('ar');
    expect(resolveLanguageCode('Almanca')).toBe('de');
  });

  it('takes an ISO code directly', () => {
    expect(resolveLanguageCode('ar')).toBe('ar');
    expect(resolveLanguageCode('EN')).toBe('en');
  });

  it('returns null rather than defaulting to English', () => {
    // "We do not know what language this patient speaks" and "this patient speaks English" are
    // different facts. The second one sends an English treatment plan to somebody who cannot
    // read it.
    expect(resolveLanguageCode('Klingon')).toBeNull();
    expect(resolveLanguageCode('')).toBeNull();
    expect(resolveLanguageCode(null)).toBeNull();
  });
});

describe('languageName', () => {
  it('renders a stored code for a human', () => {
    expect(languageName('ar')).toBe('Arabic');
  });

  it('falls back to the code rather than rendering blank', () => {
    // A code from a future list this build does not know about should still show something.
    expect(languageName('xx')).toBe('xx');
    expect(languageName(null)).toBe('');
  });
});

/**
 * The countries were extended from the clinic's own history rather than guessed.
 */
describe('the countries this clinic actually sees', () => {
  it('resolves the ones the Bitrix export turned out to contain', () => {
    // Canada was 16 of the 55 deals that recorded a country — second only to the United States —
    // and was missing from a list built around the Gulf.
    expect(resolveCountryCode('Canada')).toBe('CA');
    expect(resolveCountryCode('Bosnia and Herzegovina')).toBe('BA');
    expect(resolveCountryCode('Malta')).toBe('MT');
    expect(resolveCountryCode('Austria')).toBe('AT');
  });
});
