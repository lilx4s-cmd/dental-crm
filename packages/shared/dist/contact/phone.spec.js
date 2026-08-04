"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const phone_1 = require("./phone");
/**
 * The bug these exist for: every leading zero was read as Turkish, so a Saudi patient's
 * `0555 123 4567` became a real Turkish number belonging to somebody else. The clinic advertises
 * across the Gulf, so that was not an edge case — it was every lead from Riyadh and Kuwait who
 * wrote their number the way they write it at home.
 */
describe('normalisePhoneNumber', () => {
    it('resolves a trunk zero against the country, not against Turkey', () => {
        expect((0, phone_1.normalisePhoneNumber)('0555 123 4567', 'SA')?.e164).toBe('9665551234567');
        expect((0, phone_1.normalisePhoneNumber)('0555 123 45 67', 'TR')?.e164).toBe('905551234567');
        expect((0, phone_1.normalisePhoneNumber)('050 123 4567', 'AE')?.e164).toBe('971501234567');
    });
    it('lets an explicit international prefix win over the country field', () => {
        // Someone who typed +44 means +44, whatever the dropdown happens to say. Overriding them
        // would be the same class of mistake as assuming Turkey.
        expect((0, phone_1.normalisePhoneNumber)('+44 7700 900123', 'TR')?.e164).toBe('447700900123');
        expect((0, phone_1.normalisePhoneNumber)('0044 7700 900123', 'SA')?.e164).toBe('447700900123');
    });
    it('treats 00 as the international prefix, not a trunk zero', () => {
        expect((0, phone_1.normalisePhoneNumber)('00966 50 123 4567', 'TR')?.e164).toBe('966501234567');
    });
    it('keeps a number that already carries its country code', () => {
        expect((0, phone_1.normalisePhoneNumber)('905551234567', 'TR')?.e164).toBe('905551234567');
        expect((0, phone_1.normalisePhoneNumber)('966555123456', 'SA')?.e164).toBe('966555123456');
    });
    it('strips whatever punctuation people type', () => {
        expect((0, phone_1.normalisePhoneNumber)('+90 (555) 123-45-67')?.e164).toBe('905551234567');
        expect((0, phone_1.normalisePhoneNumber)('0555.123.45.67', 'TR')?.e164).toBe('905551234567');
    });
    it('flags a local number with no country instead of guessing one', () => {
        // The whole point. Unresolvable is a state the system can show; a silent wrong guess is not.
        const result = (0, phone_1.normalisePhoneNumber)('0555 123 4567');
        expect(result?.confident).toBe(false);
        expect(result?.e164).toBe('5551234567');
    });
    it('flags a length the country does not use', () => {
        // Saudi mobiles are 9 digits after the trunk zero. Four is a typo, and saying so beats storing
        // it as though it were fine.
        expect((0, phone_1.normalisePhoneNumber)('0555', 'SA')?.confident).toBe(false);
        expect((0, phone_1.normalisePhoneNumber)('0555 123 4567', 'SA')?.confident).toBe(true);
    });
    it('does not mistake a long dialling code for a short one', () => {
        // 971 must not be read as 9, and 966 must not be read as 9 — hence longest-prefix matching.
        expect((0, phone_1.normalisePhoneNumber)('+971501234567')?.display).toBe('+971 501 234 567');
        expect((0, phone_1.normalisePhoneNumber)('+966555123456')?.display).toBe('+966 555 123 456');
    });
    it('returns null for nothing usable', () => {
        expect((0, phone_1.normalisePhoneNumber)(null)).toBeNull();
        expect((0, phone_1.normalisePhoneNumber)(undefined)).toBeNull();
        expect((0, phone_1.normalisePhoneNumber)('')).toBeNull();
        expect((0, phone_1.normalisePhoneNumber)('n/a')).toBeNull();
        expect((0, phone_1.normalisePhoneNumber)('—')).toBeNull();
    });
    it('formats for a person to read back over the phone', () => {
        expect((0, phone_1.normalisePhoneNumber)('0555 123 4567', 'SA')?.display).toBe('+966 555 123 456 7');
        expect((0, phone_1.normalisePhoneNumber)('+90 555 123 45 67')?.display).toBe('+90 555 123 456 7');
    });
});
describe('toE164Digits', () => {
    it('is the digits alone, for callers that need nothing else', () => {
        expect((0, phone_1.toE164Digits)('0555 123 4567', 'SA')).toBe('9665551234567');
        expect((0, phone_1.toE164Digits)(null)).toBeNull();
    });
});
describe('DIAL_COUNTRIES', () => {
    it('defaults to the clinic\'s own country', () => {
        expect((0, phone_1.dialInfo)(phone_1.DEFAULT_DIAL_COUNTRY)?.name).toBe('Türkiye');
    });
    it('covers the markets this clinic actually advertises in', () => {
        const codes = phone_1.DIAL_COUNTRIES.map((c) => c.code);
        for (const expected of ['TR', 'SA', 'AE', 'KW', 'QA', 'IQ', 'GB', 'DE']) {
            expect(codes).toContain(expected);
        }
    });
    it('has no duplicate country or dialling codes', () => {
        expect(new Set(phone_1.DIAL_COUNTRIES.map((c) => c.code)).size).toBe(phone_1.DIAL_COUNTRIES.length);
    });
    it('looks up case-insensitively, since a CSV will not be tidy', () => {
        expect((0, phone_1.dialInfo)('sa')?.dial).toBe('966');
        expect((0, phone_1.dialInfo)(' TR ')?.dial).toBe('90');
        expect((0, phone_1.dialInfo)('ZZ')).toBeUndefined();
        expect((0, phone_1.dialInfo)(null)).toBeUndefined();
    });
});
//# sourceMappingURL=phone.spec.js.map