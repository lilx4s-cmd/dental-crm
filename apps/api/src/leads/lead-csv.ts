/**
 * Turning deals into a spreadsheet somebody opens in Excel.
 *
 * Two things here are not obvious and both were found by opening the result rather than reading
 * the code, so they are spelled out.
 */

/** UTF-8 BOM. */
const BOM = '﻿';

/**
 * Characters Excel and LibreOffice treat as the start of a formula.
 *
 * A lead's name is text somebody typed on a landing page. Exported as-is, a name beginning `=` is
 * evaluated when the file is opened — `=HYPERLINK(...)` and `=cmd|...` are the well-known shapes,
 * and the person opening it is a coordinator who has no reason to suspect a CSV of their own
 * pipeline. Prefixing with an apostrophe forces the cell to text; the apostrophe is not part of the
 * value and is not displayed.
 */
const FORMULA_LEAD = ['=', '+', '-', '@', '\t', '\r'];

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const raw = value instanceof Date ? value.toISOString() : String(value);
  const safe = FORMULA_LEAD.includes(raw[0]) ? `'${raw}` : raw;
  // Quote unconditionally rather than only when needed: a Turkish locale opens CSV with a
  // semicolon delimiter, and a name like "Yılmaz, Ahmet" is otherwise two columns in one locale
  // and one in another.
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv(headers: readonly string[], rows: readonly unknown[][]): string {
  // CRLF, because RFC 4180 says so and because Excel on Windows is the reader that matters here.
  const lines = [headers.map(cell).join(','), ...rows.map((row) => row.map(cell).join(','))];
  // The BOM is what makes Excel read the file as UTF-8. Without it, every Turkish and Arabic name
  // in the export arrives mangled — Ayşe becomes AyÅŸe — and the file looks like a bad export
  // rather than a missing three bytes.
  return BOM + lines.join('\r\n') + '\r\n';
}

/**
 * A filename that sorts chronologically and cannot escape the header.
 *
 * `Content-Disposition` is a header, so a newline or a quote in a filename splits the response.
 * Nothing user-supplied reaches this today, but the rule is cheaper to keep than to remember.
 */
export function exportFilename(prefix: string, at: Date): string {
  const stamp = at.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `${prefix.replace(/[^a-z0-9-]/gi, '')}-${stamp}.csv`;
}
