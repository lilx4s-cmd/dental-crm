import { Injectable, Logger, ServiceUnavailableException, ForbiddenException, NotFoundException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Boom } from '@hapi/boom';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WASocket,
  type WAVersion,
  generateMessageID,
  Browsers,
} from '@whiskeysockets/baileys';
import * as QRCode from 'qrcode';

import { PrismaService } from '../prisma/prisma.service';
import { usePrismaAuthState } from './baileys-auth-state';
import { WhatsAppService } from './whatsapp.service';
import { JwtPayload, Role, hasPermission } from '@dental-crm/shared';
import { ContactRoster, contactJid, ContactSnapshot } from './contact-roster';

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
class WhatsAppConnection {
  private readonly logger = new Logger(WhatsAppConnection.name);
  private readonly enabled: boolean;

  private socket: WASocket | null = null;
  private state: WebConnectionState = 'disconnected';
  /** Current pairing QR as a data URL. Cleared the moment it is used or expires. */
  private qrDataUrl: string | null = null;
  private linkedNumber: string | null = null;
  private lastError: string | null = null;
  /** Guards against two connect attempts racing into two sockets on one session. */
  private connecting = false;
  private clearAuth: (() => Promise<void>) | null = null;
  private flushAuth: (() => Promise<void>) | null = null;
  private closeAuth: (() => Promise<void>) | null = null;
  private freshPairing: Promise<void> | null = null;
  /**
   * The pending automatic reconnect, held so it can be cancelled. Without this, unlinking a device
   * was undone a few seconds later by a retry that had already been scheduled — staff pressed
   * "Unlink", watched it go, and found the phone linked again.
   */
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  /** Set when a person, or WhatsApp itself, has ended the session. Cleared by an explicit connect. */
  private stopped = false;
  private generation = 0;
  private sentIds = new Set<string>();
  private readonly roster: ContactRoster;
  private syncingContacts: Promise<void> | null = null;
  private contactSyncError: string | null = null;
  private ingestionQueue: Promise<void> = Promise.resolve();
  private historyReceived = false;
  private messageEventsSeen = 0;
  private captureError: string | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    // Reuses the Cloud API service's storage path so both transports record a message identically.
    private readonly whatsapp: WhatsAppService,
    private readonly sessionId: string,
    private readonly ownerUserId: string | null,
    private readonly onUpdate: (update: { linkedNumber?: string | null; connectedAt?: Date; disconnectedAt?: Date; autoReconnect?: boolean; lastMessageAt?: Date }) => Promise<void>,
    private readonly numberInUse: (number: string) => boolean,
  ) {
    this.roster = new ContactRoster(prisma, sessionId);
    // Refuses to run alongside Evolution. Two WhatsApp clients on one number would each ingest
    // every inbound message, so every patient reply would appear twice in the CRM.
    const evolutionConfigured = sessionId === 'default' && !!this.config.get<string>('evolution.url');
    const pairingEnabled = ownerUserId
      ? this.config.get<string>('whatsapp.teamWebEnabled') !== 'false'
      : this.config.get<string>('whatsapp.webEnabled') === 'true';
    this.enabled = pairingEnabled && !evolutionConfigured;
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
      historyReceived: this.historyReceived,
      messageEventsSeen: this.messageEventsSeen,
      captureError: this.captureError,
      syncingContacts: !!this.syncingContacts,
      contactSyncError: this.contactSyncError,
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
        'WhatsApp linking has been disabled by your administrator.',
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

  /** Explicit QR renewal must discard saved authentication, rather than resume it. */
  async newQr(): Promise<void> {
    if (!this.enabled) throw new ServiceUnavailableException('WhatsApp linking has been disabled by your administrator.');
    if (this.freshPairing) return this.freshPairing;
    this.freshPairing = (async () => {
      await this.onUpdate({ autoReconnect: false, linkedNumber: null });
      await this.logout();
      await this.connect();
    })();
    try { await this.freshPairing; }
    finally { this.freshPairing = null; }
  }

  private async connectInternal(): Promise<void> {
    if (!this.enabled || this.connecting || this.socket || this.state === 'connected') return;

    const generation = this.generation;
    this.connecting = true;
    this.lastError = null;
    this.state = 'connecting';

    try {
      const { state, saveCreds, flush, close, clear } = await usePrismaAuthState(this.prisma, this.sessionId);
      await this.roster.restore();

      const version = await this.currentWebVersion();
      if (this.stopped || generation !== this.generation) return;
      this.clearAuth = clear;
      this.flushAuth = flush;
      this.closeAuth = close;
      const sock = makeWASocket({
        // Announcing a stale protocol version gets the connection refused with 405 before any QR
        // is issued — see currentWebVersion below.
        version,
        auth: state,
        // Nothing renders a terminal here; the QR goes to the browser instead.
        printQRInTerminal: false,
        // Identifies the linked device in the patient's WhatsApp app, so staff can see what it is
        // and revoke it from the phone if they ever need to.
        browser: Browsers.macOS('Desktop'),
        // Request the history WhatsApp makes available during pairing; deduplicate replayed IDs.
        syncFullHistory: true,
      });
      this.socket = sock;

      sock.ev.on('creds.update', async (update) => {
        if (!this.stopped && this.socket === sock && generation === this.generation) {
          Object.assign(state.creds, update);
          await saveCreds().catch(() => {
            this.lastError = 'Could not save the WhatsApp connection. Retry connecting before closing this page.';
            this.logger.error(`Could not persist WhatsApp credentials (${this.sessionId})`);
          });
        }
      });

      sock.ev.on('connection.update', async (update) => {
        if (this.stopped || this.socket !== sock) return;
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          const dataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
          if (this.stopped || this.socket !== sock || generation !== this.generation) return;
          this.qrDataUrl = dataUrl;
          this.state = 'awaiting_scan';
        }

        if (connection === 'open') {
          const number = sock.user?.id?.split(':')[0]?.split('@')[0] ?? null;
          if (number && this.numberInUse(number)) {
            this.stopped = true;
            this.lastError = 'This number is already connected to another CRM account. Use a separate work number.';
            await sock.logout().catch(() => undefined);
            await clear();
            await this.onUpdate({ autoReconnect: false });
            return;
          }
          this.state = 'connected';
          this.qrDataUrl = null;
          this.reconnectAttempts = 0;
          this.linkedNumber = sock.user?.id?.split(':')[0]?.split('@')[0] ?? null;
          await this.onUpdate({ linkedNumber: this.linkedNumber, connectedAt: new Date(), autoReconnect: true });
          this.logger.log(`WhatsApp Web connected (${this.sessionId})`);
        }

        if (connection === 'close') {
          const code = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;

          this.socket = null;
          this.qrDataUrl = null;
          this.state = 'disconnected';
          await this.onUpdate({ disconnectedAt: new Date() });

          // A person pressed unlink while this drop was in flight. Honour that over any retry.
          if (this.stopped || generation !== this.generation) return;

          // Pairing emits credentials immediately before a 515 restart. Persist them before
          // the replacement socket reads the DB, or it incorrectly asks for another QR.
          try { await flush(); }
          catch {
            this.lastError = 'Could not save the WhatsApp connection. Press Resume saved connection to retry.';
            return;
          }
          if (this.stopped || generation !== this.generation) return;

          if (code !== undefined && TERMINAL_DISCONNECTS.has(code)) {
            if (CREDENTIALS_DEAD.has(code)) {
              // Stale credentials would make the next connect fail in a way that looks like a bug
              // rather than "scan again".
              await clear();
              this.linkedNumber = null;
            }
            this.stopped = true;
            await this.onUpdate({ autoReconnect: false });
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

          // 405 is WhatsApp refusing the handshake outright, almost always because the protocol
          // version we announced is no longer accepted. It arrives before any QR, so without
          // naming it the failure reads as "the code never appeared".
          this.lastError =
            code === 405
              ? 'WhatsApp refused the connection (405). This usually means its web protocol moved on — the API fetches the current version on each attempt, so retrying, or a redeploy, normally clears it.'
              : (lastDisconnect?.error?.message ?? 'Connection closed');

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

      const rememberContacts = (contacts: ContactSnapshot[]) => {
        if (this.stopped || this.socket !== sock) return;
        for (const contact of contacts) this.roster.remember(contact);
      };
      const syncContacts = (contacts: ContactSnapshot[], create: boolean) => {
        rememberContacts(contacts);
        return this.queueRoster(contacts, sock, create);
      };
      sock.ev.on('contacts.upsert', (contacts) => syncContacts(contacts, false));
      sock.ev.on('contacts.update', (contacts) => syncContacts(contacts, false));
      sock.ev.on('chats.upsert', (chats) => syncContacts(chats, true));
      sock.ev.on('chats.update', (chats) => syncContacts(chats, false));
      sock.ev.on('chats.phoneNumberShare', ({ lid, jid }) => syncContacts([{ id: lid, jid, lid }], false));
      sock.ev.on('messaging-history.set', ({ messages, contacts = [], chats = [] }) => {
        if (this.stopped || this.socket !== sock) return;
        this.historyReceived = true;
        rememberContacts(contacts);
        rememberContacts(chats);
        this.queueRoster([...contacts, ...chats], sock, false);
        this.queueRoster(chats, sock, true);
        return this.queueMessages(messages, sock);
      });
      sock.ev.on('messages.upsert', ({ messages }) => this.queueMessages(messages, sock));
    } catch (e) {
      if (generation !== this.generation) return;
      this.state = 'disconnected';
      this.lastError = e instanceof Error ? e.message : 'Failed to connect';
      this.logger.error(`WhatsApp Web connect failed: ${this.lastError}`);
    } finally {
      if (generation === this.generation) this.connecting = false;
    }
  }

  /**
   * The WhatsApp Web protocol version to announce when connecting.
   *
   * Baileys bundles a version constant that goes stale as WhatsApp ships, and WhatsApp refuses a
   * connection announcing an old one with status 405 — before emitting any QR at all. The symptom
   * is not "version mismatch" but "the code never appears": the card sits on Connecting, the
   * socket closes, and nothing in the flow says why. That is what was happening here; fetching the
   * current version produced a pairing code immediately.
   *
   * Fetched per connect rather than cached, because the process can outlive a WhatsApp release and
   * a reconnect is exactly when a refreshed version matters. On failure we fall back to whatever
   * Baileys bundles: a stale version might still work, whereas refusing to start definitely does
   * not.
   */
  private async currentWebVersion(): Promise<WAVersion | undefined> {
    try {
      const { version } = await fetchLatestBaileysVersion({ timeout: 10_000 });
      return version;
    } catch (e) {
      this.logger.warn(
        `Could not fetch the current WhatsApp Web version (${
          e instanceof Error ? e.message : 'unknown error'
        }) — falling back to the one bundled with Baileys.`,
      );
      return undefined;
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
    this.generation += 1;
    this.cancelReconnect();
    this.reconnectAttempts = 0;

    const sock = this.socket;
    this.socket = null;
    this.connecting = false;
    this.state = this.enabled ? 'disconnected' : 'disabled';
    this.qrDataUrl = null;
    this.linkedNumber = null;
    this.lastError = null;
    await this.onUpdate({ autoReconnect: false, linkedNumber: null, disconnectedAt: new Date() });
    const clear = this.clearAuth ?? (await usePrismaAuthState(this.prisma, this.sessionId)).clear;
    this.clearAuth = null;
    let timeout: NodeJS.Timeout | undefined;
    try {
      // An unresponsive old socket must not hold the new QR request indefinitely.
      if (sock) await Promise.race([
        sock.logout(),
        new Promise<void>((resolve) => { timeout = setTimeout(resolve, 5000); }),
      ]);
    } catch {
      // Already gone from the phone's side; clearing local state is what matters.
    }
    finally { if (timeout) clearTimeout(timeout); try { sock?.end(undefined); } catch { /* A closed socket still needs its saved session cleared. */ } }
    await this.ingestionQueue;
    await clear();
    this.roster.reset();
    this.flushAuth = null;
    this.closeAuth = null;
    this.historyReceived = false;
    this.messageEventsSeen = 0;
    this.captureError = null;
    this.contactSyncError = null;
    this.syncingContacts = null;
    this.state = this.enabled ? 'disconnected' : 'disabled';
    this.qrDataUrl = null;
    this.linkedNumber = null;
    this.lastError = null;
  }

  async close(): Promise<void> {
    this.stopped = true;
    this.generation += 1;
    this.cancelReconnect();
    try { this.socket?.end(undefined); } catch { /* Credentials still need to finish saving. */ }
    this.socket = null;
    await this.ingestionQueue;
    await this.closeAuth?.();
  }

  private contactSyncSocket() {
    const sock = this.socket;
    if (!sock || this.state !== 'connected') throw new ServiceUnavailableException('Connect your work WhatsApp before syncing contact names.');
    if (!sock.authState.creds.myAppStateKeyId) throw new ServiceUnavailableException('WhatsApp is still syncing. Keep your phone online and try again shortly.');
    return sock;
  }

  requestContactNameSync(): void {
    this.contactSyncSocket();
    if (this.syncingContacts) return;
    this.contactSyncError = null;
    const generation = this.generation;
    // Large address books can take longer than an HTTP request. Keep progress visible while
    // the roster is captured, instead of letting the user see a timeout and reset again.
    void this.syncContactNames().catch(() => {
      if (this.stopped || generation !== this.generation) return;
      this.contactSyncError = 'Contact names could not finish syncing. Keep WhatsApp online on your phone and retry Sync contact names.';
    });
  }

  /** Re-fetch the contact-only app-state snapshot without unlinking the phone or resetting keys. */
  async syncContactNames(): Promise<void> {
    if (this.syncingContacts) return this.syncingContacts;
    const sock = this.contactSyncSocket();
    const generation = this.generation;
    this.syncingContacts = (async () => {
      // Only this collection contains saved contact names. A fresh snapshot replays names
      // missed by earlier CRM versions; the other collections and identity keys are retained.
      await sock.authState.keys.set({ 'app-state-sync-version': { critical_unblock_low: null } });
      if (this.stopped || this.socket !== sock || generation !== this.generation) return;
      await sock.resyncAppState(['critical_unblock_low'], false);
      await this.ingestionQueue;
      if (this.stopped || this.socket !== sock || generation !== this.generation) return;
      const synced = await sock.authState.keys.get('app-state-sync-version', ['critical_unblock_low']);
      if (!synced.critical_unblock_low) throw new ServiceUnavailableException('WhatsApp has not shared its contact names yet. Keep the phone online and retry.');
      await this.flushAuth?.();
    })();
    const syncing = this.syncingContacts;
    try { await syncing; }
    finally { if (this.syncingContacts === syncing) this.syncingContacts = null; }
  }

  async sendText(toPhone: string, text: string): Promise<void> {
    if (this.state !== 'connected' || !this.socket) {
      throw new ServiceUnavailableException('WhatsApp Web is not connected');
    }
    const jid = /^\d+(?::\d+)?@lid$/.test(toPhone) ? toPhone : `${toPhone.replace(/\D/g, '')}@s.whatsapp.net`;
    const messageId = generateMessageID();
    this.sentIds.add(messageId);
    if (this.sentIds.size > 1000) this.sentIds.delete(this.sentIds.values().next().value!);
    await this.socket.sendMessage(jid, { text }, { messageId });
    await this.onUpdate({ lastMessageAt: new Date() });
  }

  /**
   * Stores an inbound message against the right lead.
   *
   * Work-phone outgoing messages are captured as OUTBOUND. CRM send echoes are skipped.
   */
  /** Imports the chat roster even when WhatsApp supplies no messages for an older chat. */
  private queueRoster(contacts: ContactSnapshot[], sock: WASocket, create: boolean) {
    this.ingestionQueue = this.ingestionQueue.then(async () => {
      for (const contact of contacts) {
        if (this.stopped || this.socket !== sock) return;
        try { await this.roster.persist(contact); await this.syncChat(contact, create); }
        catch (e) {
          this.captureError = 'Some WhatsApp chats could not be saved. Check the connection status and retry.';
          this.logger.error(`Failed to capture WhatsApp chat: ${(e as Error).message}`);
        }
      }
    });
    return this.ingestionQueue;
  }

  private async syncChat(contact: ContactSnapshot, create: boolean) {
    const raw = [contact.id, contact.pnJid, contact.jid, contact.lidJid, contact.lid].map(contactJid).find(Boolean) ?? '';
    const jid = this.roster.resolve(raw) ?? raw;
    if (!jid.endsWith('@s.whatsapp.net') && !jid.endsWith('@lid')) return;
    const address = (value: string) => value.endsWith('@lid') ? value : value.split('@')[0].split(':')[0];
    const threadId = address(jid);
    // Update existing alternate-ID rows when the phone finally shares the real address.
    // Never combine or delete patient conversations during contact synchronization.
    const aliases = [...new Set([threadId, ...[raw, contact.pnJid, contact.jid, contact.lid, contact.lidJid].filter((id): id is string => !!id).flatMap(id => this.roster.aliases(id)).map(address)])];
    const rows = await this.prisma.conversation.findMany({ where: { channel: 'WHATSAPP', whatsappSessionId: this.sessionId, externalThreadId: { in: aliases } } });
    const label = this.roster.label(jid) ?? this.roster.label(raw);
    const seconds = Number(contact.conversationTimestamp);
    const lastMessageAt = Number.isFinite(seconds) && seconds > 0 && seconds <= Date.now() / 1000 + 300 ? new Date(seconds * 1000) : undefined;
    if (rows.length === 0 && create) {
      await this.prisma.conversation.create({ data: {
        channel: 'WHATSAPP', whatsappSessionId: this.sessionId, externalThreadId: threadId,
        assignedToId: this.ownerUserId, lastMessageAt,
        whatsappContactName: label?.name, whatsappNameIsSaved: label?.saved ?? false,
      } });
    }
    for (const row of rows) {
      const nameData = label && (label.saved || !row.whatsappNameIsSaved) ? { whatsappContactName: label.name, whatsappNameIsSaved: label.saved } : {};
      await this.prisma.conversation.update({ where: { id: row.id }, data: {
        ...nameData,
        ...(rows.length === 1 && threadId !== row.externalThreadId ? { externalThreadId: threadId } : {}),
        ...(lastMessageAt && (!row.lastMessageAt || row.lastMessageAt < lastMessageAt) ? { lastMessageAt } : {}),
      } });
    }
  }

  private queueMessages(messages: Parameters<WhatsAppConnection['ingest']>[0][], sock: WASocket) {
    this.messageEventsSeen += messages.length;
    this.ingestionQueue = this.ingestionQueue.then(async () => {
      for (const msg of messages) {
        if (this.stopped || this.socket !== sock) return;
        await this.ingest(msg).catch((e) => {
          this.captureError = 'WhatsApp delivered a message, but the CRM could not save it. Retry linking or contact support.';
          this.logger.error(`Failed to capture WhatsApp message: ${(e as Error).message}`);
        });
      }
    });
    return this.ingestionQueue;
  }

  private async ingest(msg: { key: { remoteJid?: string | null; remoteJidAlt?: string | null; fromMe?: boolean | null; id?: string | null }; message?: unknown; messageTimestamp?: unknown; pushName?: string | null }) {
    if (msg.key.id && this.sentIds.has(msg.key.id)) return;

    const rawJid = contactJid(msg.key.remoteJid) ?? '';
    const alternate = contactJid(msg.key.remoteJidAlt);
    const contact = { id: rawJid, jid: alternate, ...(!msg.key.fromMe && msg.pushName ? { notify: msg.pushName } : {}) };
    this.roster.remember(contact);
    const jid = this.roster.resolve(rawJid) ?? rawJid;
    // Groups and status broadcasts are not patient conversations.
    if (!jid.endsWith('@s.whatsapp.net') && !jid.endsWith('@lid')) return;

    const body = this.extractText(msg.message);
    if (!body) return;

    // Without an id the message cannot be deduplicated, so a reconnect would store it again.
    if (!msg.key.id) return;

    // An unmapped LID is retained as a chat address, never guessed to be a patient's phone number.
    const phone = jid.endsWith('@lid') ? jid : jid.split('@')[0].split(':')[0];
    const seconds = Number(msg.messageTimestamp);
    const messageAt = Number.isFinite(seconds) && seconds > 0 && seconds <= Date.now() / 1000 + 300 ? new Date(seconds * 1000) : undefined;
    await this.whatsapp.storeSessionMessage(phone, body, msg.key.id, this.sessionId, this.ownerUserId, !!msg.key.fromMe, messageAt);
    await this.roster.persist(contact);
    await this.syncChat(contact, false);
    this.captureError = null;
    await this.onUpdate({ lastMessageAt: new Date() });
  }

  /** Captures text and meaningful media placeholders without exposing private media URLs. */
  private extractText(message: unknown, depth = 0): string | null {
    if (depth > 6) return null;
    const wrapper = message as Record<string, { message?: unknown } | undefined> | undefined;
    const inner = wrapper?.ephemeralMessage?.message ?? wrapper?.viewOnceMessage?.message ?? wrapper?.viewOnceMessageV2?.message ?? wrapper?.documentWithCaptionMessage?.message;
    if (inner) return this.extractText(inner, depth + 1);
    const m = message as Record<string, { text?: string; caption?: string } | undefined> | undefined;
    if (!m) return null;
    return (
      m.conversation?.toString?.() ??
      m.extendedTextMessage?.text ??
      (m.imageMessage ? m.imageMessage.caption || "[Photo — view on work WhatsApp]" : undefined) ??
      (m.videoMessage ? m.videoMessage.caption || "[Video — view on work WhatsApp]" : undefined) ??
      (m.documentMessage ? m.documentMessage.caption || "[Document — view on work WhatsApp]" : undefined) ??
      (m.audioMessage ? "[Voice message — listen on work WhatsApp]" : undefined) ??
      (m.stickerMessage ? "[Sticker]" : undefined) ??
      null
    );
  }
}


/** Each staff member links a work number; management can inspect status without seeing pairing secrets. */
@Injectable()
export class WhatsAppWebService implements OnModuleInit, OnModuleDestroy {
  private readonly sessions = new Map<string, WhatsAppConnection>();
  private readonly logger = new Logger(WhatsAppWebService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  private connection(sessionId = 'default', ownerUserId: string | null = sessionId.startsWith('user:') ? sessionId.slice(5) : null) {
    let connection = this.sessions.get(sessionId);
    if (!connection) {
      connection = new WhatsAppConnection(this.config, this.prisma, this.whatsapp, sessionId, ownerUserId,
        async (update) => {
          await this.prisma.whatsAppAccount.upsert({
            where: { sessionId }, create: { sessionId, ownerUserId, ...update }, update,
          }).catch(() => this.logger.warn(`Could not persist WhatsApp session status ${sessionId}`));
        },
        (number) => [...this.sessions.entries()].some(([id, s]) =>
          id !== sessionId && s.status().state === 'connected' && s.status().linkedNumber === number),
      );
      this.sessions.set(sessionId, connection);
    }
    return connection;
  }

  async onModuleInit() {
    // Only restore sessions a person explicitly connected. Never create or pair a new one on boot.
    const accounts = await this.prisma.whatsAppAccount.findMany({
      where: { autoReconnect: true, OR: [{ ownerUserId: null }, { owner: { isActive: true } }] },
    });
    for (const account of accounts) {
      void this.connection(account.sessionId, account.ownerUserId).connect().catch(() =>
        this.logger.warn(`Could not restore WhatsApp session ${account.sessionId}`));
    }
  }

  async onModuleDestroy() { await Promise.all([...this.sessions.values()].map(session => session.close())); }

  status(sessionId = 'default') { return this.connection(sessionId).status(); }
  async connect() { await this.connection().connect(); }
  async newQr() { await this.connection().newQr(); }
  async syncContacts() { this.connection().requestContactNameSync(); }
  async logout() {
    await this.connection().logout();
    await this.prisma.whatsAppAccount.updateMany({ where: { sessionId: 'default' }, data: { autoReconnect: false, linkedNumber: null } });
  }
  async sendText(toPhone: string, text: string, sessionId = 'default') {
    await this.connection(sessionId).sendText(toPhone, text);
  }

  async resolveSession(user: JwtPayload, ownerUserId?: string) {
    const ownerId = ownerUserId ?? user.sub;
    if (ownerId !== user.sub && !hasPermission(user, 'conversations.supervise', user.role === Role.SUPER_ADMIN || user.role === Role.CLINIC_MANAGER)) {
      throw new ForbiddenException('You can only manage your own WhatsApp session.');
    }
    const owner = await this.prisma.user.findUnique({ where: { id: ownerId }, select: { id: true, isActive: true, role: true } });
    if (!owner?.isActive || !hasPermission(user, 'conversations.read', ([Role.SUPER_ADMIN, Role.CLINIC_MANAGER, Role.SALES_CONSULTANT, Role.RECEPTION] as Role[]).includes(owner.role as Role))) {
      throw new NotFoundException('Active sales or reception account not found.');
    }
    return { sessionId: `user:${ownerId}`, ownerId };
  }

  async ownStatus(user: JwtPayload) {
    const { sessionId, ownerId } = await this.resolveSession(user);
    const account = await this.prisma.whatsAppAccount.findUnique({ where: { sessionId } });
    const [storedConversations, storedMessages] = await Promise.all([
      this.prisma.conversation.count({ where: { whatsappSessionId: sessionId } }),
      this.prisma.message.count({ where: { conversation: { whatsappSessionId: sessionId } } }),
    ]);
    const status = this.connection(sessionId, ownerId).status();
    return { sessionId, needsSetup: !account, storedConversations, storedMessages, lastMessageAt: account?.lastMessageAt ?? null, ...status, linkedNumber: status.linkedNumber ?? account?.linkedNumber ?? null };
  }
  async connectOwn(user: JwtPayload) {
    const { sessionId, ownerId } = await this.resolveSession(user);
    await this.connection(sessionId, ownerId).connect();
    return this.ownStatus(user);
  }
  async newQrOwn(user: JwtPayload) {
    const { sessionId, ownerId } = await this.resolveSession(user);
    await this.connection(sessionId, ownerId).newQr();
    return this.ownStatus(user);
  }
  async syncOwnContacts(user: JwtPayload) {
    const { sessionId, ownerId } = await this.resolveSession(user);
    this.connection(sessionId, ownerId).requestContactNameSync();
    return this.ownStatus(user);
  }
  async logoutOwn(user: JwtPayload, ownerUserId?: string) {
    const { sessionId, ownerId } = await this.resolveSession(user, ownerUserId);
    await this.connection(sessionId, ownerId).logout();
    await this.prisma.whatsAppAccount.updateMany({ where: { sessionId }, data: { autoReconnect: false, linkedNumber: null } });
    return { sessionId, ...this.connection(sessionId, ownerId).status(), qrDataUrl: null };
  }

  async teamStatus() {
    const [users, accounts] = await Promise.all([
      this.prisma.user.findMany({ where: { isActive: true, role: { in: ['SALES_CONSULTANT', 'RECEPTION'] } },
        select: { id: true, firstName: true, lastName: true, role: true }, orderBy: { firstName: 'asc' } }),
      this.prisma.whatsAppAccount.findMany(),
    ]);
    return Promise.all(users.map(async (user) => {
      const sessionId = `user:${user.id}`;
      const account = accounts.find((a) => a.sessionId === sessionId);
      const contactFilter = { conversations: { some: { whatsappSessionId: sessionId, messages: { some: { direction: 'OUTBOUND' as const, status: { in: ['SENT' as const, 'DELIVERED' as const, 'READ' as const] } } } } } };
      const [assignedLeads, contactedLeads] = await Promise.all([
        this.prisma.lead.count({ where: { assignedToId: user.id } }),
        this.prisma.lead.count({ where: { assignedToId: user.id, ...contactFilter } }),
      ]);
      const { enabled, state, linkedNumber, error } = this.connection(sessionId, user.id).status();
      const status = { enabled, state, linkedNumber, error };
      return { sessionId, user, assignedLeads, contactedLeads, uncontactedLeads: assignedLeads - contactedLeads, ...status, linkedNumber: status.linkedNumber ?? account?.linkedNumber ?? null,
        connectedAt: account?.connectedAt ?? null, disconnectedAt: account?.disconnectedAt ?? null,
        lastMessageAt: account?.lastMessageAt ?? null };
    }));
  }
}
