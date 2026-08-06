"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImportLeadsSchema = exports.LEAD_IMPORT_MAX_ROWS = exports.ImportedLeadSchema = void 0;
exports.coerceLeadSource = coerceLeadSource;
exports.parseImportedValue = parseImportedValue;
const zod_1 = require("zod");
const enums_1 = require("../enums");
/**
 * One row of an imported CSV, after the browser has applied the column mapping.
 *
 * The same schema validates the preview and the request body, so a row the importer showed as
 * accepted is a row the API will accept — the alternative is a preview that promises 300 leads and
 * an import that quietly creates 240.
 *
 * Deliberately looser than CreateLeadSchema in two places. `source` falls back to OTHER because a
 * spreadsheet column saying "fb ad" should not cost the clinic the row, and `lastName` is optional
 * because plenty of enquiries arrive as a single name.
 */
/** Free-text source values seen in exports, mapped onto the enum the CRM stores. */
const SOURCE_ALIASES = {
    fb: enums_1.LeadSource.FACEBOOK_ADS,
    facebook: enums_1.LeadSource.FACEBOOK_ADS,
    'facebook ads': enums_1.LeadSource.FACEBOOK_ADS,
    'facebook ad': enums_1.LeadSource.FACEBOOK_ADS,
    meta: enums_1.LeadSource.FACEBOOK_ADS,
    ig: enums_1.LeadSource.INSTAGRAM_ADS,
    insta: enums_1.LeadSource.INSTAGRAM_ADS,
    instagram: enums_1.LeadSource.INSTAGRAM_ADS,
    'instagram ads': enums_1.LeadSource.INSTAGRAM_ADS,
    wa: enums_1.LeadSource.WHATSAPP,
    whatsapp: enums_1.LeadSource.WHATSAPP,
    web: enums_1.LeadSource.WEBSITE,
    website: enums_1.LeadSource.WEBSITE,
    site: enums_1.LeadSource.WEBSITE,
    phone: enums_1.LeadSource.PHONE,
    call: enums_1.LeadSource.PHONE,
    tel: enums_1.LeadSource.PHONE,
    'walk in': enums_1.LeadSource.WALK_IN,
    walkin: enums_1.LeadSource.WALK_IN,
    referral: enums_1.LeadSource.REFERRAL,
    reference: enums_1.LeadSource.REFERRAL,
    google: enums_1.LeadSource.GOOGLE,
    'google ads': enums_1.LeadSource.GOOGLE,
    adwords: enums_1.LeadSource.GOOGLE,
};
/** Resolves a spreadsheet's source text to a LeadSource, falling back to OTHER. */
function coerceLeadSource(value) {
    if (!value)
        return enums_1.LeadSource.OTHER;
    const raw = value.trim();
    const upper = raw.toUpperCase().replace(/[\s-]+/g, '_');
    if (upper in enums_1.LeadSource)
        return upper;
    const alias = SOURCE_ALIASES[raw.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')];
    return alias ?? enums_1.LeadSource.OTHER;
}
/**
 * Reads a money column written by a spreadsheet.
 *
 * "1.250,50" (European), "1,250.50" (Anglo), "€1 250" and "2500 USD" all occur in the clinic's
 * lists. An unreadable value becomes undefined rather than 0 — a deal worth an unknown amount must
 * not be reported to the clinic as a deal worth nothing.
 */
function parseImportedValue(value) {
    if (!value)
        return undefined;
    const cleaned = value.replace(/[^\d.,-]/g, '').trim();
    if (!cleaned)
        return undefined;
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    let normalised;
    if (lastComma > lastDot) {
        // Comma is the decimal separator, so dots are thousands.
        normalised = cleaned.replace(/\./g, '').replace(',', '.');
    }
    else {
        normalised = cleaned.replace(/,/g, '');
    }
    const parsed = Number.parseFloat(normalised);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
exports.ImportedLeadSchema = zod_1.z.object({
    firstName: zod_1.z.string().trim().min(1, 'A name is required'),
    lastName: zod_1.z.string().trim().optional(),
    // Bare digits, matching how phone numbers are held everywhere else in the CRM.
    phone: zod_1.z.string().trim().optional(),
    whatsappNumber: zod_1.z.string().trim().optional(),
    email: zod_1.z.string().trim().email('Not a valid email').optional(),
    source: zod_1.z.string().default(enums_1.LeadSource.OTHER),
    /**
     * Resolved to ISO by the caller before it reaches here, so an unrecognised country is simply
     * absent rather than a two-letter string that means nothing. Same reasoning as `source` falling
     * back to OTHER: a column the importer cannot read must not cost the clinic the row.
     */
    country: zod_1.z.string().trim().length(2).optional(),
    preferredLanguage: zod_1.z.string().trim().min(2).max(3).optional(),
    estimatedValue: zod_1.z.number().positive().optional(),
    currency: zod_1.z.string().trim().length(3).optional(),
    notes: zod_1.z.string().trim().optional(),
});
/** The most rows one import may carry. Past this a spreadsheet is a migration, not an import. */
exports.LEAD_IMPORT_MAX_ROWS = 2000;
exports.ImportLeadsSchema = zod_1.z.object({
    leads: zod_1.z.array(exports.ImportedLeadSchema).min(1).max(exports.LEAD_IMPORT_MAX_ROWS),
    /** Everyone in the file goes to this person; omitted means the importer owns them. */
    assignedToId: zod_1.z.string().uuid().optional(),
    /**
     * Off by default. A clinic re-importing last month's list expects to add the new names, not a
     * second copy of everyone — but "skip" is still a choice someone should make knowingly.
     */
    skipDuplicates: zod_1.z.boolean().default(true),
});
//# sourceMappingURL=lead-import.schema.js.map