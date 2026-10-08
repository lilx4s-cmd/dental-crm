"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COUNTRY_CODES = void 0;
exports.countryOptions = countryOptions;
exports.searchCountries = searchCountries;
/** ISO 3166-1 codes from RIPE NCC's published list (verified 2026-10-08).
 * https://www.ripe.net/community/internet-governance/internet-technical-community/the-rir-system/list-of-country-codes-and-rirs/
 * Keep this residence catalogue separate from the legacy telephone-length rules.
 * XK is an additional user-assigned code used for Kosovo; it is not an ISO assignment.
 */
exports.COUNTRY_CODES = ["AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ", "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY", "BZ", "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE", "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HM", "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT", "JE", "JM", "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW", "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ", "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI", "VN", "VU", "WF", "WS", "YE", "YT", "ZA", "ZM", "ZW", "XK"];
function countryOptions(language = 'en') {
    const local = new Intl.DisplayNames([language, 'en'], { type: 'region' });
    const english = new Intl.DisplayNames(['en'], { type: 'region' });
    return exports.COUNTRY_CODES.map(code => ({ code, name: local.of(code) ?? code, englishName: english.of(code) ?? code }))
        .sort((a, b) => a.name.localeCompare(b.name, language));
}
const aliases = { GB: 'UK Britain England United Kingdom', US: 'USA America United States', AE: 'UAE Emirates', TR: 'Turkey Turkiye Türkiye', MK: 'Macedonia', CI: 'Ivory Coast' };
const searchKey = (value) => value.normalize('NFKD').replace(/[\u0300-\u036f\u064b-\u065f]/g, '').toLocaleLowerCase().trim();
function searchCountries(options, query) {
    const wanted = searchKey(query);
    return options.filter(country => searchKey(`${country.code} ${country.name} ${country.englishName} ${aliases[country.code] ?? ''}`).includes(wanted));
}
//# sourceMappingURL=countries.js.map