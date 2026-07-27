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
 * Drops that mean the session itself is finished, not that the network hiccuped. Reconnecting on
 * any of these just repeats the same rejection, and an unofficial client retrying in a tight loop
 * is one of the things that gets a number banned — the state is exactly what we are trying not to
 * provoke. Each needs a human: scan again, or stop the other client that took the session.
 */
const TERMINAL_DISCONNECTS = new Set<number>([
  DisconnectReason.loggedOut,
  DisconnectReason.connectionReplaced,
  DisconnectReason.badSession,
  DisconnectReason.forbidden,
  DisconnectReason.multideviceMismatch,
]);

/** Codes whose stored credentials are past saving, so the next connect must start from a QR. */
const CREDENTIALS_DEAD = new Set<number>([
  DisconnectReason.loggedOut,
  DisconnectReason.badSession,
  DisconnectReason.forbidden,
  DisconnectReason.multideviceMismatch,
]);

const TERMINAL_MESSAGES: Record<number, string> = {
  [DisconnectReason.loggedOut]: 'The phone unlinked this device. Scan the QR again to reconnect.',
  [DisconnectReason.connectionReplaced]:
    'Another WhatsApp Web session took over this number. Close it, then link again.',
  [DisconnectReason.badSession]: 'The stored session was rejected. Scan the QR again to start a fresh one.',
  [DisconnectReason.forbidden]: 'WhatsApp refused this device. Scan the QR again, or check the number is not banned.',
  [DisconnectReason.multideviceMismatch]:
    'The phone is not on multi-device WhatsApp. Update WhatsApp on the phone, then link again.',
};

/** Transient drops back off instead of retrying every five seconds forever. */
const RECONNECT_BASE_MS = 5_000;
const RECONNECT_MAX_MS = 120_000;
const RECONNECT_MAX_ATTEMPTS = 6;

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
  /**
   * The pending automatic reconnect, held so it can be cancelled. Without this, unlinking a device
   * was undone a few seconds later by a retry that had already been scheduled — staff pressed
   * "Unlink", watched it go, and found the phone linked again.
   */
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  /** Set when a person, or WhatsApp itself, has ended the session. Cleared by an explicit connect. */
  private stopped = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    // Reuses the Cloud API service's storage path so both transports record a message identically.
    private readonly whatsapp: WhatsAppService,
  ) {
    // Refuses to run alongside Evolution. Two WhatsApp clients on one number would each ingest
    // every inbound message, so every patient reply would appear twice in the CRM.
    const evolutionConfigured = !!this.config.get<string>('evolution.url');
    this.enabled = this.config.get<string>('whatsapp.webEnabled') === 'true' && !evolutionConfigured;
    if (evolutionConfigured) {
      this.logger.log('Evolution API is configured — the in-process WhatsApp session stays off.');
    }
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

    // A person asking is the one thing that clears a stop and starts the backoff over — pressing
    // the button after a bad run should try immediately rather than wait out the old delay. The
    // automatic retries below go through connectInternal so they cannot reset their own budget.
    this.cancelReconnect();
    this.stopped = false;
    this.reconnectAttempts = 0;

    await this.connectInternal();
  }

  private async connectInternal(): Promise<void> {
    if (!this.enabled || this.connecting || this.state === 'connected') return;

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
          this.reconnectAttempts = 0;
          this.linkedNumber = sock.user?.id?.split(':')[0] ?? null;
          this.logger.log(`WhatsApp Web linked as ${this.linkedNumber ?? 'unknown'}`);
        }

        if (connection === 'close') {
          const code = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;

          this.socket = null;
          this.qrDataUrl = null;
          this.state = 'disconnected';

          // A person pressed unlink while this drop was in flight. Honour that over any retry.
          if (this.stopped) return;

          if (code !== undefined && TERMINAL_DISCONNECTS.has(code)) {
            if (CREDENTIALS_DEAD.has(code)) {
              // Stale credentials would make the next connect fail in a way that looks like a bug
              // rather than "scan again".
              await clear();
              this.linkedNumber = null;
            }
            this.stopped = true;
            this.lastError = TERMINAL_MESSAGES[code] ?? 'The session ended. Scan the QR again to reconnect.';
            this.logger.warn(`WhatsApp Web session ended (${code}): ${this.lastError}`);
            return;
          }

          // 515 is the handshake's own restart, sent immediately after a successful scan. It is not
          // a failure, so it neither backs off nor counts against the attempt budget — treating it
          // as one used to put a two-minute delay between scanning and the session coming up.
          if (code === DisconnectReason.restartRequired) {
            this.logger.log('WhatsApp Web restart required after pairing — reconnecting');
            this.scheduleReconnect(0);
            return;
          }

          this.lastError = lastDisconnect?.error?.message ?? 'Connection closed';

          if (this.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
            this.stopped = true;
            this.lastError = `Gave up reconnecting after ${RECONNECT_MAX_ATTEMPTS} attempts. Last error: ${this.lastError}`;
            this.logger.error(this.lastError);
            return;
          }

          const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** this.reconnectAttempts);
          this.reconnectAttempts += 1;
          this.logger.warn(
            `WhatsApp Web disconnected (${code ?? 'no code'}) — retry ${this.reconnectAttempts}/${RECONNECT_MAX_ATTEMPTS} in ${delay / 1000}s`,
          );
          this.scheduleReconnect(delay);
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

  private scheduleReconnect(delayMs: number) {
    this.cancelReconnect();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.stopped) return;
      void this.connectInternal().catch(() => undefined);
    }, delayMs);
    // Nothing should be held open purely by a pending WhatsApp retry.
    this.reconnectTimer.unref?.();
  }

  private cancelReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /** Unlinks and forgets the session, so the next connect starts from a fresh QR. */
  async logout(): Promise<void> {
    // Order matters: stop first. A drop arriving mid-logout would otherwise schedule a retry that
    // relinks the device seconds after somebody deliberately unlinked it.
    this.stopped = true;
    this.cancelReconnect();
    this.reconnectAttempts = 0;

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
    this.lastError = null;
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
