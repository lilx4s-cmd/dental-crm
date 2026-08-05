# Security Report

**Date:** 2026-08-04 · **Commit:** `7dd97e6` · Source inspection plus verification against the live
system. Severities reflect impact on *this* clinic, not a generic checklist.

---

## Posture

Phase A closed six of the ten findings from the original gap analysis. What remains is narrower and
more specific than what was there a week ago.

### Sound, and verified

| Control | Evidence |
|---|---|
| Sign-in throttling | 10/15min per IP, successes uncounted, plus per-account lockout escalating 15/30/60 min |
| No account oracle | Unknown addresses run a dummy bcrypt compare; `/forgot-password` answers identically either way; all four reset refusals share one message |
| Password policy | 12 chars, blocklist including clinic-specific words, own-name check — shared between API and UI |
| 2FA | TOTP, secrets AES-256-GCM encrypted at rest, 8 hashed single-use recovery codes; challenge token carries a `purpose` claim `JwtStrategy` rejects |
| Audit trail | Interceptor over clinical/financial/access routes, records refused requests, redacts by key, depth-limited |
| CSRF | Origin allowlist + double-submit on `/auth/refresh` — the only cookie-authenticated route |
| RBAC | 137 routes; every non-public one guarded; the 5 public ones verified correct |
| Injection | Prisma parameterised throughout; no raw SQL concatenation found |
| Rate limiting | Five tiers: global 300, login 10, reset 5, portal 30, intake 10 |
| Transport | helmet, `trust proxy: 1` set narrowly so `X-Forwarded-For` cannot be forged |

**Verified in production:** the audit trail recorded seven real password resets with
`body={"newPassword":"[redacted]"}` — redaction works on live data, not just in tests.

---

## Open findings

### F-1 · File uploads accept any type and any size · **High**

`ConfirmFileDto` and `CreateUploadUrlDto` take `mimeType: string` and `sizeBytes: @Min(0)`. There is
no allowlist and no ceiling.

Two consequences:

- **Stored XSS is reachable** if any file is ever served inline. Supabase serves a signed URL with
  the content type it was stored under, so an uploaded `.svg` or `.html` containing script executes
  on that origin. Radiographs and passport scans live in the same bucket.
- **Unbounded storage.** Any authenticated user can upload any volume.

**Fix:** an allowlist (`image/jpeg`, `image/png`, `application/pdf`, `application/dicom`), a size
cap per category, and `Content-Disposition: attachment` on download so nothing renders inline. ~2 days.

### F-2 · `mimeType`, `sizeBytes` and `s3Key` are client claims, never verified · **High**

`confirm()` writes whatever the client sends. A caller can claim a 100-byte JPEG and store a 2 GB
executable, and — because `s3Key` is also client-supplied — can create a `File` row pointing at
**any object in the bucket**, including one belonging to another patient.

**Fix:** verify the object with a HEAD against storage before writing the row, and require the
`s3Key` to match a path this API issued for this owner. ~2 days.

### F-3 · File access is authorised by owner *type*, not owner *record* · **High**

`assertOwnerAccess(ownerType, user)` checks whether the role may see `PATIENT` files at all. It
never checks *which* patient. Any role with patient-file access can enumerate `ownerId` and read
every patient's radiographs and passport scans.

For a small clinic where every dentist sees every patient this may be acceptable — but it should be
a decision, not an accident, and it fails the "minimum necessary" principle both KVKK and GDPR use.

**Fix:** scope by assignment where an assignment exists. ~3 days. **Needs your decision on the
policy first.**

### F-4 · Portal share links never expire and cannot be revoked · **Medium**

`TreatmentPlanShareLink` is hashed, which is right, but has no expiry and no revocation. A link
forwarded to a family member — or left in an old inbox — works forever, and it exposes a full
treatment plan with clinical detail and pricing.

**Fix:** expiry (30 days default), a revoke button, and a last-accessed timestamp. ~2 days.

### F-5 · Medical data is not encrypted at rest beyond disk encryption · **Medium**

`medications`, `medicalConditions`, `isPregnant`, `takesBloodThinners`, `previousSurgeries` are
plaintext columns. Supabase encrypts the volume, which protects against someone stealing the disk —
not against a leaked backup, a read replica, or an over-broad database credential.

The machinery now exists: `secret-box.ts` does AES-256-GCM with versioned ciphertext, built for TOTP
secrets. Extending it to these columns is mostly migration work. ~4 days.

### F-6 · No secret rotation procedure · **Medium**

`JWT_ACCESS_SECRET` has never been rotated and there is no mechanism to. Worse now than before:
until `ENCRYPTION_KEY` is set on Render, the 2FA encryption key derives from it, so rotating the
signing secret would make every enrolled authenticator undecryptable.

**Fix:** set `ENCRYPTION_KEY` (removes the coupling), then document a rotation runbook. ~1 day.

### F-7 · The audit trail cannot be read from the application · **Medium**

Rows are written correctly and there is no UI. An audit log nobody can search is evidence in
principle only — and in a dispute the person who needs it will not be holding a psql prompt.

**Fix:** a filtered, paginated viewer in Settings, Super Admin only. ~3 days.

### F-8 · Backups have never been restore-tested · **Critical** · *blocked on you*

Unchanged from the original analysis and still the cheapest insurance on the roadmap. Supabase takes
backups; nobody has restored one, so the recovery-time objective is unknown. **Needs your Supabase
access.**

### F-9 · No dependency-scanning gate · **Low**

CI runs `npm audit --audit-level=high` but advisory-only, deliberately. Correct for now; revisit if
the advisory count grows.

---

## Explicitly checked and *not* found

Stated so the absence is known rather than assumed:

- **SQL injection** — no raw query interpolation anywhere.
- **XSS in React** — no `dangerouslySetInnerHTML` in any component.
- **Secrets in the repo** — `apps/api/.env` is gitignored; no credential literals in tracked source.
- **Webhook forgery** — Facebook and WhatsApp webhooks verify HMAC with `timingSafeEqual` and
  *refuse* rather than accept when unconfigured.
- **Mass assignment** — global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted`.
- **Open redirect** — no user-controlled redirect targets.

---

## Priority order

| | Finding | Days | Blocked? |
|---|---|---|---|
| 1 | F-8 backup restore drill | 0.5 | **you** |
| 2 | F-1 + F-2 upload validation and verification | 4 | no |
| 3 | F-4 share-link expiry | 2 | no |
| 4 | F-6 set `ENCRYPTION_KEY`, then rotation runbook | 1 | **you** (env var) |
| 5 | F-7 audit viewer | 3 | no |
| 6 | F-3 per-record file scoping | 3 | **you** (policy) |
| 7 | F-5 field-level encryption | 4 | no |
