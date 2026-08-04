/**
 * Turning what someone typed into a number that can actually be dialled.
 *
 * The bug this replaces: any number with a leading zero was treated as Turkish, so a Saudi
 * patient's `0555 123 4567` became `+90 555 123 4567` — a real Turkish number belonging to
 * somebody else. The clinic advertises across the Gulf, so this was not an edge case; it was every
 * lead from Riyadh, Kuwait and Dubai who wrote their number the way they write it at home.
 *
 * A trunk zero is only meaningful next to a country. There is no way to resolve `0555…` without
 * knowing where the person is, which is why `Lead.country` exists — inferring it from the campaign
 * would have been wrong every time a Saudi patient clicked a Turkish-targeted advert, and wrong
 * silently.
 */

export interface CountryDialInfo {
  /** ISO 3166-1 alpha-2. */
  readonly code: string;
  readonly name: string;
  /** E.164 calling code, without the plus. */
  readonly dial: string;
  /** Local subscriber-number length, after any trunk prefix. Used to sanity-check input. */
  readonly nationalDigits: readonly number[];
}

/**
 * The countries this clinic actually treats patients from, most common first.
 *
 * Deliberately not the full ISO list: a dropdown of 250 entries is one a receptionist scrolls past
 * rather than reads, and every country here is one the clinic has real patients in. `OTHER` covers
 * the rest by requiring a full international number, which is the honest fallback.
 */
export const DIAL_COUNTRIES: readonly CountryDialInfo[] = [
  { code: 'TR', name: 'Türkiye', dial: '90', nationalDigits: [10] },
  { code: 'SA', name: 'Saudi Arabia', dial: '966', nationalDigits: [9] },
  { code: 'AE', name: 'United Arab Emirates', dial: '971', nationalDigits: [9] },
  { code: 'KW', name: 'Kuwait', dial: '965', nationalDigits: [8] },
  { code: 'QA', name: 'Qatar', dial: '974', nationalDigits: [8] },
  { code: 'BH', name: 'Bahrain', dial: '973', nationalDigits: [8] },
  { code: 'OM', name: 'Oman', dial: '968', nationalDigits: [8] },
  { code: 'IQ', name: 'Iraq', dial: '964', nationalDigits: [10] },
  { code: 'JO', name: 'Jordan', dial: '962', nationalDigits: [9] },
  { code: 'LB', name: 'Lebanon', dial: '961', nationalDigits: [7, 8] },
  { code: 'EG', name: 'Egypt', dial: '20', nationalDigits: [10] },
  { code: 'LY', name: 'Libya', dial: '218', nationalDigits: [9] },
  { code: 'DZ', name: 'Algeria', dial: '213', nationalDigits: [9] },
  { code: 'MA', name: 'Morocco', dial: '212', nationalDigits: [9] },
  { code: 'TN', name: 'Tunisia', dial: '216', nationalDigits: [8] },
  { code: 'GB', name: 'United Kingdom', dial: '44', nationalDigits: [10] },
  { code: 'DE', name: 'Germany', dial: '49', nationalDigits: [10, 11] },
  { code: 'NL', name: 'Netherlands', dial: '31', nationalDigits: [9] },
  { code: 'FR', name: 'France', dial: '33', nationalDigits: [9] },
  { code: 'BE', name: 'Belgium', dial: '32', nationalDigits: [8, 9] },
  { code: 'SE', name: 'Sweden', dial: '46', nationalDigits: [9] },
  { code: 'RU', name: 'Russia', dial: '7', nationalDigits: [10] },
  { code: 'US', name: 'United States', dial: '1', nationalDigits: [10] },
];

export const DEFAULT_DIAL_COUNTRY = 'TR';

export function dialInfo(countryCode: string | null | undefined): CountryDialInfo | undefined {
  if (!countryCode) return undefined;
  const wanted = countryCode.trim().toUpperCase();
  return DIAL_COUNTRIES.find((c) => c.code === wanted);
}

export interface NormalisedPhone {
  /** Digits only, country code first, no plus — the form wa.me and most gateways want. */
  readonly e164: string;
  /** `+90 555 123 45 67`, for showing a person. */
  readonly display: string;
  /**
   * False when the result is a guess rather than a certainty — a local number with no country
   * given, or a length the country does not use. The number is still returned, because refusing
   * to store what someone typed loses information; the flag is what lets a screen say "check this".
   */
  readonly confident: boolean;
}

/**
 * Normalises a phone number, using the country only when the number does not carry its own.
 *
 * Precedence, and the reason for it:
 *   1. A leading `+` or `00` is an explicit international prefix. It wins over everything,
 *      including a contradicting country field — the person writing `+44…` means `+44…`.
 *   2. A leading `0` is a national trunk prefix, and needs the country to resolve.
 *   3. Anything else is assumed to already carry a country code if it is long enough, and to be a
 *      local number if it is not.
 */
export function normalisePhoneNumber(
  raw: string | null | undefined,
  countryCode?: string | null,
): NormalisedPhone | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  const country = dialInfo(countryCode);
  const explicitlyInternational = trimmed.startsWith('+') || digits.startsWith('00');

  if (explicitlyInternational) {
    const e164 = digits.startsWith('00') ? digits.slice(2) : digits;
    return finalise(e164, countryOf(e164), true);
  }

  if (digits.startsWith('0')) {
    const national = digits.replace(/^0+/, '');
    if (!country) {
      // Genuinely unresolvable. Returned rather than dropped, flagged rather than guessed —
      // guessing is what produced the wrong-Turkish-number bug.
      return finalise(national, undefined, false);
    }
    return finalise(
      `${country.dial}${national}`,
      country,
      country.nationalDigits.includes(national.length),
    );
  }

  // No prefix at all. If it already begins with a known dialling code and is a plausible length,
  // take it at face value; otherwise treat it as a local number for the given country.
  const guessed = countryOf(digits);
  if (guessed && guessed.nationalDigits.includes(digits.length - guessed.dial.length)) {
    return finalise(digits, guessed, true);
  }
  if (country) {
    return finalise(`${country.dial}${digits}`, country, country.nationalDigits.includes(digits.length));
  }
  return finalise(digits, guessed, false);
}

/** Just the dialable digits, for callers that do not need the rest. */
export function toE164Digits(raw: string | null | undefined, countryCode?: string | null): string | null {
  return normalisePhoneNumber(raw, countryCode)?.e164 ?? null;
}

/**
 * How many trailing digits identify a subscriber, regardless of how the number was written.
 *
 * Nine covers every country in `DIAL_COUNTRIES` — the longest national number here is ten (Turkey,
 * Egypt, Iraq, the UK, the US), so nine is the largest suffix that is present whatever prefix was
 * or was not typed. Shorter would start colliding between real people.
 */
const MATCH_DIGITS = 9;

/**
 * A key for deciding whether two numbers are the same person.
 *
 * Storage cannot be relied on to be canonical, and never has been: the previous normaliser
 * returned `905551112233` for `+90 555 111 22 33` and `05551112233` for the same phone written
 * `0555 111 22 33`, so the duplicate check that claimed to compare like with like was comparing
 * two different strings and finding no match. Every lead entered once with a country code and once
 * without has been sitting in the pipeline as two deals.
 *
 * Comparing the trailing digits sidesteps the whole question. It is deliberately lenient: two
 * different countries could in principle share a nine-digit tail, but a false "these might be the
 * same person" shown to staff for review costs a glance, and a missed duplicate costs a patient
 * being called twice by two salespeople.
 */
export function phoneMatchKey(raw: string | null | undefined, countryCode?: string | null): string | null {
  const digits = normalisePhoneNumber(raw, countryCode)?.e164;
  if (!digits) return null;
  return digits.length <= MATCH_DIGITS ? digits : digits.slice(-MATCH_DIGITS);
}

function countryOf(e164: string): CountryDialInfo | undefined {
  // Longest dialling code first, so 971 is not mistaken for 9 and 962 is not mistaken for 9.
  return [...DIAL_COUNTRIES]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((c) => e164.startsWith(c.dial));
}

function finalise(e164: string, country: CountryDialInfo | undefined, confident: boolean): NormalisedPhone {
  return { e164, display: formatDisplay(e164, country), confident };
}

/** `+966 555 123 456` — grouped so a person can read it back over the phone. */
function formatDisplay(e164: string, country: CountryDialInfo | undefined): string {
  if (!country) return `+${e164}`;
  const national = e164.slice(country.dial.length);
  const groups = national.match(/.{1,3}/g) ?? [national];
  return `+${country.dial} ${groups.join(' ')}`.trim();
}
