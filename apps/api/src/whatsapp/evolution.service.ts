import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

import { WhatsAppService } from './whatsapp.service';

export type EvolutionState = 'not_configured' | 'unreachable' | 'close' | 'connecting' | 'open';

/**
 * Talks to a self-hosted Evolution API instance.
 *
 * Preferred over holding a WhatsApp socket inside this process: the session lives in a service
 * that stays up on its own, so a CRM deploy or restart no longer drops it, and the clinic is not
 * paying for an always-on API purely to keep a socket warm. Inbound messages arrive as webhooks
 * and go through WhatsAppService.storeInbound, the same path the Cloud API uses, so all three
 * transports record a message identically.
 *
 * Evolution issues two different tokens and they are not interchangeable — a global one for
 * managing instances and an instance one for sending. Using the wrong one is the usual cause of a
 * 401 that looks like a bad key.
 */
@Injectable()
export class EvolutionService {
  private readonly logger = new Logger(EvolutionService.name);
  private readonly baseUrl?: string;
  private readonly apiKey?: string;
  private readonly instance: string;
  private readonly webhookToken?: string;

  constructor(
    private readonly config: ConfigService,
    private readonly whatsapp: WhatsAppService,
  ) {
    // Trailing slashes would produce '//message/...' — harmless on most servers, not all.
    this.baseUrl = this.config.get<string>('evolution.url')?.trim().replace(/\/+$/, '') || undefined;
    this.apiKey = this.config.get<string>('evolution.apiKey') || undefined;
    this.instance = this.config.get<string>('evolution.instance') || 'dental-crm';
    this.webhookToken = this.config.get<string>('evolution.webhookToken') || undefined;
  }

  get configured(): boolean {
    return !!this.baseUrl && !!this.apiKey;
  }

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    if (!this.configured) {
      throw new ServiceUnavailableException('Evolution API is not configured');
    }
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', apikey: this.apiKey!, ...(init?.headers ?? {}) },
      // A hung WhatsApp gateway must not hold a CRM request open indefinitely.
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new ServiceUnavailableException(
        `Evolution API returned ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
      );
    }
    return (await res.json()) as T;
  }

  /**
   * Connection state, plus a pairing QR when one is waiting.
   *
   * Never throws — this drives a status card, and an unreachable gateway is information to show
   * rather than an error to swallow the page with.
   */
  async status(): Promise<{
    configured: boolean;
    state: EvolutionState;
    qrDataUrl: string | null;
    instance: string;
    error: string | null;
  }> {
    const base = { configured: this.configured, instance: this.instance, qrDataUrl: null, error: null };
    if (!this.configured) return { ...base, state: 'not_configured' };

    try {
      const res = await this.call<{ instance?: { state?: string } }>(
        `/instance/connectionState/${this.instance}`,
      );
      const state = (res.instance?.state ?? 'close') as EvolutionState;

      // Only fetch a QR when there is actually something to pair — calling connect on an open
      // instance is pointless traffic.
      if (state !== 'open') {
        const qr = await this.fetchQr().catch(() => null);
        return { ...base, state, qrDataUrl: qr };
      }
      return { ...base, state: 'open' };
    } catch (e) {
      return {
        ...base,
        state: 'unreachable',
        error: e instanceof Error ? e.message : 'Could not reach the Evolution API',
      };
    }
  }

  /** Asks Evolution to start pairing and returns the QR as a data URL. */
  async fetchQr(): Promise<string | null> {
    const res = await this.call<{ base64?: string; code?: string }>(`/instance/connect/${this.instance}`);
    if (!res.base64) return null;
    // Evolution sometimes returns the base64 already prefixed and sometimes bare.
    return res.base64.startsWith('data:') ? res.base64 : `data:image/png;base64,${res.base64}`;
  }

  async sendText(toPhone: string, text: string): Promise<void> {
    const number = toPhone.replace(/\D/g, '');
    await this.call(`/message/sendText/${this.instance}`, {
      method: 'POST',
      body: JSON.stringify({ number, text }),
    });
  }

  /**
   * Authorises an inbound webhook.
   *
   * Evolution does not sign its payloads the way Meta does, so a shared secret carried on the URL
   * is the available mechanism. Compared in constant time, and absent configuration rejects
   * everything — the endpoint is public, and an unauthenticated one is a way to write arbitrary
   * conversations into the clinic's history.
   */
  verifyWebhookToken(provided?: string): boolean {
    if (!this.webhookToken || !provided) return false;
    const a = Buffer.from(this.webhookToken);
    const b = Buffer.from(provided);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /**
   * Handles one webhook delivery.
   *
   * Only `messages.upsert` matters for the CRM. Messages the clinic sent itself are skipped:
   * recording them as patient replies would corrupt the thread and the follow-up timing My Day
   * derives from it.
   */
  async handleWebhook(body: Record<string, unknown>): Promise<void> {
    const event = String(body.event ?? '').toLowerCase();
    if (event !== 'messages.upsert') return;

    const data = body.data as
      | {
          key?: { remoteJid?: string; fromMe?: boolean; id?: string };
          message?: Record<string, { text?: string; caption?: string } | string | undefined>;
        }
      | undefined;
    if (!data?.key || data.key.fromMe) return;

    const jid = data.key.remoteJid ?? '';
    // Groups and status broadcasts are not patient conversations.
    if (!jid.endsWith('@s.whatsapp.net')) return;

    const id = data.key.id;
    // Without an id nothing can deduplicate a redelivery, and Evolution retries.
    if (!id) return;

    const text = this.extractText(data.message);
    if (!text) return;

    await this.whatsapp.storeInbound(jid.split('@')[0], text, id);
  }

  /** Plain text, or the caption on a media message. Media itself is not stored yet. */
  private extractText(message?: Record<string, { text?: string; caption?: string } | string | undefined>): string | null {
    if (!message) return null;
    const conversation = message.conversation;
    if (typeof conversation === 'string' && conversation.trim()) return conversation;

    const pick = (key: string, field: 'text' | 'caption') => {
      const node = message[key];
      return typeof node === 'object' && node ? (node[field] ?? null) : null;
    };

    return (
      pick('extendedTextMessage', 'text') ??
      pick('imageMessage', 'caption') ??
      pick('videoMessage', 'caption') ??
      pick('documentMessage', 'caption') ??
      null
    );
  }
}
