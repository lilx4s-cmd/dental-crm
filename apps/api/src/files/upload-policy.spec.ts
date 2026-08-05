import {
  UPLOAD_RULES,
  formatBytes,
  isOwnedStorageKey,
  rejectUpload,
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
