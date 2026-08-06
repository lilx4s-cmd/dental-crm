import {
  UPLOAD_RULES,
  fileKind,
  formatBytes,
  isOwnedStorageKey,
  rejectUpload,
  whatsappMediaWarning,
  uploadRuleFor,
} from '@dental-crm/shared';

/**
 * There was no policy: `mimeType` was an unconstrained string and `sizeBytes` had no ceiling, on a
 * bucket holding radiographs and passport scans.
 */
describe('rejectUpload', () => {
  it('accepts what a clinic actually uploads', () => {
    expect(rejectUpload('XRAY', 'image/jpeg', 4_000_000)).toBeNull();
    expect(rejectUpload('PHOTO', 'image/png', 2_000_000)).toBeNull();
    expect(rejectUpload('PASSPORT', 'application/pdf', 500_000)).toBeNull();
    // Phones produce these, and a receptionist should not have to convert them first.
    expect(rejectUpload('PHOTO', 'image/heic', 3_000_000)).toBeNull();
  });

  it('refuses SVG everywhere, because it is a script container', () => {
    // The reason there are no wildcards: `image/*` would have admitted this. Supabase serves an
    // object with the content type it was stored under, so an SVG with a <script> executes on the
    // storage origin — in the same bucket as the radiographs.
    for (const category of Object.keys(UPLOAD_RULES)) {
      expect(rejectUpload(category, 'image/svg+xml', 1000)?.reason).toBe('type');
    }
  });

  it('refuses HTML and scripts', () => {
    expect(rejectUpload('DOCUMENT', 'text/html', 1000)?.reason).toBe('type');
    expect(rejectUpload('DOCUMENT', 'application/javascript', 1000)?.reason).toBe('type');
  });

  it('refuses an executable dressed as a document', () => {
    expect(rejectUpload('DOCUMENT', 'application/x-msdownload', 1000)?.reason).toBe('type');
  });

  it('ignores the parameters a browser appends to a type', () => {
    // `image/jpeg; charset=binary` is still a JPEG.
    expect(rejectUpload('PHOTO', 'image/jpeg; charset=binary', 1000)).toBeNull();
    expect(rejectUpload('PHOTO', 'IMAGE/JPEG', 1000)).toBeNull();
  });

  it('caps the size per category', () => {
    expect(rejectUpload('PHOTO', 'image/jpeg', 26 * 1024 * 1024)?.reason).toBe('size');
    expect(rejectUpload('PASSPORT', 'image/jpeg', 16 * 1024 * 1024)?.reason).toBe('size');
  });

  it('allows a CBCT volume to be genuinely large', () => {
    // The one category where a high ceiling is the clinical requirement, not laxity.
    expect(rejectUpload('CT_SCAN', 'application/dicom', 250 * 1024 * 1024)).toBeNull();
    expect(rejectUpload('CT_SCAN', 'application/dicom', 400 * 1024 * 1024)?.reason).toBe('size');
  });

  it('falls back to the strictest rule for an unknown category', () => {
    // An unclassified upload should get the narrowest set, not the widest.
    expect(rejectUpload('NOT_A_CATEGORY', 'application/dicom', 1000)?.reason).toBe('type');
    expect(rejectUpload(undefined, 'text/html', 1000)?.reason).toBe('type');
    expect(uploadRuleFor(null).label).toBe('Other');
  });

  it('says what is wrong in a sentence a person can act on', () => {
    const rejection = rejectUpload('PASSPORT', 'image/jpeg', 20 * 1024 * 1024);
    expect(rejection?.message).toContain('15 MB');
    expect(rejection?.message).toContain('20 MB');
  });
});

describe('isOwnedStorageKey', () => {
  it('accepts a key this API would have issued', () => {
    expect(isOwnedStorageKey('PATIENT/p1/uuid-scan.jpg', 'PATIENT', 'p1')).toBe(true);
  });

  it('refuses a key belonging to another record', () => {
    // The attack: confirm a File row pointing at another patient's radiograph, then read it back
    // through the signed-URL endpoint. `confirm` used to write whatever s3Key it was handed.
    expect(isOwnedStorageKey('PATIENT/p2/uuid-scan.jpg', 'PATIENT', 'p1')).toBe(false);
    expect(isOwnedStorageKey('LEAD/p1/uuid-scan.jpg', 'PATIENT', 'p1')).toBe(false);
  });

  it('refuses traversal and absolute paths', () => {
    expect(isOwnedStorageKey('PATIENT/p1/../p2/scan.jpg', 'PATIENT', 'p1')).toBe(false);
    expect(isOwnedStorageKey('/PATIENT/p1/scan.jpg', 'PATIENT', 'p1')).toBe(false);
  });

  it('is not fooled by a prefix that merely starts the same', () => {
    // p1 must not match p10.
    expect(isOwnedStorageKey('PATIENT/p10/scan.jpg', 'PATIENT', 'p1')).toBe(false);
  });
});

describe('formatBytes', () => {
  it('reads the way a person would say it', () => {
    expect(formatBytes(15 * 1024 * 1024)).toBe('15 MB');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(512)).toBe('512 bytes');
  });
});

/**
 * Conversations carry the widest set in the system, so the exclusions are what matter.
 *
 * A patient sends what a patient sends — a photo, a voice note, a scan of an insurance letter —
 * and refusing it means they send it to somebody's personal WhatsApp, outside the record entirely.
 * That argument does not extend to anything a browser will execute.
 */
describe('message attachments', () => {
  const ok = (mime: string, bytes = 1024) => rejectUpload('MESSAGE_ATTACHMENT', mime, bytes);

  it('accepts what patients actually send', () => {
    for (const mime of [
      'image/jpeg',
      'image/heic',
      'video/mp4',
      'video/quicktime',
      'audio/ogg', // WhatsApp voice notes
      'audio/amr', // Android recorders
      'application/pdf',
    ]) {
      expect(ok(mime)).toBeNull();
    }
  });

  it('accepts what the clinic replies with', () => {
    for (const mime of [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv',
      'application/zip',
    ]) {
      expect(ok(mime)).toBeNull();
    }
  });

  it('refuses SVG, however convenient', () => {
    // An image to a person, a script container to a browser — and it would sit in the same bucket
    // as the radiographs and passport scans.
    expect(ok('image/svg+xml')?.reason).toBe('type');
  });

  it('refuses anything a browser renders as markup', () => {
    expect(ok('text/html')?.reason).toBe('type');
    expect(ok('text/xml')?.reason).toBe('type');
    expect(ok('application/xhtml+xml')?.reason).toBe('type');
  });

  it('refuses executables and scripts', () => {
    for (const mime of [
      'application/x-msdownload',
      'application/x-msdos-program',
      'application/x-sh',
      'text/javascript',
      'application/javascript',
    ]) {
      expect(ok(mime)?.reason).toBe('type');
    }
  });

  it('refuses the catch-all type', () => {
    // `application/octet-stream` is what a browser reports for an unusual file — and also what an
    // .exe reports. Admitting it would admit everything. The cost is real and accepted.
    expect(ok('application/octet-stream')?.reason).toBe('type');
  });

  it('bounds the size', () => {
    expect(ok('video/mp4', 500 * 1024 * 1024)?.reason).toBe('size');
  });

  it('tolerates a charset parameter', () => {
    expect(ok('text/plain; charset=utf-8')).toBeNull();
  });
});

describe('fileKind', () => {
  it('classifies by MIME type, not by extension', () => {
    // The extension is whatever the sender's phone chose. The type is what storage observed.
    expect(fileKind('application/pdf')).toBe('pdf');
    expect(fileKind('image/jpeg')).toBe('image');
    expect(fileKind('video/quicktime')).toBe('video');
    expect(fileKind('audio/ogg')).toBe('audio');
  });

  it('tells a spreadsheet from a document', () => {
    expect(fileKind('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('spreadsheet');
    expect(fileKind('application/vnd.ms-excel')).toBe('spreadsheet');
    expect(fileKind('text/csv')).toBe('spreadsheet');
    expect(fileKind('application/msword')).toBe('document');
    expect(fileKind('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('document');
  });

  it('recognises archives', () => {
    expect(fileKind('application/zip')).toBe('archive');
    expect(fileKind('application/vnd.rar')).toBe('archive');
  });

  it('falls back rather than throwing', () => {
    expect(fileKind(null)).toBe('other');
    expect(fileKind('')).toBe('other');
    expect(fileKind('application/x-unheard-of')).toBe('other');
  });
});

describe('whatsappMediaWarning', () => {
  const MB = 1024 * 1024;

  it('says nothing when WhatsApp will carry it', () => {
    expect(whatsappMediaWarning('image/jpeg', 2 * MB)).toBeNull();
    expect(whatsappMediaWarning('application/pdf', 40 * MB)).toBeNull();
  });

  it('warns before the upload rather than after the send', () => {
    // Storage accepts more than the transport does. Saying so in the composer is the difference
    // between a clear refusal and a gateway error nobody can read.
    const warning = whatsappMediaWarning('image/jpeg', 20 * MB);
    expect(warning).toContain('WhatsApp');
    expect(warning).toContain('will be stored');
  });

  it('uses the limit for the kind, not one number for everything', () => {
    // A 20 MB PDF is fine; a 20 MB image is not.
    expect(whatsappMediaWarning('application/pdf', 20 * MB)).toBeNull();
    expect(whatsappMediaWarning('image/jpeg', 20 * MB)).not.toBeNull();
  });
});
