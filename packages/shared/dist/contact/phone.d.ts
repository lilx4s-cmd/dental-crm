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
export declare const DIAL_COUNTRIES: readonly CountryDialInfo[];
export declare const DEFAULT_DIAL_COUNTRY = "TR";
export declare function dialInfo(countryCode: string | null | undefined): CountryDialInfo | undefined;
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
export declare function normalisePhoneNumber(raw: string | null | undefined, countryCode?: string | null): NormalisedPhone | null;
/** Just the dialable digits, for callers that do not need the rest. */
export declare function toE164Digits(raw: string | null | undefined, countryCode?: string | null): string | null;
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
export declare function phoneMatchKey(raw: string | null | undefined, countryCode?: string | null): string | null;
/**
 * Turns whatever somebody typed into an ISO 3166-1 alpha-2 code, or null.
 *
 * Null rather than a guess: `Lead.country` decides whether a leading zero on a phone number means
 * Turkey or Saudi Arabia, so a wrong answer here dials a real number belonging to somebody else.
 * Not knowing is safe — `toE164Digits` falls back to digits-only when the country is unknown.
 */
export declare function resolveCountryCode(raw: string | null | undefined): string | null;
/**
 * The languages this clinic's patients are served in.
 *
 * Not a decorative field. 125 of the 152 deals that recorded one in the old CRM were Arabic, in a
 * clinic whose staff and dossiers are English and Turkish — so this decides which coordinator
 * takes the case, whether a translator is booked, and which language the treatment plan is
 * produced in.
 *
 * Stored as an ISO 639-1 code so it can key the dossier's own locale map, rather than as whatever
 * word somebody typed.
 */
export interface PatientLanguage {
    readonly code: string;
    readonly name: string;
    /** What the patient would call it, for a form they fill in themselves. */
    readonly endonym: string;
}
export declare const PATIENT_LANGUAGES: readonly PatientLanguage[];
/**
 * Turns whatever somebody wrote into an ISO 639-1 code, or null.
 *
 * Null rather than defaulting to English: "we do not know what language this patient speaks" and
 * "this patient speaks English" are different facts, and the second one sends an English treatment
 * plan to somebody who cannot read it.
 */
export declare function resolveLanguageCode(raw: string | null | undefined): string | null;
/** The display name for a stored code. Falls back to the code so nothing renders blank. */
export declare function languageName(code: string | null | undefined): string;
//# sourceMappingURL=phone.d.ts.map