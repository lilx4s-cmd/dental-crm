// Shared WhatsApp deep-link helpers. Used by both the pipeline card and the
// lead detail sheet so phone normalization and the greeting format only
// live in one place.

/**
 * Normalizes a raw phone number into the digits-only format wa.me expects.
 * Most of the clinic's numbers are Turkish and stored in local format
 * (leading "0", e.g. "0555 123 45 67"), which needs Turkey's country code
 * ("90") substituted in for wa.me to resolve it. Numbers that already carry
 * a country code (start with anything other than "0" after stripping
 * formatting, e.g. "+90...", "+1...") are left as-is.
 */
export function normalizePhoneForWhatsApp(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.startsWith('0')) return `90${digits.slice(1)}`;
  return digits;
}

/** The "Hello {name}, this is {clinic}." greeting used to prefill new WhatsApp chats. */
export function buildWhatsAppGreeting(patientName: string, clinicName: string): string {
  return `Hello ${patientName}, this is ${clinicName}.`;
}

/**
 * Builds a wa.me deep link pre-filled with a greeting. Returns null when
 * there's no usable phone number so callers can hide/disable the button
 * instead of linking to a broken chat.
 */
export function buildWhatsAppLink(
  rawPhone: string | null | undefined,
  patientName: string,
  clinicName: string,
): string | null {
  if (!rawPhone) return null;
  const phone = normalizePhoneForWhatsApp(rawPhone);
  if (!phone) return null;
  const text = encodeURIComponent(buildWhatsAppGreeting(patientName, clinicName));
  return `https://wa.me/${phone}?text=${text}`;
}
