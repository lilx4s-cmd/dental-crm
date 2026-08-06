import { formatBytes } from '@dental-crm/shared';

/**
 * Presentation helpers that more than one screen needs.
 *
 * Each of these existed twice before it lived here. That is not a tidiness complaint: two copies of
 * a label map drift, and the version that drifts is always the one nobody was looking at. The lead
 * card and the filter bar disagreed about nothing yet, but the next person to add a lead source
 * would have added it to one of them.
 */

/**
 * What a lead source is called on screen.
 *
 * Was duplicated between the kanban card and the filter bar — so a board could show "Facebook"
 * while the filter offering it said something else, and adding a source meant remembering both.
 */
export const SOURCE_LABELS: Record<string, string> = {
  WALK_IN: 'Walk-in',
  PHONE: 'Phone',
  WHATSAPP: 'WhatsApp',
  FACEBOOK_ADS: 'Facebook',
  INSTAGRAM_ADS: 'Instagram',
  GOOGLE: 'Google',
  REFERRAL: 'Referral',
  WEBSITE: 'Website',
  OTHER: 'Other',
};

export function sourceLabel(source: string | null | undefined): string {
  if (!source) return '';
  return SOURCE_LABELS[source] ?? source;
}

/** Initials for an avatar. Was defined identically in the card and the detail sheet. */
export function initials(firstName?: string | null, lastName?: string | null): string {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

/**
 * An ISO country code as its flag emoji.
 *
 * Arithmetic on the code points rather than a table of 250 entries: regional indicator symbols sit
 * at U+1F1E6 in the same order as A–Z. Anything that is not two letters returns nothing, and the
 * code prints beside it either way — the flag is a scanning aid, not the label.
 */
export function countryFlag(code: string | null | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return '';
  return String.fromCodePoint(
    ...code.toUpperCase().split('').map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

/** Whole days since an ISO timestamp. */
export function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/**
 * A short relative age: "3m", "2h", "5d".
 *
 * Abbreviated because it sits at the end of a truncating line, and every character it takes is one
 * the text beside it loses.
 */
export function shortAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

/**
 * A file size for a person.
 *
 * Re-exported from the shared package rather than reimplemented. The attachment tray had its own
 * copy that rendered one decimal place under 10 MB where the shared one rounds — so the same file
 * read "4.2 MB" beside the composer and "4 MB" in the error message that refused it.
 */
export { formatBytes as formatSize };

/**
 * How a warranty's status is coloured.
 *
 * Was defined identically in the staff warranty section and the patient portal's copy of it. The
 * portal is the one that matters: a patient reading "voided" in the same neutral grey as "expired"
 * would not know that one of them is the clinic withdrawing cover.
 */
export const WARRANTY_STATUS_VARIANT: Record<string, 'success' | 'destructive' | 'warning' | 'outline'> = {
  ACTIVE: 'success',
  EXPIRED: 'outline',
  VOIDED: 'destructive',
  CLAIMED: 'warning',
};
