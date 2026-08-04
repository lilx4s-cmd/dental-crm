// Shared WhatsApp deep-link helpers. Used by the pipeline card, the lead detail sheet, My Day and
// the treatment-plan tab, so phone normalisation and the greeting format live in one place.

import { toE164Digits } from '@dental-crm/shared';

/**
 * Normalizes a raw phone number into the digits-only format wa.me expects.
 *
 * Delegates to the shared country-aware normaliser. It used to assume any number with a leading
 * zero was Turkish, which is wrong for a clinic that advertises across the Gulf: a Saudi patient's
 * `055 512 3456` — written the way they write it at home — became `+90 555 123 456`, a real
 * Turkish number belonging to somebody else. A trunk zero means nothing without a country, which
 * is why `country` is now carried on the lead and passed in here.
 *
 * With no country, a local-format number is returned without a dialling code rather than being
 * guessed at. `buildWhatsAppLink` refuses to build a link from that — an unopenable link is
 * better than one that opens a chat with a stranger.
 */
export function normalizePhoneForWhatsApp(rawPhone: string, countryCode?: string | null): string {
  return toE164Digits(rawPhone, countryCode) ?? '';
}

/** The "Hello {name}, this is {clinic}." greeting used to prefill new WhatsApp chats. */
export function buildWhatsAppGreeting(patientName: string, clinicName: string): string {
  return `Hello ${patientName}, this is ${clinicName}.`;
}

/**
 * Builds a wa.me deep link pre-filled with a greeting. Returns null when there's no usable phone
 * number so callers can hide or disable the button instead of linking to a broken chat.
 */
export function buildWhatsAppLink(
  rawPhone: string | null | undefined,
  patientName: string,
  clinicName: string,
  countryCode?: string | null,
): string | null {
  if (!rawPhone) return null;
  const phone = normalizePhoneForWhatsApp(rawPhone, countryCode);
  if (!phone) return null;
  const text = encodeURIComponent(buildWhatsAppGreeting(patientName, clinicName));
  return `https://wa.me/${phone}?text=${text}`;
}
