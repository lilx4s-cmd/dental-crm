import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { $Enums } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface FacebookLeadField {
  name: string;
  values: string[];
}

interface FacebookLeadGenEntry {
  leadgen_id: string;
  ad_id?: string;
  form_id?: string;
  field_data: FacebookLeadField[];
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

  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    const verifyToken = this.config.get<string>('FACEBOOK_WEBHOOK_VERIFY_TOKEN');
    if (mode === 'subscribe' && token === verifyToken) return challenge;
    return null;
  }

  verifySignature(rawBody: Buffer, signature: string): boolean {
    if (!this.appSecret) return true; // skip verification if not configured
    const expected = `sha256=${createHmac('sha256', this.appSecret).update(rawBody).digest('hex')}`;
    return expected === signature;
  }

  async handleLeadGenEvent(body: Record<string, unknown>): Promise<void> {
    try {
      const entries: FacebookLeadGenEntry[] = (body as any)?.entry ?? [];
      for (const entry of entries) {
        if (!entry.leadgen_id) continue;
        await this.processLeadGenEntry(entry);
      }
    } catch (err) {
      this.logger.error('Error processing Facebook Lead webhook', err);
    }
  }

  private async processLeadGenEntry(entry: FacebookLeadGenEntry): Promise<void> {
    const fields: Record<string, string> = {};
    for (const f of entry.field_data ?? []) {
      fields[f.name] = f.values?.[0] ?? '';
    }

    const firstName = fields['first_name'] ?? fields['full_name']?.split(' ')[0] ?? 'Unknown';
    const lastName = fields['last_name'] ?? fields['full_name']?.split(' ').slice(1).join(' ') ?? undefined;
    const email = fields['email'] ?? undefined;
    const phone = fields['phone_number'] ?? fields['phone'] ?? undefined;

    // Find existing campaign by ad_id or form_id if available
    const campaign = entry.ad_id
      ? await this.prisma.campaign.findFirst({ where: { externalId: entry.ad_id } })
      : null;

    await this.prisma.lead.create({
      data: {
        firstName,
        lastName: lastName || undefined,
        email,
        phone,
        source: $Enums.LeadSource.FACEBOOK_ADS,
        stage: $Enums.PipelineStage.NEW_LEAD,
        status: $Enums.LeadStatus.ACTIVE,
        campaignId: campaign?.id,
        notes: `Auto-created from Facebook Lead Ad (leadgen_id: ${entry.leadgen_id})`,
      },
    });

    this.logger.log(`Lead created from Facebook Lead Ad: ${firstName} ${lastName ?? ''}`);
  }
}
