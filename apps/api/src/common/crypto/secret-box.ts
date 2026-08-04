import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Authenticated encryption for secrets that must be readable by the application but useless to
 * anyone who reads the database.
 *
 * The case that forced this is the TOTP secret. Storing it in clear would mean a leaked database
 * dump hands over the second factor alongside the password hashes — which is precisely the
 * situation a second factor exists to survive.
 *
 * AES-256-GCM, so the ciphertext is tamper-evident as well as unreadable: a row edited by someone
 * with write access fails to decrypt rather than quietly yielding a different secret.
 *
 * Format: `v1.<iv>.<authTag>.<ciphertext>`, all base64url. Versioned from the start so a future
 * key rotation or algorithm change can recognise and migrate old values instead of guessing.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96 bits, the size GCM is specified for.
const VERSION = 'v1';

/**
 * The key, derived once.
 *
 * A dedicated `ENCRYPTION_KEY` is the right answer and is what the warning asks for. Absent one,
 * the key is derived from `JWT_ACCESS_SECRET` via HKDF with a distinct info string — that is what
 * HKDF is for, and it gives a key cryptographically independent of the signing use, so this is not
 * "reusing the JWT secret" in the sense that phrase usually means.
 *
 * The hazard it does carry, and the reason for the warning: rotating `JWT_ACCESS_SECRET` would
 * make every stored TOTP secret undecryptable, so every enrolled user would need their recovery
 * codes. Those still work, because they are hashed separately — but it is a bad afternoon, and a
 * dedicated key avoids coupling two unrelated rotations.
 */
function deriveKey(): Buffer {
  const explicit = process.env.ENCRYPTION_KEY;
  if (explicit && explicit.length >= 32) {
    return Buffer.from(hkdfSync('sha256', explicit, '', 'dental-crm:secret-box:v1', 32));
  }

  const fallback = process.env.JWT_ACCESS_SECRET;
  if (!fallback) {
    throw new Error(
      'Cannot encrypt secrets: set ENCRYPTION_KEY (32+ characters), or JWT_ACCESS_SECRET as a fallback.',
    );
  }
  return Buffer.from(hkdfSync('sha256', fallback, '', 'dental-crm:secret-box:v1', 32));
}

/** True when a dedicated key is configured, so a status surface can say whether to expect one. */
export function hasDedicatedEncryptionKey(): boolean {
  return !!process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length >= 32;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, deriveKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

/**
 * Reverses `encryptSecret`.
 *
 * Throws on anything that is not intact and authentic — wrong key, truncated value, edited row.
 * Callers treat a throw as "this secret is unusable", which for 2FA means falling back to a
 * recovery code rather than silently letting someone past with a secret that failed to decrypt.
 */
export function decryptSecret(encoded: string): string {
  const [version, iv, authTag, ciphertext] = encoded.split('.');
  if (version !== VERSION || !iv || !authTag || !ciphertext) {
    throw new Error('Stored secret is not in a recognised format.');
  }

  const decipher = createDecipheriv(ALGORITHM, deriveKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
