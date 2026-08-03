import { normalizePhoneForWhatsApp, buildWhatsAppGreeting, buildWhatsAppLink } from './whatsapp';

describe('normalizePhoneForWhatsApp', () => {
  it('strips formatting', () => {
    expect(normalizePhoneForWhatsApp('+90 (555) 123-45-67')).toBe('905551234567');
  });

  it('substitutes Turkey\'s country code for a local trunk zero', () => {
    expect(normalizePhoneForWhatsApp('0555 123 45 67')).toBe('905551234567');
  });

  it('leaves a number that already carries a country code alone', () => {
    expect(normalizePhoneForWhatsApp('+971 50 123 4567')).toBe('971501234567');
    expect(normalizePhoneForWhatsApp('+1 415 555 0100')).toBe('14155550100');
  });

  it('treats a leading 00 as the international prefix, not a trunk zero', () => {
    // Gulf patients routinely write their number this way. Read as a local number it became
    // 900966…, which opens a chat with nobody.
    expect(normalizePhoneForWhatsApp('00966 50 123 4567')).toBe('966501234567');
    expect(normalizePhoneForWhatsApp('0090 555 123 45 67')).toBe('905551234567');
  });

  it('returns nothing usable for input with no digits', () => {
    expect(normalizePhoneForWhatsApp('n/a')).toBe('');
  });
});

describe('buildWhatsAppLink', () => {
  it('builds a wa.me link with the greeting encoded', () => {
    expect(buildWhatsAppLink('0555 123 45 67', 'Ahmed', 'Kerem Clinic')).toBe(
      'https://wa.me/905551234567?text=Hello%20Ahmed%2C%20this%20is%20Kerem%20Clinic.',
    );
  });

  it('returns null when there is no usable number', () => {
    // Callers hide the button on null rather than linking to a chat that cannot open.
    expect(buildWhatsAppLink(null, 'Ahmed', 'Kerem Clinic')).toBeNull();
    expect(buildWhatsAppLink('', 'Ahmed', 'Kerem Clinic')).toBeNull();
    expect(buildWhatsAppLink('—', 'Ahmed', 'Kerem Clinic')).toBeNull();
  });

  it('encodes a name that would otherwise break the query string', () => {
    const link = buildWhatsAppLink('+905551234567', 'A&B #1', 'Kerem Clinic');
    expect(link).toContain('A%26B%20%231');
  });
});

describe('buildWhatsAppGreeting', () => {
  it('reads as a person wrote it', () => {
    expect(buildWhatsAppGreeting('Ahmed', 'Kerem Clinic')).toBe('Hello Ahmed, this is Kerem Clinic.');
  });
});
