/**
 * What may be uploaded, and how large.
 *
 * There was no policy at all: `mimeType` was `z.string()` and `sizeBytes` was `@Min(0)` with no
 * ceiling. Two consequences, both reachable by any authenticated user.
 *
 * The first is stored cross-site scripting. Supabase serves a signed URL with whatever content
 * type the object was stored under, so an uploaded `.svg` or `.html` containing a script executes
 * on that origin — and it sits in the same bucket as the radiographs and passport scans. An
 * allowlist is the control; `Content-Disposition: attachment` on download is the belt to its
 * braces, and both are cheaper than either alone is reliable.
 *
 * The second is simply cost: nothing bounded the size of anything.
 *
 * Shared, so the file picker offers exactly what the API will accept. A picker that lets someone
 * choose a 200 MB video and a server that then refuses it is a worse experience than one that
 * never offered.
 */

const MB = 1024 * 1024;

export interface UploadRule {
  /** Exact MIME types. No wildcards — `image/*` would admit `image/svg+xml`, which is script. */
  readonly mimeTypes: readonly string[];
  readonly maxBytes: number;
  /** For the file picker's `accept` attribute. */
  readonly accept: string;
  readonly label: string;
}

/**
 * SVG is deliberately absent from every rule.
 *
 * It is an image to a person and a script container to a browser. Nothing clinical needs it, and
 * admitting it for the sake of a logo would undo the allowlist.
 */
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;
const PDF = 'application/pdf';
/** What a CT scanner actually produces. Browsers do not render it, which is part of why it is safe. */
const DICOM = ['application/dicom', 'application/octet-stream'] as const;

/**
 * What a conversation carries.
 *
 * The widest allowlist in the system, and deliberately so: a patient sends what a patient sends —
 * a photo of their teeth, a scan of an insurance letter, a voice note, a video of a symptom — and
 * refusing it means they send it to somebody's personal WhatsApp instead, where it is outside the
 * record entirely. The clinic replies with quotes, itineraries and spreadsheets.
 *
 * Still an allowlist, and the exclusions are the point:
 *
 * - **No SVG.** An image to a person, a script container to a browser.
 * - **No HTML, XML or anything else a browser renders as markup.** Same reason.
 * - **No executables, installers or scripts** — `.exe`, `.msi`, `.sh`, `.bat`, `.js`. Nothing in a
 *   dental conversation needs them, and a signed URL to one is a delivery mechanism.
 *
 * `application/octet-stream` is absent too, which is a real cost: it is what some browsers report
 * for an unusual file, and those uploads will be refused. Admitting it would admit everything,
 * since it is also what an `.exe` reports.
 */
const MESSAGE_IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif'] as const;
const MESSAGE_VIDEO = ['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp', 'video/x-msvideo'] as const;
// WhatsApp voice notes arrive as OGG/Opus; iOS records m4a; Android often amr.
const MESSAGE_AUDIO = [
  'audio/ogg', 'audio/opus', 'audio/mpeg', 'audio/mp4', 'audio/m4a', 'audio/x-m4a',
  'audio/aac', 'audio/wav', 'audio/webm', 'audio/amr', 'audio/3gpp',
] as const;
const MESSAGE_DOC = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  // Plain text only. `text/html` and `text/xml` are deliberately absent — a browser renders those.
  'text/plain',
  'text/csv',
] as const;
const MESSAGE_ARCHIVE = [
  'application/zip',
  'application/x-zip-compressed',
  'application/x-7z-compressed',
  'application/x-rar-compressed',
  'application/vnd.rar',
] as const;

export const MESSAGE_ATTACHMENT_TYPES = [
  ...MESSAGE_IMAGE,
  ...MESSAGE_VIDEO,
  ...MESSAGE_AUDIO,
  ...MESSAGE_DOC,
  ...MESSAGE_ARCHIVE,
] as const;

export const UPLOAD_RULES: Readonly<Record<string, UploadRule>> = {
  /**
   * 100 MB, which is a compromise stated rather than hidden.
   *
   * WhatsApp itself caps media at 16 MB for the Cloud API and 100 MB for documents, so anything
   * above that cannot be *sent* even though it can be stored — the composer says so at 16 MB
   * rather than letting the send fail. The ceiling is here for the other direction: a patient's
   * phone video arriving through a gateway that permits more.
   */
  MESSAGE_ATTACHMENT: {
    mimeTypes: MESSAGE_ATTACHMENT_TYPES,
    maxBytes: 100 * MB,
    accept:
      '.jpg,.jpeg,.png,.webp,.heic,.gif,.mp4,.mov,.webm,.3gp,.avi,.ogg,.opus,.mp3,.m4a,.aac,.wav,.amr,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.txt,.csv,.zip,.7z,.rar',
    label: 'Attachment',
  },
  // Radiographs come off the sensor as JPEG or PNG, or arrive as a PDF report from the imaging
  // centre. 25 MB covers a full-mouth series.
  XRAY: {
    mimeTypes: [...IMAGE_TYPES, PDF],
    maxBytes: 25 * MB,
    accept: '.jpg,.jpeg,.png,.webp,.heic,.pdf',
    label: 'X-ray',
  },
  // A CBCT volume is genuinely large. This is the one category where a high ceiling is the
  // clinical requirement rather than laxity.
  CT_SCAN: {
    mimeTypes: [...IMAGE_TYPES, PDF, ...DICOM],
    maxBytes: 300 * MB,
    accept: '.jpg,.jpeg,.png,.webp,.heic,.pdf,.dcm',
    label: 'CT scan',
  },
  PHOTO: { mimeTypes: IMAGE_TYPES, maxBytes: 25 * MB, accept: '.jpg,.jpeg,.png,.webp,.heic', label: 'Clinical photo' },
  BEFORE_PHOTO: { mimeTypes: IMAGE_TYPES, maxBytes: 25 * MB, accept: '.jpg,.jpeg,.png,.webp,.heic', label: 'Before' },
  AFTER_PHOTO: { mimeTypes: IMAGE_TYPES, maxBytes: 25 * MB, accept: '.jpg,.jpeg,.png,.webp,.heic', label: 'After' },
  // A phone photograph of a passport page, or a scan. Smaller ceiling: nothing legitimate here is
  // large, and this is the most sensitive category in the bucket.
  PASSPORT: {
    mimeTypes: [...IMAGE_TYPES, PDF],
    maxBytes: 15 * MB,
    accept: '.jpg,.jpeg,.png,.webp,.heic,.pdf',
    label: 'Passport',
  },
  FLIGHT_TICKET: {
    mimeTypes: [...IMAGE_TYPES, PDF],
    maxBytes: 15 * MB,
    accept: '.jpg,.jpeg,.png,.webp,.heic,.pdf',
    label: 'Flight ticket',
  },
  DOCUMENT: {
    mimeTypes: [...IMAGE_TYPES, PDF],
    maxBytes: 25 * MB,
    accept: '.jpg,.jpeg,.png,.webp,.heic,.pdf',
    label: 'Document',
  },
  INVOICE_PDF: { mimeTypes: [PDF], maxBytes: 10 * MB, accept: '.pdf', label: 'Invoice' },
  WARRANTY_PDF: { mimeTypes: [PDF], maxBytes: 10 * MB, accept: '.pdf', label: 'Warranty' },
  // The fallback, and therefore the strictest: an unclassified upload gets the narrowest set.
  OTHER: {
    mimeTypes: [...IMAGE_TYPES, PDF],
    maxBytes: 15 * MB,
    accept: '.jpg,.jpeg,.png,.webp,.heic,.pdf',
    label: 'Other',
  },
};

export const DEFAULT_UPLOAD_CATEGORY = 'OTHER';

export function uploadRuleFor(category: string | null | undefined): UploadRule {
  return UPLOAD_RULES[category ?? DEFAULT_UPLOAD_CATEGORY] ?? UPLOAD_RULES[DEFAULT_UPLOAD_CATEGORY];
}

export interface UploadRejection {
  reason: 'type' | 'size';
  message: string;
}

/**
 * Whether this file may be stored under this category. Null means yes.
 *
 * Takes the *observed* type and size, not the claimed ones — the caller is responsible for having
 * read them from storage rather than from the request body. See FilesService.confirm.
 */
export function rejectUpload(
  category: string | null | undefined,
  mimeType: string,
  sizeBytes: number,
): UploadRejection | null {
  const rule = uploadRuleFor(category);
  // A browser appends parameters to some types: `image/jpeg; charset=binary`.
  const bare = mimeType.split(';')[0].trim().toLowerCase();

  if (!rule.mimeTypes.includes(bare)) {
    return {
      reason: 'type',
      message: `${rule.label} accepts ${rule.mimeTypes.join(', ')}. This file is ${bare || 'of unknown type'}.`,
    };
  }
  if (sizeBytes > rule.maxBytes) {
    return {
      reason: 'size',
      message: `${rule.label} files must be under ${formatBytes(rule.maxBytes)}. This one is ${formatBytes(sizeBytes)}.`,
    };
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes >= MB) return `${Math.round(bytes / MB)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

/**
 * Whether a storage key is one this API would have issued for this owner.
 *
 * `confirm` used to write whatever `s3Key` the client sent, so a `File` row could be pointed at any
 * object in the bucket — including one belonging to a different patient — and then downloaded
 * through the signed-URL endpoint. The path shape is set in FilesService.signUpload.
 */
export function isOwnedStorageKey(s3Key: string, ownerType: string, ownerId: string): boolean {
  if (s3Key.includes('..') || s3Key.startsWith('/')) return false;
  return s3Key.startsWith(`${ownerType}/${ownerId}/`);
}

/**
 * What kind of thing a file is, for choosing a preview.
 *
 * Derived from the MIME type rather than the extension: the extension is whatever the sender's
 * phone chose, and a `.jpg` that is really a PDF should draw a PDF icon. The type on the row is
 * the one storage observed, so it is the trustworthy one.
 */
export type FileKind = 'image' | 'video' | 'audio' | 'pdf' | 'document' | 'spreadsheet' | 'archive' | 'text' | 'other';

export function fileKind(mimeType: string | null | undefined): FileKind {
  const bare = (mimeType ?? '').split(';')[0].trim().toLowerCase();
  if (!bare) return 'other';

  // Prefix matching is safe here in a way it is not in the allowlist: this only chooses an icon.
  // A type that slipped through as an image would already have passed `rejectUpload`.
  if (bare.startsWith('image/')) return 'image';
  if (bare.startsWith('video/')) return 'video';
  if (bare.startsWith('audio/')) return 'audio';
  if (bare === 'application/pdf') return 'pdf';

  if (bare.includes('spreadsheet') || bare.includes('ms-excel') || bare === 'text/csv') return 'spreadsheet';
  if (
    bare.includes('word') ||
    bare.includes('presentation') ||
    bare.includes('powerpoint') ||
    bare.includes('opendocument')
  ) {
    return 'document';
  }
  if (
    bare.includes('zip') ||
    bare.includes('7z-compressed') ||
    bare.includes('rar')
  ) {
    return 'archive';
  }
  if (bare.startsWith('text/')) return 'text';
  return 'other';
}

/**
 * What WhatsApp will actually carry.
 *
 * Storage accepts more than the transport does. Saying so in the composer — before a 40 MB video
 * is uploaded — is the difference between a clear refusal and an upload that succeeds and then
 * fails to send with a gateway error nobody can read.
 *
 * Figures are Meta's published Cloud API limits. Evolution and the QR transport are more
 * permissive, but the strictest is the honest thing to warn against, since which transport is
 * live can change without the person composing knowing.
 */
export const WHATSAPP_MEDIA_LIMITS: Readonly<Record<FileKind, number>> = {
  image: 5 * MB,
  video: 16 * MB,
  audio: 16 * MB,
  pdf: 100 * MB,
  document: 100 * MB,
  spreadsheet: 100 * MB,
  text: 100 * MB,
  archive: 100 * MB,
  other: 100 * MB,
};

/** Null when WhatsApp would carry it; otherwise why it will not. */
export function whatsappMediaWarning(mimeType: string, sizeBytes: number): string | null {
  const kind = fileKind(mimeType);
  const limit = WHATSAPP_MEDIA_LIMITS[kind];
  if (sizeBytes <= limit) return null;
  return `WhatsApp will not carry ${kind === 'other' ? 'a file' : `${kind}s`} over ${formatBytes(limit)}. This one is ${formatBytes(sizeBytes)} — it will be stored on the record, but the patient will not receive it.`;
}
