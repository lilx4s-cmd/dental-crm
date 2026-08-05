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
//# sourceMappingURL=upload-policy.d.ts.map