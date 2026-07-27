"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEAD_IMPORT_FIELDS = exports.CSV_DELIMITERS = void 0;
exports.detectDelimiter = detectDelimiter;
exports.parseCsv = parseCsv;
exports.guessColumnMapping = guessColumnMapping;
exports.splitFullName = splitFullName;
exports.normalisePhone = normalisePhone;
exports.CSV_DELIMITERS = [',', ';', '\t', '|'];
/**
 * Picks the delimiter by counting candidates in the header line, outside quotes.
 *
 * Comma wins ties because that is what the format is named after and what the clinic is asked
 * for; a European export separated by semicolons is detected rather than read as one giant column.
 */
function detectDelimiter(text) {
    const firstLine = stripBom(text).split(/\r?\n/, 1)[0] ?? '';
    let best = ',';
    let bestCount = 0;
    for (const d of exports.CSV_DELIMITERS) {
        let count = 0;
        let inQuotes = false;
        for (let i = 0; i < firstLine.length; i++) {
            const ch = firstLine[i];
            if (ch === '"')
                inQuotes = !inQuotes;
            else if (ch === d && !inQuotes)
                count++;
        }
        if (count > bestCount) {
            best = d;
            bestCount = count;
        }
    }
    return best;
}
/** Excel prefixes UTF-8 files with a byte-order mark, which would otherwise ride along on the first header. */
function stripBom(text) {
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
/**
 * Splits CSV text into rows of raw cell strings.
 *
 * A character-by-character scan, because splitting on commas and newlines breaks the moment a cell
 * contains either — and a patient note or an address contains both.
 */
function parseCsv(text, delimiter) {
    const source = stripBom(text);
    const d = delimiter ?? detectDelimiter(source);
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;
    for (let i = 0; i < source.length; i++) {
        const ch = source[i];
        if (inQuotes) {
            if (ch === '"') {
                // A doubled quote inside a quoted cell is one literal quote.
                if (source[i + 1] === '"') {
                    cell += '"';
                    i++;
                }
                else {
                    inQuotes = false;
                }
            }
            else {
                cell += ch;
            }
            continue;
        }
        if (ch === '"') {
            inQuotes = true;
        }
        else if (ch === d) {
            row.push(cell);
            cell = '';
        }
        else if (ch === '\r') {
            // Consumed with the \n that follows it; a lone \r is treated as a line ending too.
            if (source[i + 1] === '\n')
                i++;
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
        }
        else if (ch === '\n') {
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
        }
        else {
            cell += ch;
        }
    }
    // Whatever is still in hand is the last row, unless the file ended on a newline.
    if (cell !== '' || row.length > 0) {
        row.push(cell);
        rows.push(row);
    }
    // A trailing blank line, or a row of empty cells left by one, is not a lead.
    return rows.filter((r) => r.some((c) => c.trim() !== ''));
}
/** The lead fields a CSV column can be pointed at. */
exports.LEAD_IMPORT_FIELDS = [
    { key: 'firstName', label: 'First name', required: true },
    { key: 'lastName', label: 'Last name', required: false },
    { key: 'phone', label: 'Phone', required: false },
    { key: 'whatsappNumber', label: 'WhatsApp', required: false },
    { key: 'email', label: 'Email', required: false },
    { key: 'source', label: 'Source', required: false },
    { key: 'estimatedValue', label: 'Estimated value', required: false },
    { key: 'currency', label: 'Currency', required: false },
    { key: 'notes', label: 'Notes', required: false },
];
/**
 * Header spellings seen in the lists the clinic actually imports — Bitrix exports, the ads
 * platforms' lead forms, and hand-kept spreadsheets in French and Turkish, which is what the
 * clinic's own staff write.
 */
const HEADER_ALIASES = {
    firstName: ['first name', 'firstname', 'first', 'name', 'full name', 'fullname', 'contact', 'ad', 'isim', 'prénom', 'prenom', 'nom complet'],
    lastName: ['last name', 'lastname', 'surname', 'family name', 'soyad', 'soyisim', 'nom', 'nom de famille'],
    phone: ['phone', 'phone number', 'telephone', 'tel', 'mobile', 'cell', 'contact number', 'telefon', 'téléphone', 'numéro'],
    whatsappNumber: ['whatsapp', 'whatsapp number', 'wa', 'wa number', 'whatsapp no'],
    email: ['email', 'e-mail', 'email address', 'mail', 'eposta', 'e-posta', 'courriel'],
    source: ['source', 'lead source', 'channel', 'origin', 'kaynak', 'origine'],
    estimatedValue: ['value', 'estimated value', 'amount', 'budget', 'deal value', 'price', 'tutar', 'montant'],
    currency: ['currency', 'para birimi', 'devise'],
    notes: ['notes', 'note', 'comment', 'comments', 'description', 'message', 'not', 'commentaire'],
};
function normaliseHeader(header) {
    return header
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ');
}
// Aliases go through the same normalisation as the headers they are compared against. Written as
// "e-mail" and "e-posta" for legibility, they would otherwise never match the "e mail" a header
// becomes, and the whole email column would silently go unmapped.
const NORMALISED_ALIASES = Object.fromEntries(Object.entries(HEADER_ALIASES).map(([field, aliases]) => [field, aliases.map(normaliseHeader)]));
/**
 * Short aliases are exact-match only. "not" is Turkish for note and "ad" is Turkish for name; as
 * substrings they would claim any column whose title happens to contain those letters.
 */
const MIN_SUBSTRING_ALIAS = 4;
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
function guessColumnMapping(headers) {
    const mapping = {};
    const normalised = headers.map(normaliseHeader);
    const taken = new Set();
    const claim = (field, matches) => {
        for (const alias of NORMALISED_ALIASES[field]) {
            const index = normalised.findIndex((h, i) => !taken.has(i) && h !== '' && matches(h, alias));
            if (index !== -1) {
                mapping[field] = index;
                taken.add(index);
                return;
            }
        }
    };
    const fields = Object.keys(HEADER_ALIASES);
    for (const field of fields)
        claim(field, (h, a) => h === a);
    for (const field of fields) {
        if (mapping[field] === undefined) {
            claim(field, (h, a) => a.length >= MIN_SUBSTRING_ALIAS && h.includes(a));
        }
    }
    return mapping;
}
/**
 * Splits a single "full name" column into first and last.
 *
 * Only used when the file has a name column but no separate surname. Everything after the first
 * space is the surname: a patient recorded as "Marie Claire Dubois" keeps "Claire Dubois" together
 * rather than losing a name, which matters when staff search for someone by the name on a passport.
 */
function splitFullName(value) {
    const parts = value.trim().split(/\s+/);
    if (parts.length <= 1)
        return { firstName: parts[0] ?? '' };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}
/**
 * Reduces a phone number to the bare digits the CRM stores everywhere else, so an imported number
 * and an inbound WhatsApp message land on the same person.
 *
 * A leading 00 is the international prefix written out and becomes nothing, the way + does.
 */
function normalisePhone(value) {
    const digits = value.replace(/\D/g, '');
    return digits.startsWith('00') ? digits.slice(2) : digits;
}
//# sourceMappingURL=csv.js.map