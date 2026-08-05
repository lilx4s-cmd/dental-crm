import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { $Enums } from '@prisma/client';
import { DIAL_COUNTRIES, toE164Digits } from '@dental-crm/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * One `changes[]` item on a page subscription — what Meta actually posts.
 *
 * Note what is *not* here: the answers. A lead-ad webhook carries an identifier and nothing else;
 * the name, phone and email have to be fetched from the Graph API with a page token.
 *
 * The previous implementation read `entry.leadgen_id` and `entry.field_data` straight off the
 * entry. Neither exists — `leadgen_id` is nested under `changes[].value`, and `field_data` is
 * never in a webhook at all. So `if (!entry.leadgen_id) continue` skipped every delivery and the
 * integration silently created nothing. Confirmed against production: zero leads carry a
 * leadgen_id, and none is named "Unknown".
 */
interface LeadGenChangeValue {
  leadgen_id: string;
  page_id?: string;
  form_id?: string;
  ad_id?: string;
  adgroup_id?: string;
  created_time?: number;
}

interface FacebookEntry {
  id?: string;
  time?: number;
  changes?: Array<{ field?: string; value?: LeadGenChangeValue }>;
}

/** The Graph API's answer to `GET /{leadgen_id}`. */
interface GraphLead {
  id: string;
  created_time?: string;
  ad_id?: string;
  form_id?: string;
  field_data?: Array<{ name: string; values: string[] }>;
}

@Injectable()
export class FacebookService {
  private readonly logger = new Logger(FacebookService.name);
  private readonly appSecret: string | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.appSecret = config.get<string>('FACEBOOK_APP_SECRET');
  }

  /** Meta's one-time handshake when the webhook URL is registered. */
  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    const verifyToken = this.config.get<string>('FACEBOOK_WEBHOOK_VERIFY_TOKEN');
    // Nothing configured means nothing to verify against — refuse rather than accept any token.
    // Without this guard an absent token compared equal to an absent setting, so the handshake
    // succeeded for anybody who called it.
    if (!verifyToken) return null;
    if (mode === 'subscribe' && token === verifyToken) return challenge;
    return null;
  }

  /**
   * Whether this payload really came from Meta.
   *
   * Deliberately identical in shape to WhatsAppService.verifySignature. This used to return true
   * when no app secret was configured, so an integration nobody had finished setting up accepted
   * lead payloads from anyone who guessed the URL — and it compared with `===`, which leaks the
   * expected digest a byte at a time to anyone willing to measure the difference.
   */
  verifySignature(rawBody: Buffer | undefined, signature: string | undefined): boolean {
    if (!this.appSecret || !rawBody || !signature) return false;

    const expected = `sha256=${createHmac('sha256', this.appSecret).update(rawBody).digest('hex')}`;
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    // Length check first: timingSafeEqual throws on a length mismatch.
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async handleLeadGenEvent(body: Record<string, unknown>): Promise<void> {
    const entries = (body?.entry as FacebookEntry[] | undefined) ?? [];

    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        // A page subscription delivers more than leads — comments, mentions, ratings. Only one of
        // them is a lead, and the rest must not be mistaken for malformed ones.
        if (change.field && change.field !== 'leadgen') continue;
        const value = change.value;
        if (!value?.leadgen_id) continue;

        // Each lead is isolated. Meta retries a whole delivery it did not get a 200 for, so one
        // Graph call that times out must not discard the leads beside it — and must not throw,
        // because the retry would then re-create whatever had already been stored.
        try {
          await this.processLead(value);
        } catch (error) {
          this.logger.error(
            `Could not process leadgen_id ${value.leadgen_id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }
  }

  private async processLead(value: LeadGenChangeValue): Promise<void> {
    // Idempotent, because Meta retries. Two deals for one enquiry costs two salespeople's time and
    // one patient being telephoned twice.
    const already = await this.prisma.lead.findFirst({
      where: { notes: { contains: `leadgen_id: ${value.leadgen_id}` } },
      select: { id: true },
    });
    if (already) {
      this.logger.log(`leadgen_id ${value.leadgen_id} already captured — ignoring retry`);
      return;
    }

    const graphLead = await this.fetchLead(value.leadgen_id);
    const fields = this.flattenFields(graphLead?.field_data);

    const fullName = fields.full_name ?? '';
    const firstName = fields.first_name || fullName.split(' ')[0] || '';
    const lastName = fields.last_name || fullName.split(' ').slice(1).join(' ');
    const rawPhone = fields.phone_number || fields.phone || undefined;
    const country = this.countryOf(rawPhone);
    const normalisedPhone = rawPhone ? toE164Digits(rawPhone, country) : null;

    const campaign = value.ad_id
      ? await this.prisma.campaign.findFirst({ where: { externalId: value.ad_id } })
      : null;

    // When the Graph call could not be made there is no name and no phone — but the enquiry still
    // happened, and a lead nobody can see is worse than one that says why it is empty. It lands on
    // the board carrying the identifiers needed to look it up in Meta by hand.
    const unresolved = !graphLead;

    await this.prisma.lead.create({
      data: {
        firstName: firstName || (unresolved ? 'Meta lead — details not fetched' : 'Unknown'),
        lastName: lastName || undefined,
        email: fields.email || undefined,
        // Falls back to the raw value rather than dropping it: an unparseable number a human can
        // still read beats no number at all.
        phone: normalisedPhone ?? rawPhone,
        whatsappNumber: normalisedPhone ?? undefined,
        country,
        source: $Enums.LeadSource.FACEBOOK_ADS,
        stage: $Enums.PipelineStage.NEW_DEAL,
        status: $Enums.LeadStatus.ACTIVE,
        campaignId: campaign?.id,
        notes: this.noteFor(value, fields, unresolved),
      },
    });

    this.logger.log(
      unresolved
        ? `Captured leadgen_id ${value.leadgen_id} without details — set FACEBOOK_PAGE_ACCESS_TOKEN`
        : `Captured Facebook lead: ${`${firstName} ${lastName}`.trim() || value.leadgen_id}`,
    );
  }

  /**
   * Fetches the answers the webhook does not carry.
   *
   * Returns null rather than throwing when unconfigured or refused, so the caller can still record
   * that an enquiry arrived. Dropping it silently is precisely what the old code did.
   */
  private async fetchLead(leadgenId: string): Promise<GraphLead | null> {
    const token = this.config.get<string>('FACEBOOK_PAGE_ACCESS_TOKEN');
    if (!token) {
      this.logger.warn(
        'FACEBOOK_PAGE_ACCESS_TOKEN is not set — lead ads will arrive without a name or phone number.',
      );
      return null;
    }

    const version = this.config.get<string>('FACEBOOK_GRAPH_API_VERSION') ?? 'v20.0';
    const url =
      `https://graph.facebook.com/${version}/${encodeURIComponent(leadgenId)}` +
      `?fields=id,created_time,ad_id,form_id,field_data&access_token=${encodeURIComponent(token)}`;

    try {
      // Bounded, because Meta re-sends the entire delivery if this endpoint does not answer — a
      // slow Graph call would turn one enquiry into several.
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        this.logger.error(
          `Graph API refused leadgen_id ${leadgenId} (${response.status}): ${detail.slice(0, 200)}`,
        );
        return null;
      }
      return (await response.json()) as GraphLead;
    } catch (error) {
      this.logger.error(
        `Graph API unreachable for leadgen_id ${leadgenId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  /**
   * Meta names each field after the form's own label, and those are localised — `full_name`,
   * `الاسم الكامل` and `ad_soyad` are the same question. The common English keys are matched
   * directly; anything unrecognised is kept for the note rather than thrown away, because on an
   * Arabic-language form that is where the answers will be.
   */
  private flattenFields(fieldData: GraphLead['field_data']): Record<string, string> {
    const fields: Record<string, string> = {};
    for (const field of fieldData ?? []) {
      if (!field?.name) continue;
      fields[field.name.toLowerCase()] = field.values?.[0] ?? '';
    }
    return fields;
  }

  /**
   * Which country the number belongs to, read from its own dialling code.
   *
   * Only when the number arrives in international form, which Meta's phone field normally gives.
   * Inferring from anything else would reintroduce the bug the country column was added to fix: a
   * local-format number assumed Turkish and dialled to a stranger.
   */
  private countryOf(rawPhone: string | undefined): string | undefined {
    if (!rawPhone) return undefined;
    const digits = rawPhone.replace(/\D/g, '');
    if (!rawPhone.trim().startsWith('+') && !digits.startsWith('00')) return undefined;

    const e164 = digits.startsWith('00') ? digits.slice(2) : digits;
    // Longest dialling code first, so 971 is not read as 9 and 966 is not read as 9.
    return [...DIAL_COUNTRIES]
      .sort((a, b) => b.dial.length - a.dial.length)
      .find((c) => e164.startsWith(c.dial))?.code;
  }

  /** Everything needed to find this enquiry again in Meta, plus any answer not mapped to a column. */
  private noteFor(
    value: LeadGenChangeValue,
    fields: Record<string, string>,
    unresolved: boolean,
  ): string {
    const mapped = new Set(['full_name', 'first_name', 'last_name', 'email', 'phone_number', 'phone']);
    const extra = Object.entries(fields)
      .filter(([name, answer]) => !mapped.has(name) && answer)
      .map(([name, answer]) => `${name}: ${answer}`);

    return [
      `Facebook Lead Ad (leadgen_id: ${value.leadgen_id}` +
        `${value.form_id ? `, form_id: ${value.form_id}` : ''}` +
        `${value.ad_id ? `, ad_id: ${value.ad_id}` : ''})`,
      unresolved
        ? 'Details could not be fetched from the Graph API — look this leadgen_id up in Meta and complete the record by hand.'
        : '',
      ...extra,
    ]
      .filter(Boolean)
      .join('\n');
  }
}
