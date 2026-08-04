import { decryptSecret, encryptSecret, hasDedicatedEncryptionKey } from './secret-box';

describe('secret-box', () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = 'a-test-signing-secret-of-more-than-32-characters';
    delete process.env.ENCRYPTION_KEY;
  });

  afterAll(() => {
    process.env = original;
  });

  it('round-trips a secret', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it('produces different ciphertext each time, so equal secrets are not visibly equal', () => {
    // A deterministic scheme would let anyone with read access see that two accounts share a
    // secret, and would leak that a secret was unchanged after a re-enrolment.
    const a = encryptSecret('JBSWY3DPEHPK3PXP');
    const b = encryptSecret('JBSWY3DPEHPK3PXP');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(decryptSecret(b));
  });

  it('carries a version, so a future key rotation can recognise old values', () => {
    expect(encryptSecret('x').startsWith('v1.')).toBe(true);
  });

  it('refuses a ciphertext that has been tampered with', () => {
    // GCM makes the value tamper-evident: a row edited by someone with write access must fail to
    // decrypt rather than quietly yield a different secret.
    const encrypted = encryptSecret('JBSWY3DPEHPK3PXP');
    const [v, iv, tag, ct] = encrypted.split('.');
    const flipped = ct.slice(0, -2) + (ct.slice(-2) === 'AA' ? 'BB' : 'AA');
    expect(() => decryptSecret([v, iv, tag, flipped].join('.'))).toThrow();
  });

  it('refuses a value in an unrecognised format', () => {
    expect(() => decryptSecret('not-encrypted')).toThrow(/recognised format/);
    expect(() => decryptSecret('v2.a.b.c')).toThrow(/recognised format/);
  });

  it('cannot read a value encrypted under a different key', () => {
    const encrypted = encryptSecret('JBSWY3DPEHPK3PXP');
    process.env.JWT_ACCESS_SECRET = 'a-completely-different-secret-over-32-chars';
    expect(() => decryptSecret(encrypted)).toThrow();
  });

  it('prefers a dedicated key when one is set', () => {
    expect(hasDedicatedEncryptionKey()).toBe(false);

    process.env.ENCRYPTION_KEY = 'a-dedicated-encryption-key-of-32-plus-chars';
    expect(hasDedicatedEncryptionKey()).toBe(true);

    // Derived independently of the signing secret, so rotating one does not silently break values
    // encrypted under the other.
    const withDedicated = encryptSecret('JBSWY3DPEHPK3PXP');
    delete process.env.ENCRYPTION_KEY;
    expect(() => decryptSecret(withDedicated)).toThrow();
  });

  it('says so plainly when there is no key at all', () => {
    delete process.env.JWT_ACCESS_SECRET;
    expect(() => encryptSecret('x')).toThrow(/ENCRYPTION_KEY/);
  });
});
