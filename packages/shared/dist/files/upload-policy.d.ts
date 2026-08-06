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
export interface UploadRule {
    /** Exact MIME types. No wildcards — `image/*` would admit `image/svg+xml`, which is script. */
    readonly mimeTypes: readonly string[];
    readonly maxBytes: number;
    /** For the file picker's `accept` attribute. */
    readonly accept: string;
    readonly label: string;
}
export declare const MESSAGE_ATTACHMENT_TYPES: readonly ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif", "video/mp4", "video/quicktime", "video/webm", "video/3gpp", "video/x-msvideo", "audio/ogg", "audio/opus", "audio/mpeg", "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/aac", "audio/wav", "audio/webm", "audio/amr", "audio/3gpp", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/vnd.oasis.opendocument.text", "application/vnd.oasis.opendocument.spreadsheet", "text/plain", "text/csv", "application/zip", "application/x-zip-compressed", "application/x-7z-compressed", "application/x-rar-compressed", "application/vnd.rar"];
export declare const UPLOAD_RULES: Readonly<Record<string, UploadRule>>;
export declare const DEFAULT_UPLOAD_CATEGORY = "OTHER";
export declare function uploadRuleFor(category: string | null | undefined): UploadRule;
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
export declare function rejectUpload(category: string | null | undefined, mimeType: string, sizeBytes: number): UploadRejection | null;
export declare function formatBytes(bytes: number): string;
/**
 * Whether a storage key is one this API would have issued for this owner.
 *
 * `confirm` used to write whatever `s3Key` the client sent, so a `File` row could be pointed at any
 * object in the bucket — including one belonging to a different patient — and then downloaded
 * through the signed-URL endpoint. The path shape is set in FilesService.signUpload.
 */
export declare function isOwnedStorageKey(s3Key: string, ownerType: string, ownerId: string): boolean;
/**
 * What kind of thing a file is, for choosing a preview.
 *
 * Derived from the MIME type rather than the extension: the extension is whatever the sender's
 * phone chose, and a `.jpg` that is really a PDF should draw a PDF icon. The type on the row is
 * the one storage observed, so it is the trustworthy one.
 */
export type FileKind = 'image' | 'video' | 'audio' | 'pdf' | 'document' | 'spreadsheet' | 'archive' | 'text' | 'other';
export declare function fileKind(mimeType: string | null | undefined): FileKind;
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
export declare const WHATSAPP_MEDIA_LIMITS: Readonly<Record<FileKind, number>>;
/** Null when WhatsApp would carry it; otherwise why it will not. */
export declare function whatsappMediaWarning(mimeType: string, sizeBytes: number): string | null;
//# sourceMappingURL=upload-policy.d.ts.map