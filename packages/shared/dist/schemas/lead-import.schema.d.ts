import { z } from 'zod';
/** Resolves a spreadsheet's source text to a LeadSource, falling back to OTHER. */
export declare function coerceLeadSource(value: string | undefined | null): string;
/**
 * Reads a money column written by a spreadsheet.
 *
 * "1.250,50" (European), "1,250.50" (Anglo), "€1 250" and "2500 USD" all occur in the clinic's
 * lists. An unreadable value becomes undefined rather than 0 — a deal worth an unknown amount must
 * not be reported to the clinic as a deal worth nothing.
 */
export declare function parseImportedValue(value: string | undefined | null): number | undefined;
export declare const ImportedLeadSchema: z.ZodObject<{
    firstName: z.ZodString;
    lastName: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
    whatsappNumber: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    source: z.ZodDefault<z.ZodString>;
    /**
     * Resolved to ISO by the caller before it reaches here, so an unrecognised country is simply
     * absent rather than a two-letter string that means nothing. Same reasoning as `source` falling
     * back to OTHER: a column the importer cannot read must not cost the clinic the row.
     */
    country: z.ZodOptional<z.ZodString>;
    preferredLanguage: z.ZodOptional<z.ZodString>;
    estimatedValue: z.ZodOptional<z.ZodNumber>;
    currency: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    source: string;
    firstName: string;
    email?: string | undefined;
    lastName?: string | undefined;
    phone?: string | undefined;
    whatsappNumber?: string | undefined;
    country?: string | undefined;
    notes?: string | undefined;
    estimatedValue?: number | undefined;
    currency?: string | undefined;
    preferredLanguage?: string | undefined;
}, {
    firstName: string;
    source?: string | undefined;
    email?: string | undefined;
    lastName?: string | undefined;
    phone?: string | undefined;
    whatsappNumber?: string | undefined;
    country?: string | undefined;
    notes?: string | undefined;
    estimatedValue?: number | undefined;
    currency?: string | undefined;
    preferredLanguage?: string | undefined;
}>;
export type ImportedLead = z.infer<typeof ImportedLeadSchema>;
/** The most rows one import may carry. Past this a spreadsheet is a migration, not an import. */
export declare const LEAD_IMPORT_MAX_ROWS = 2000;
export declare const ImportLeadsSchema: z.ZodObject<{
    leads: z.ZodArray<z.ZodObject<{
        firstName: z.ZodString;
        lastName: z.ZodOptional<z.ZodString>;
        phone: z.ZodOptional<z.ZodString>;
        whatsappNumber: z.ZodOptional<z.ZodString>;
        email: z.ZodOptional<z.ZodString>;
        source: z.ZodDefault<z.ZodString>;
        /**
         * Resolved to ISO by the caller before it reaches here, so an unrecognised country is simply
         * absent rather than a two-letter string that means nothing. Same reasoning as `source` falling
         * back to OTHER: a column the importer cannot read must not cost the clinic the row.
         */
        country: z.ZodOptional<z.ZodString>;
        preferredLanguage: z.ZodOptional<z.ZodString>;
        estimatedValue: z.ZodOptional<z.ZodNumber>;
        currency: z.ZodOptional<z.ZodString>;
        notes: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        source: string;
        firstName: string;
        email?: string | undefined;
        lastName?: string | undefined;
        phone?: string | undefined;
        whatsappNumber?: string | undefined;
        country?: string | undefined;
        notes?: string | undefined;
        estimatedValue?: number | undefined;
        currency?: string | undefined;
        preferredLanguage?: string | undefined;
    }, {
        firstName: string;
        source?: string | undefined;
        email?: string | undefined;
        lastName?: string | undefined;
        phone?: string | undefined;
        whatsappNumber?: string | undefined;
        country?: string | undefined;
        notes?: string | undefined;
        estimatedValue?: number | undefined;
        currency?: string | undefined;
        preferredLanguage?: string | undefined;
    }>, "many">;
    /** Everyone in the file goes to this person; omitted means the importer owns them. */
    assignedToId: z.ZodOptional<z.ZodString>;
    /**
     * Off by default. A clinic re-importing last month's list expects to add the new names, not a
     * second copy of everyone — but "skip" is still a choice someone should make knowingly.
     */
    skipDuplicates: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    leads: {
        source: string;
        firstName: string;
        email?: string | undefined;
        lastName?: string | undefined;
        phone?: string | undefined;
        whatsappNumber?: string | undefined;
        country?: string | undefined;
        notes?: string | undefined;
        estimatedValue?: number | undefined;
        currency?: string | undefined;
        preferredLanguage?: string | undefined;
    }[];
    skipDuplicates: boolean;
    assignedToId?: string | undefined;
}, {
    leads: {
        firstName: string;
        source?: string | undefined;
        email?: string | undefined;
        lastName?: string | undefined;
        phone?: string | undefined;
        whatsappNumber?: string | undefined;
        country?: string | undefined;
        notes?: string | undefined;
        estimatedValue?: number | undefined;
        currency?: string | undefined;
        preferredLanguage?: string | undefined;
    }[];
    assignedToId?: string | undefined;
    skipDuplicates?: boolean | undefined;
}>;
export type ImportLeadsInput = z.infer<typeof ImportLeadsSchema>;
export interface ImportLeadsResult {
    created: number;
    /** Rows matching a lead the CRM already holds, by phone or email. */
    skipped: number;
    /** 1-based row numbers as they appear in the file, so the message points at a line. */
    errors: {
        row: number;
        reason: string;
    }[];
}
//# sourceMappingURL=lead-import.schema.d.ts.map