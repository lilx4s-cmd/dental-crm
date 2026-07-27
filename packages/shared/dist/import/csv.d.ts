/**
 * CSV reading for the lead importer.
 *
 * Hand-written rather than pulled from a library because the whole job is one correct scanner and
 * a header guesser, and both need to behave identically wherever they run — the browser previews
 * exactly what the API will be asked to create, so the two must agree on where a field ends.
 *
 * The clinic's lists come out of Excel, Bitrix and Google Sheets, which between them produce
 * quoted commas, embedded newlines, doubled quotes, CRLF endings, a UTF-8 BOM, and semicolons
 * instead of commas on any machine with a European locale. All of those are handled; anything
 * else is reported per row rather than swallowed.
 */
export declare const CSV_DELIMITERS: readonly [",", ";", "\t", "|"];
export type CsvDelimiter = (typeof CSV_DELIMITERS)[number];
/**
 * Picks the delimiter by counting candidates in the header line, outside quotes.
 *
 * Comma wins ties because that is what the format is named after and what the clinic is asked
 * for; a European export separated by semicolons is detected rather than read as one giant column.
 */
export declare function detectDelimiter(text: string): CsvDelimiter;
/**
 * Splits CSV text into rows of raw cell strings.
 *
 * A character-by-character scan, because splitting on commas and newlines breaks the moment a cell
 * contains either — and a patient note or an address contains both.
 */
export declare function parseCsv(text: string, delimiter?: CsvDelimiter): string[][];
/** The lead fields a CSV column can be pointed at. */
export declare const LEAD_IMPORT_FIELDS: readonly [{
    readonly key: "firstName";
    readonly label: "First name";
    readonly required: true;
}, {
    readonly key: "lastName";
    readonly label: "Last name";
    readonly required: false;
}, {
    readonly key: "phone";
    readonly label: "Phone";
    readonly required: false;
}, {
    readonly key: "whatsappNumber";
    readonly label: "WhatsApp";
    readonly required: false;
}, {
    readonly key: "email";
    readonly label: "Email";
    readonly required: false;
}, {
    readonly key: "source";
    readonly label: "Source";
    readonly required: false;
}, {
    readonly key: "estimatedValue";
    readonly label: "Estimated value";
    readonly required: false;
}, {
    readonly key: "currency";
    readonly label: "Currency";
    readonly required: false;
}, {
    readonly key: "notes";
    readonly label: "Notes";
    readonly required: false;
}];
export type LeadImportField = (typeof LEAD_IMPORT_FIELDS)[number]['key'];
/**
 * Guesses which column feeds which field, so a well-labelled export imports without anyone
 * touching the mapping. Every guess stays editable — this saves work, it does not decide anything.
 *
 * Aliases are tried in the order they are listed, most specific first, so a file carrying both
 * "Name" and "First Name" gives first name the column that actually says so rather than whichever
 * one happens to appear first. Exact matches are taken across every field before any loose ones,
 * for the same reason.
 *
 * Returns column indexes by field; a field with no match is absent.
 */
export declare function guessColumnMapping(headers: string[]): Partial<Record<LeadImportField, number>>;
/**
 * Splits a single "full name" column into first and last.
 *
 * Only used when the file has a name column but no separate surname. Everything after the first
 * space is the surname: a patient recorded as "Marie Claire Dubois" keeps "Claire Dubois" together
 * rather than losing a name, which matters when staff search for someone by the name on a passport.
 */
export declare function splitFullName(value: string): {
    firstName: string;
    lastName?: string;
};
/**
 * Reduces a phone number to the bare digits the CRM stores everywhere else, so an imported number
 * and an inbound WhatsApp message land on the same person.
 *
 * A leading 00 is the international prefix written out and becomes nothing, the way + does.
 */
export declare function normalisePhone(value: string): string;
//# sourceMappingURL=csv.d.ts.map