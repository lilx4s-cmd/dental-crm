import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Boom } from '@hapi/boom';
import makeWASocket, { DisconnectReason, type WASocket } from '@whiskeysockets/baileys';
import * as QRCode from 'qrcode';

import { PrismaService } from '../prisma/prisma.service';
import { usePrismaAuthState } from './baileys-auth-state';
import { WhatsAppService } from './whatsapp.service';

export type WebConnectionState = 'disabled' | 'disconnected' | 'connecting' | 'awaiting_scan' | 'connected';

/**
 * Links the clinic's existing WhatsApp number by QR, the way WhatsApp Web does.
 *
 * This drives WhatsApp through an unofficial client, which Meta's terms prohibit and which can get
 * the number banned. That is a commercial decision the clinic has taken deliberately, as a stopgap
 * while Cloud API verification is in progress — the two paths write to the same Conversation and
 * Message tables precisely so switching later changes how messages arrive, not what the CRM holds.
 *
 * Off unless WHATSAPP_WEB_ENABLED is set. An unofficial client that starts itself on every boot is
 * not something that should arrive by surprise in a deploy.
 */
@Injectable()
export class WhatsAppWebService {
  private readonly logger = new Logger(WhatsAppWebService.name);
  private readonly enabled: boolean;

  private socket: WASocket | null = null;
  private state: WebConnectionState = 'disconnected';
  /** Current pairing QR as a data URL. Cleared the moment it is used or expires. */
  private qrDataUrl: string | null = null;
  private linkedNumber: string | null = null;
  private lastError: string | null = null;
  /** Guards against two connect attempts racing into two sockets on one session. */
  private connecting = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    // Reuses the Cloud API service's storage path so both transports record a message identically.
    private readonly whatsapp: WhatsAppService,
  ) {
    this.enabled = this.config.get<string>('whatsapp.webEnabled') === 'true';
    if (!this.enabled) this.state = 'disabled';
  }

  status() {
    return {
      enabled: this.enabled,
      state: this.state,
      qrDataUrl: this.state === 'awaiting_scan' ? this.qrDataUrl : null,
      linkedNumber: this.linkedNumber,
      error: this.lastError,
    };
  }

  /**
   * Opens a connection, emitting a QR if the session needs pairing.
   *
   * Deliberately not called on boot: a restart during clinic hours would otherwise reconnect an
   * unofficial client with nobody watching. Somebody presses the button.
   */
  async connect(): Promise<void> {
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        'WhatsApp Web is switched off. Set WHATSAPP_WEB_ENABLED=true to enable it.',
      );
    }
    if (this.connecting || this.state === 'connected') return;

    this.connecting = true;
    this.lastError = null;
    this.state = 'connecting';

    try {
      const { state, saveCreds, clear } = await usePrismaAuthState(this.prisma);

      const sock = makeWASocket({
        auth: state,
        // Nothing renders a terminal here; the QR goes to the browser instead.
        printQRInTerminal: false,
        // Identifies the linked device in the patient's WhatsApp app, so staff can see what it is
        // and revoke it from the phone if they ever need to.
        browser: ['Dental CRM', 'Chrome', '1.0.0'],
        // Without this Baileys re-downloads the entire message history on every reconnect, which
        // on a busy number is a large, slow and pointless transfer.
        syncFullHistory: false,
      });
      this.socket = sock;

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
          this.state = 'awaiting_scan';
        }

        if (connection === 'open') {
          this.state = 'connected';
          this.qrDataUrl = null;
          this.linkedNumber = sock.user?.id?.split(':')[0] ?? null;
          this.logger.log(`WhatsApp Web linked as ${this.linkedNumber ?? 'unknown'}`);
        }

        if (connection === 'close') {
          const code = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
          const loggedOut = code === DisconnectReason.loggedOut;

          this.socket = null;
          this.qrDataUrl = null;
          this.state = 'disconnected';

          if (loggedOut) {
            // The phone unlinked this device. Stale credentials would make the next connect fail
            // in a way that looks like a bug rather than "scan again".
            await clear();
            this.linkedNumber = null;
            this.lastError = 'The phone unlinked this device. Scan the QR again to reconnect.';
            this.logger.warn('WhatsApp Web session logged out from the phone');
          } else {
            this.lastError = lastDisconnect?.error?.message ?? 'Connection closed';
            this.logger.warn(`WhatsApp Web disconnected (${code ?? 'no code'}) — reconnecting`);
            // Any other drop is transient. Reconnect after a pause rather than hammering.
            setTimeout(() => void this.connect().catch(() => undefined), 5_000);
          }
        }
      });

      sock.ev.on('messages.upsert', async ({ messages, type }) => {
        // 'notify' is genuinely new traffic; 'append' is history being backfilled, which would
        // otherwise replay old conversations into the CRM as if they had just arrived.
        if (type !== 'notify') return;
        for (const msg of messages) {
          await this.ingest(msg).catch((e) =>
            this.logger.error(`Failed to store inbound message: ${(e as Error).message}`),
          );
        }
      });
    } catch (e) {
      this.state = 'disconnected';
      this.lastError = e instanceof Error ? e.message : 'Failed to connect';
      this.logger.error(`WhatsApp Web connect failed: ${this.lastError}`);
    } finally {
      this.connecting = false;
    }
  }

  /** Unlinks and forgets the session, so the next connect starts from a fresh QR. */
  async logout(): Promise<void> {
    const { clear } = await usePrismaAuthState(this.prisma);
    try {
      await this.socket?.logout();
    } catch {
      // Already gone from the phone's side; clearing local state is what matters.
    }
    await clear();
    this.socket = null;
    this.state = this.enabled ? 'disconnected' : 'disabled';
    this.qrDataUrl = null;
    this.linkedNumber = null;
  }

  async sendText(toPhone: string, text: string): Promise<void> {
    if (this.state !== 'connected' || !this.socket) {
      throw new ServiceUnavailableException('WhatsApp Web is not connected');
    }
    const jid = `${toPhone.replace(/\D/g, '')}@s.whatsapp.net`;
    await this.socket.sendMessage(jid, { text });
  }

  /**
   * Stores an inbound message against the right lead.
   *
   * Outbound messages are skipped: `fromMe` covers anything the clinic sent from the phone itself,
   * and recording those as patient replies would corrupt both the thread and the follow-up timing
   * that My Day derives from it.
   */
  private async ingest(msg: { key: { remoteJid?: string | null; fromMe?: boolean | null; id?: string | null }; message?: unknown; pushName?: string | null }) {
    if (msg.key.fromMe) return;

    const jid = msg.key.remoteJid ?? '';
    // Groups and status broadcasts are not patient conversations.
    if (!jid.endsWith('@s.whatsapp.net')) return;

    const body = this.extractText(msg.message);
    if (!body) return;

    // Without an id the message cannot be deduplicated, so a reconnect would store it again.
    if (!msg.key.id) return;

    const phone = jid.split('@')[0];
    await this.whatsapp.storeInbound(phone, body, msg.key.id);
  }

  /** Plain text only for now; media arrives as a caption or is ignored. */
  private extractText(message: unknown): string | null {
    const m = message as Record<string, { text?: string; caption?: string } | undefined> | undefined;
    if (!m) return null;
    return (
      m.conversation?.toString?.() ??
      m.extendedTextMessage?.text ??
      m.imageMessage?.caption ??
      m.videoMessage?.caption ??
      m.documentMessage?.caption ??
      null
    );
  }
}
