"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_DIAL_COUNTRY = exports.DIAL_COUNTRIES = void 0;
exports.dialInfo = dialInfo;
exports.normalisePhoneNumber = normalisePhoneNumber;
exports.toE164Digits = toE164Digits;
/**
 * The countries this clinic actually treats patients from, most common first.
 *
 * Deliberately not the full ISO list: a dropdown of 250 entries is one a receptionist scrolls past
 * rather than reads, and every country here is one the clinic has real patients in. `OTHER` covers
 * the rest by requiring a full international number, which is the honest fallback.
 */
exports.DIAL_COUNTRIES = [
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
exports.DEFAULT_DIAL_COUNTRY = 'TR';
function dialInfo(countryCode) {
    if (!countryCode)
        return undefined;
    const wanted = countryCode.trim().toUpperCase();
    return exports.DIAL_COUNTRIES.find((c) => c.code === wanted);
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
function normalisePhoneNumber(raw, countryCode) {
    if (!raw)
        return null;
    const trimmed = raw.trim();
    const digits = trimmed.replace(/\D/g, '');
    if (!digits)
        return null;
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
        return finalise(`${country.dial}${national}`, country, country.nationalDigits.includes(national.length));
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
function toE164Digits(raw, countryCode) {
    return normalisePhoneNumber(raw, countryCode)?.e164 ?? null;
}
function countryOf(e164) {
    // Longest dialling code first, so 971 is not mistaken for 9 and 962 is not mistaken for 9.
    return [...exports.DIAL_COUNTRIES]
        .sort((a, b) => b.dial.length - a.dial.length)
        .find((c) => e164.startsWith(c.dial));
}
function finalise(e164, country, confident) {
    return { e164, display: formatDisplay(e164, country), confident };
}
/** `+966 555 123 456` — grouped so a person can read it back over the phone. */
function formatDisplay(e164, country) {
    if (!country)
        return `+${e164}`;
    const national = e164.slice(country.dial.length);
    const groups = national.match(/.{1,3}/g) ?? [national];
    return `+${country.dial} ${groups.join(' ')}`.trim();
}
//# sourceMappingURL=phone.js.map