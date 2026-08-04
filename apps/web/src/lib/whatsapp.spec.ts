import { normalizePhoneForWhatsApp, buildWhatsAppGreeting, buildWhatsAppLink } from './whatsapp';

describe('normalizePhoneForWhatsApp', () => {
  it('strips formatting', () => {
    expect(normalizePhoneForWhatsApp('+90 (555) 123-45-67')).toBe('905551234567');
  });

  it('resolves a trunk zero against the country it was given', () => {
    // The bug this replaces: any leading zero was assumed Turkish, so a Saudi patient's number
    // opened a chat with a real Turkish stranger. The clinic advertises across the Gulf.
    expect(normalizePhoneForWhatsApp('055 512 3456', 'SA')).toBe('966555123456');
    expect(normalizePhoneForWhatsApp('0555 123 45 67', 'TR')).toBe('905551234567');
    expect(normalizePhoneForWhatsApp('050 123 4567', 'AE')).toBe('971501234567');
  });

  it('leaves a number that already carries a country code alone', () => {
    expect(normalizePhoneForWhatsApp('+971 50 123 4567')).toBe('971501234567');
    expect(normalizePhoneForWhatsApp('+1 415 555 0100')).toBe('14155550100');
  });

  it('treats a leading 00 as the international prefix, not a trunk zero', () => {
    expect(normalizePhoneForWhatsApp('00966 55 512 3456')).toBe('966555123456');
    expect(normalizePhoneForWhatsApp('0090 555 123 45 67')).toBe('905551234567');
  });

  it('lets an explicit country code beat a contradicting country field', () => {
    // Someone who typed +44 means +44. Overriding them would be the same mistake in a new shape.
    expect(normalizePhoneForWhatsApp('+44 7700 900123', 'TR')).toBe('447700900123');
  });

  it('returns nothing usable for input with no digits', () => {
    expect(normalizePhoneForWhatsApp('n/a')).toBe('');
  });
});

describe('buildWhatsAppLink', () => {
  it('builds a wa.me link with the greeting encoded', () => {
    expect(buildWhatsAppLink('0555 123 45 67', 'Ahmed', 'Kerem Clinic', 'TR')).toBe(
      'https://wa.me/905551234567?text=Hello%20Ahmed%2C%20this%20is%20Kerem%20Clinic.',
    );
  });

  it('uses the lead\'s country, so a Gulf number opens the right chat', () => {
    expect(buildWhatsAppLink('055 512 3456', 'Ahmed', 'Kerem Clinic', 'SA')).toContain(
      'wa.me/966555123456',
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
