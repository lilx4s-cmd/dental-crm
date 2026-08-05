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

export const UPLOAD_RULES: Readonly<Record<string, UploadRule>> = {
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
