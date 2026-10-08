/** ISO 3166-1 codes from RIPE NCC's published list (verified 2026-10-08).
 * https://www.ripe.net/community/internet-governance/internet-technical-community/the-rir-system/list-of-country-codes-and-rirs/
 * Keep this residence catalogue separate from the legacy telephone-length rules.
 * XK is an additional user-assigned code used for Kosovo; it is not an ISO assignment.
 */
export declare const COUNTRY_CODES: readonly string[];
export declare function countryOptions(language?: string): {
    code: string;
    name: string;
    englishName: string;
}[];
export declare function searchCountries(options: ReturnType<typeof countryOptions>, query: string): {
    code: string;
    name: string;
    englishName: string;
}[];
//# sourceMappingURL=countries.d.ts.map