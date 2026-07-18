import { Injectable, Logger } from '@nestjs/common';
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

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
  ) {
    this.token = config.get<string>('WHATSAPP_CLOUD_API_TOKEN');
    this.phoneNumberId = config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
  }

  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    const verifyToken = this.config.get<string>('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
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
