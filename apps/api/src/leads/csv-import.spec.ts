import {
  coerceLeadSource,
  detectDelimiter,
  guessColumnMapping,
  normalisePhone,
  parseCsv,
  parseImportedValue,
  splitFullName,
} from '@dental-crm/shared';

// The importer's preview and the API's create path read the same file through these functions, so
// anything they get wrong is wrong in both places at once — a row the preview promises and the
// import silently drops, or a phone number that never matches the WhatsApp thread it belongs to.

describe('parseCsv', () => {
  it('keeps a comma that lives inside a quoted cell', () => {
    const rows = parseCsv('name,notes\nMarie,"wants implants, asked about pricing"');
    expect(rows[1]).toEqual(['Marie', 'wants implants, asked about pricing']);
  });

  it('keeps a newline inside a quoted cell rather than starting a row', () => {
    const rows = parseCsv('name,notes\nMarie,"line one\nline two"');
    expect(rows).toHaveLength(2);
    expect(rows[1][1]).toBe('line one\nline two');
  });

  it('reads a doubled quote as one literal quote', () => {
    const rows = parseCsv('name,notes\nMarie,"she said ""maybe next year"""');
    expect(rows[1][1]).toBe('she said "maybe next year"');
  });

  it('handles CRLF endings, which is what Excel writes', () => {
    const rows = parseCsv('name,phone\r\nMarie,05551112233\r\nJean,05551112244\r\n');
    expect(rows).toHaveLength(3);
    expect(rows[2]).toEqual(['Jean', '05551112244']);
  });

  it('strips the UTF-8 BOM instead of gluing it to the first header', () => {
    const rows = parseCsv('﻿name,phone\nMarie,0555');
    expect(rows[0][0]).toBe('name');
  });

  it('drops trailing blank lines rather than importing them as empty leads', () => {
    const rows = parseCsv('name,phone\nMarie,0555\n\n\n');
    expect(rows).toHaveLength(2);
  });

  it('preserves empty cells in the middle of a row', () => {
    const rows = parseCsv('name,phone,email\nMarie,,marie@example.com');
    expect(rows[1]).toEqual(['Marie', '', 'marie@example.com']);
  });
});

describe('detectDelimiter', () => {
  it('defaults to a comma', () => {
    expect(detectDelimiter('name,phone,email\nMarie,0555,a@b.c')).toBe(',');
  });

  it('spots the semicolons a European Excel writes', () => {
    expect(detectDelimiter('name;phone;email\nMarie;0555;a@b.c')).toBe(';');
  });

  it('ignores separators inside a quoted header', () => {
    // One real comma, three inside quotes: the file is still semicolon-separated.
    expect(detectDelimiter('"name, full";phone;email')).toBe(';');
  });
});

describe('guessColumnMapping', () => {
  it('matches ordinary English headers', () => {
    const mapping = guessColumnMapping(['First Name', 'Last Name', 'Phone', 'Email']);
    expect(mapping).toEqual({ firstName: 0, lastName: 1, phone: 2, email: 3 });
  });

  it('does not let "name" steal the column "first name" wanted', () => {
    // 'name' is an alias of firstName too, so without an exact-match pass the loose one could
    // claim column 0 and leave the real first-name column unmapped.
    const mapping = guessColumnMapping(['Name', 'First Name', 'Phone']);
    expect(mapping.firstName).toBe(1);
  });

  it('reads the Turkish and French headers the clinic actually keeps', () => {
    const mapping = guessColumnMapping(['Ad', 'Soyad', 'Telefon', 'E-posta']);
    expect(mapping).toEqual({ firstName: 0, lastName: 1, phone: 2, email: 3 });
  });

  it('never maps two fields to the same column', () => {
    const mapping = guessColumnMapping(['Phone', 'WhatsApp']);
    expect(mapping.phone).not.toBe(mapping.whatsappNumber);
  });

  it('leaves fields the file has no column for unmapped', () => {
    const mapping = guessColumnMapping(['Name', 'Phone']);
    expect(mapping.notes).toBeUndefined();
    expect(mapping.currency).toBeUndefined();
  });
});

describe('splitFullName', () => {
  it('keeps every part after the first as the surname', () => {
    // "Marie Claire Dubois" must stay findable by the name on the passport.
    expect(splitFullName('Marie Claire Dubois')).toEqual({ firstName: 'Marie', lastName: 'Claire Dubois' });
  });

  it('leaves a single name alone rather than inventing a surname', () => {
    expect(splitFullName('Marie')).toEqual({ firstName: 'Marie' });
  });

  it('collapses the double spaces a spreadsheet leaves behind', () => {
    expect(splitFullName('  Marie   Dubois ')).toEqual({ firstName: 'Marie', lastName: 'Dubois' });
  });
});

describe('normalisePhone', () => {
  it('reduces a written number to the digits the CRM stores', () => {
    expect(normalisePhone('+90 (555) 111-2233')).toBe('905551112233');
  });

  it('drops a 00 international prefix the way it drops a +', () => {
    expect(normalisePhone('0090 555 111 2233')).toBe('905551112233');
  });
});

describe('coerceLeadSource', () => {
  it('accepts the enum spelling as written', () => {
    expect(coerceLeadSource('FACEBOOK_ADS')).toBe('FACEBOOK_ADS');
  });

  it('accepts the enum spelling in a spreadsheet\'s casing', () => {
    expect(coerceLeadSource('facebook ads')).toBe('FACEBOOK_ADS');
  });

  it('maps the shorthand staff type', () => {
    expect(coerceLeadSource('fb')).toBe('FACEBOOK_ADS');
    expect(coerceLeadSource('IG')).toBe('INSTAGRAM_ADS');
  });

  it('falls back to OTHER rather than losing the row', () => {
    expect(coerceLeadSource('someone at the hotel')).toBe('OTHER');
    expect(coerceLeadSource('')).toBe('OTHER');
    expect(coerceLeadSource(undefined)).toBe('OTHER');
  });
});

describe('parseImportedValue', () => {
  it('reads an Anglo-formatted amount', () => {
    expect(parseImportedValue('1,250.50')).toBe(1250.5);
  });

  it('reads a European-formatted amount', () => {
    expect(parseImportedValue('1.250,50')).toBe(1250.5);
  });

  it('ignores currency symbols and spacing around the number', () => {
    expect(parseImportedValue('€ 2 500')).toBe(2500);
    expect(parseImportedValue('2500 USD')).toBe(2500);
  });

  it('returns undefined for an unreadable value rather than zero', () => {
    // A deal worth an unknown amount must not be reported to the clinic as a deal worth nothing.
    expect(parseImportedValue('ask them')).toBeUndefined();
    expect(parseImportedValue('')).toBeUndefined();
    expect(parseImportedValue('0')).toBeUndefined();
  });
});
