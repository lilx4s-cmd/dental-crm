import { rejectUpload, fileKind, whatsappMediaWarning } from '@dental-crm/shared';

/**
 * The composer's own rules, tested against the shared policy the API enforces.
 *
 * The hook itself needs a DOM, an auth context and a working XMLHttpRequest to exercise, and a
 * test that stubs all three ends up asserting on the stubs. What is worth pinning down is the
 * decisions it makes *before* any of that: which files it refuses outright, which it accepts with
 * a caution, and which get a local preview. Those are pure, and they are what a user sees.
 */
const MB = 1024 * 1024;
const CATEGORY = 'MESSAGE_ATTACHMENT';

const file = (name: string, type: string, size: number) =>
  ({ name, type, size }) as unknown as File;

/** Mirrors the branch in `add()` that decides whether to make an object URL. */
const wouldPreview = (type: string) => {
  const kind = fileKind(type);
  return kind === 'image' || kind === 'video';
};

describe('what the composer accepts', () => {
  it('takes the things a patient sends from a phone', () => {
    const sent = [
      file('tooth.jpg', 'image/jpeg', 3 * MB),
      file('IMG_0042.heic', 'image/heic', 4 * MB),
      file('symptom.mp4', 'video/mp4', 12 * MB),
      file('voice.ogg', 'audio/ogg', 300 * 1024),
      file('insurance.pdf', 'application/pdf', 2 * MB),
    ];
    for (const f of sent) {
      expect(rejectUpload(CATEGORY, f.type, f.size)).toBeNull();
    }
  });

  it('takes the things the clinic replies with', () => {
    const sent = [
      file('quote.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', MB),
      file('costs.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', MB),
      file('itinerary.txt', 'text/plain', 4 * 1024),
      file('records.zip', 'application/zip', 20 * MB),
    ];
    for (const f of sent) {
      expect(rejectUpload(CATEGORY, f.type, f.size)).toBeNull();
    }
  });

  it('refuses a file the browser cannot type', () => {
    // A file with no type reports as octet-stream, which is also what an executable reports.
    // Refusing it is a real cost, taken deliberately.
    const f = file('unknown.bin', '', 1024);
    expect(rejectUpload(CATEGORY, f.type || 'application/octet-stream', f.size)?.reason).toBe('type');
  });

  it('refuses a script disguised as an image', () => {
    expect(rejectUpload(CATEGORY, 'image/svg+xml', 1024)?.reason).toBe('type');
  });

  it('refuses a file past the storage ceiling', () => {
    expect(rejectUpload(CATEGORY, 'video/mp4', 250 * MB)?.reason).toBe('size');
  });
});

describe('what gets a local preview', () => {
  it('previews images and video, which a browser can render from a blob', () => {
    expect(wouldPreview('image/jpeg')).toBe(true);
    expect(wouldPreview('video/mp4')).toBe(true);
  });

  it('does not try to preview a document', () => {
    // A PDF thumbnail at 160px tells you less than the word "PDF", and costs a render.
    expect(wouldPreview('application/pdf')).toBe(false);
    expect(wouldPreview('application/zip')).toBe(false);
    expect(wouldPreview('audio/ogg')).toBe(false);
  });
});

describe('the caution about WhatsApp', () => {
  it('is silent for what the transport will carry', () => {
    expect(whatsappMediaWarning('image/jpeg', 2 * MB)).toBeNull();
  });

  it('warns rather than refuses', () => {
    // Storage accepts more than WhatsApp does. The file is still worth keeping on the record, so
    // this is a caution on an accepted upload, not a rejection.
    const oversized = whatsappMediaWarning('image/jpeg', 20 * MB);
    expect(oversized).not.toBeNull();
    expect(rejectUpload(CATEGORY, 'image/jpeg', 20 * MB)).toBeNull();
  });

  it('applies the limit for the kind', () => {
    // 20 MB is fine as a PDF and too large as an image, which one flat number could not express.
    expect(whatsappMediaWarning('application/pdf', 20 * MB)).toBeNull();
    expect(whatsappMediaWarning('image/jpeg', 20 * MB)).not.toBeNull();
  });
});

describe('the retry rule', () => {
  /** Mirrors the guard in `retry()`. */
  const canRetry = (type: string, size: number) => !rejectUpload(CATEGORY, type, size);

  it('offers a retry for a dropped connection', () => {
    // The file is fine; the network was not. This is the case retry exists for.
    expect(canRetry('image/jpeg', 3 * MB)).toBe(true);
  });

  it('does not offer one for a file the allowlist refused', () => {
    // It would fail identically every time. A button that cannot work is worse than none.
    expect(canRetry('image/svg+xml', 1024)).toBe(false);
    expect(canRetry('video/mp4', 250 * MB)).toBe(false);
  });
});
