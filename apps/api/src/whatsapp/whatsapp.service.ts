import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { $Enums } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from '../conversations/conversations.service';

interface WhatsAppTextMessage {
  from: string;
  id: string;
  timestamp: string;
  text: { body: string };
  type: 'text';
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly token: string | undefined;
  private readonly phoneNumberId: string | undefined;
  private readonly appSecret: string | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
  ) {
    // Read through the namespaced config block rather than raw env names, matching how every
    // other integration in this app is wired.
    this.token = config.get<string>('whatsapp.token');
    this.phoneNumberId = config.get<string>('whatsapp.phoneNumberId');
    this.appSecret = config.get<string>('whatsapp.appSecret');
  }

  /**
   * Whether the integration is usable, and what is missing if not. Presence only, never values.
   */
  status() {
    const missing: string[] = [];
    if (!this.token) missing.push('WHATSAPP_CLOUD_API_TOKEN');
    if (!this.phoneNumberId) missing.push('WHATSAPP_PHONE_NUMBER_ID');
    if (!this.config.get<string>('whatsapp.webhookVerifyToken')) missing.push('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
    if (!this.appSecret) missing.push('WHATSAPP_APP_SECRET');
    return {
      configured: missing.length === 0,
      missing,
      canSend: !!this.token && !!this.phoneNumberId,
      canReceive: !!this.appSecret,
    };
  }

  /**
   * Checks that an inbound webhook really came from Meta.
   *
   * Refuses when no app secret is configured, rather than waving the request through. This
   * endpoint is public by necessity, so an unverified POST is an open door into the clinic's
   * conversation history — and an integration nobody has configured has no business ingesting
   * messages at all. The failure is visible during setup, which is the right time to find it.
   */
  verifySignature(rawBody: Buffer | undefined, signature: string | undefined): boolean {
    if (!this.appSecret || !rawBody || !signature) return false;

    const expected = `sha256=${createHmac('sha256', this.appSecret).update(rawBody).digest('hex')}`;
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    // Length check first: timingSafeEqual throws on a length mismatch, and comparing in constant
    // time keeps the digest from being recoverable one byte at a time.
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** Meta's one-time handshake when the webhook URL is registered. */
  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    const verifyToken = this.config.get<string>('whatsapp.webhookVerifyToken');
    // Nothing configured means nothing to verify against — refuse rather than accept any token.
    if (!verifyToken) return null;
    if (mode === 'subscribe' && token === verifyToken) return challenge;
    return null;
  }

  async handleInbound(body: Record<string, unknown>): Promise<void> {
    try {
      const entry = (body as any)?.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const messages: WhatsAppTextMessage[] = value?.messages ?? [];

      for (const msg of messages) {
        if (msg.type !== 'text') continue;

        const phone = msg.from;
        const content = msg.text?.body;
        const externalMessageId = msg.id;

        const lead = await this.prisma.lead.findFirst({
          where: { OR: [{ phone }, { whatsappNumber: phone }] },
          orderBy: { createdAt: 'desc' },
        });
        const patient = await this.prisma.patient.findFirst({
          where: { OR: [{ phone }, { whatsappNumber: phone }] },
        });

        await this.conversations.createInboundMessage(
          $Enums.ConversationChannel.WHATSAPP,
          phone,
          content,
          externalMessageId,
          lead?.id,
          patient?.id,
        );
      }
    } catch (err) {
      this.logger.error('Error processing WhatsApp webhook', err);
    }
  }

  async sendTextMessage(to: string, text: string): Promise<void> {
    if (!this.token || !this.phoneNumberId) {
      this.logger.warn('WhatsApp credentials not configured — message not sent');
      return;
    }

    const url = `https://graph.facebook.com/v20.0/${this.phoneNumberId}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`WhatsApp send failed: ${err}`);
    }
  }
}
