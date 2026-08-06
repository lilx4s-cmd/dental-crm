import { z } from 'zod';
import { LeadSource } from '../enums';

/**
 * One row of an imported CSV, after the browser has applied the column mapping.
 *
 * The same schema validates the preview and the request body, so a row the importer showed as
 * accepted is a row the API will accept — the alternative is a preview that promises 300 leads and
 * an import that quietly creates 240.
 *
 * Deliberately looser than CreateLeadSchema in two places. `source` falls back to OTHER because a
 * spreadsheet column saying "fb ad" should not cost the clinic the row, and `lastName` is optional
 * because plenty of enquiries arrive as a single name.
 */

/** Free-text source values seen in exports, mapped onto the enum the CRM stores. */
const SOURCE_ALIASES: Record<string, string> = {
  fb: LeadSource.FACEBOOK_ADS,
  facebook: LeadSource.FACEBOOK_ADS,
  'facebook ads': LeadSource.FACEBOOK_ADS,
  'facebook ad': LeadSource.FACEBOOK_ADS,
  meta: LeadSource.FACEBOOK_ADS,
  ig: LeadSource.INSTAGRAM_ADS,
  insta: LeadSource.INSTAGRAM_ADS,
  instagram: LeadSource.INSTAGRAM_ADS,
  'instagram ads': LeadSource.INSTAGRAM_ADS,
  wa: LeadSource.WHATSAPP,
  whatsapp: LeadSource.WHATSAPP,
  web: LeadSource.WEBSITE,
  website: LeadSource.WEBSITE,
  site: LeadSource.WEBSITE,
  phone: LeadSource.PHONE,
  call: LeadSource.PHONE,
  tel: LeadSource.PHONE,
  'walk in': LeadSource.WALK_IN,
  walkin: LeadSource.WALK_IN,
  referral: LeadSource.REFERRAL,
  reference: LeadSource.REFERRAL,
  google: LeadSource.GOOGLE,
  'google ads': LeadSource.GOOGLE,
  adwords: LeadSource.GOOGLE,
};

/** Resolves a spreadsheet's source text to a LeadSource, falling back to OTHER. */
export function coerceLeadSource(value: string | undefined | null): string {
  if (!value) return LeadSource.OTHER;
  const raw = value.trim();
  const upper = raw.toUpperCase().replace(/[\s-]+/g, '_');
  if (upper in LeadSource) return upper;
  const alias = SOURCE_ALIASES[raw.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')];
  return alias ?? LeadSource.OTHER;
}

/**
 * Reads a money column written by a spreadsheet.
 *
 * "1.250,50" (European), "1,250.50" (Anglo), "€1 250" and "2500 USD" all occur in the clinic's
 * lists. An unreadable value becomes undefined rather than 0 — a deal worth an unknown amount must
 * not be reported to the clinic as a deal worth nothing.
 */
export function parseImportedValue(value: string | undefined | null): number | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/[^\d.,-]/g, '').trim();
  if (!cleaned) return undefined;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalised: string;
  if (lastComma > lastDot) {
    // Comma is the decimal separator, so dots are thousands.
    normalised = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    normalised = cleaned.replace(/,/g, '');
  }

  const parsed = Number.parseFloat(normalised);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export const ImportedLeadSchema = z.object({
  firstName: z.string().trim().min(1, 'A name is required'),
  lastName: z.string().trim().optional(),
  // Bare digits, matching how phone numbers are held everywhere else in the CRM.
  phone: z.string().trim().optional(),
  whatsappNumber: z.string().trim().optional(),
  email: z.string().trim().email('Not a valid email').optional(),
  source: z.string().default(LeadSource.OTHER),
  /**
   * Resolved to ISO by the caller before it reaches here, so an unrecognised country is simply
   * absent rather than a two-letter string that means nothing. Same reasoning as `source` falling
   * back to OTHER: a column the importer cannot read must not cost the clinic the row.
   */
  country: z.string().trim().length(2).optional(),
  preferredLanguage: z.string().trim().min(2).max(3).optional(),
  estimatedValue: z.number().positive().optional(),
  currency: z.string().trim().length(3).optional(),
  notes: z.string().trim().optional(),
});

export type ImportedLead = z.infer<typeof ImportedLeadSchema>;

/** The most rows one import may carry. Past this a spreadsheet is a migration, not an import. */
export const LEAD_IMPORT_MAX_ROWS = 2000;

export const ImportLeadsSchema = z.object({
  leads: z.array(ImportedLeadSchema).min(1).max(LEAD_IMPORT_MAX_ROWS),
  /** Everyone in the file goes to this person; omitted means the importer owns them. */
  assignedToId: z.string().uuid().optional(),
  /**
   * Off by default. A clinic re-importing last month's list expects to add the new names, not a
   * second copy of everyone — but "skip" is still a choice someone should make knowingly.
   */
  skipDuplicates: z.boolean().default(true),
});

export type ImportLeadsInput = z.infer<typeof ImportLeadsSchema>;

export interface ImportLeadsResult {
  created: number;
  /** Rows matching a lead the CRM already holds, by phone or email. */
  skipped: number;
  /** 1-based row numbers as they appear in the file, so the message points at a line. */
  errors: { row: number; reason: string }[];
}
