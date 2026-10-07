import { Injectable, Logger, ServiceUnavailableException, ForbiddenException, NotFoundException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Boom } from '@hapi/boom';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  fetchLatestWaWebVersion,
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
import { IngestionQueue } from './ingestion-queue';

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
  private resetting: Promise<void> | null = null;
  private commandRevision = 0;
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
  private ingestionQueue = new IngestionQueue();
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
    private readonly onUpdate: (update: { linkedNumber?: string | null; connectedAt?: Date; disconnectedAt?: Date; autoReconnect?: boolean; lastMessageAt?: Date }, required?: boolean) => Promise<void>,
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
      pendingLiveMessages: this.ingestionQueue.pending('live'),
      pendingHistoryItems: this.ingestionQueue.pending('history'),
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

    const revision = ++this.commandRevision;
    await this.resetting;
    if (revision !== this.commandRevision) return;
    await this.startConnection();
  }

  private async startConnection(): Promise<void> {
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
    const revision = ++this.commandRevision;
    const pairing = (async () => {
      await this.reset();
      if (revision !== this.commandRevision) return;
      await this.startConnection();
    })();
    this.freshPairing = pairing;
    try { await pairing; }
    finally { if (this.freshPairing === pairing) this.freshPairing = null; }
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
        // With full history enabled, Baileys forces Mac/Windows into the rejected DARWIN/WIN32
        // web sub-platform even when their device descriptor says Chrome. Linux keeps
        // WEB_BROWSER while still requesting the available history through requireFullSync.
        browser: Browsers.ubuntu('Chrome'),
        // Request the history WhatsApp makes available during pairing; deduplicate replayed IDs.
        syncFullHistory: true,
      });
      this.socket = sock;
      let pinsRequested = false;
      const restorePhonePins = () => {
        if (pinsRequested || this.state !== 'connected' || !sock.authState.creds.myAppStateKeyId) return;
        pinsRequested = true;
        // Existing linked devices already cached this collection before CRM stored pins.
        // Replay the phone's read-only pin snapshot; retain identity and pairing keys.
        void (async () => {
          await sock.authState.keys.set({ 'app-state-sync-version': { regular_low: null } });
          if (this.stopped || this.socket !== sock || generation !== this.generation) return;
          await sock.resyncAppState(['regular_low'], false);
        })().catch(() => {
          if (this.stopped || this.socket !== sock || generation !== this.generation) return;
          pinsRequested = false;
          this.logger.warn('Could not replay WhatsApp chat pins; they will retry on the next connection update.');
        });
      };

      sock.ev.on('creds.update', async (update) => {
        if (!this.stopped && this.socket === sock && generation === this.generation) {
          Object.assign(state.creds, update);
          await saveCreds().catch(() => {
            if (this.stopped || this.socket !== sock || generation !== this.generation) return;
            this.lastError = 'Could not save the WhatsApp connection. Retry connecting before closing this page.';
            this.logger.error(`Could not persist WhatsApp credentials (${this.sessionId})`);
          });
          restorePhonePins();
        }
      });

      sock.ev.on('connection.update', async (update) => {
        if (this.stopped || this.socket !== sock || generation !== this.generation) return;
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
          if (this.stopped || this.socket !== sock || generation !== this.generation) return;
          this.logger.log(`WhatsApp Web connected (${this.sessionId})`);
          restorePhonePins();
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
              ? 'WhatsApp refused the connection settings. Try Get a new QR code again shortly.'
              : code === DisconnectReason.connectionClosed
                ? 'WhatsApp closed the connection. Retrying automatically; choose Get a new QR code to restart pairing.'
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
      sock.ev.on('messages.upsert', ({ messages, type }) => this.queueMessages(messages, sock, type !== 'append'));
      sock.ev.on('call', (calls) => this.queueRoster(calls.filter(call => !call.isGroup).map(call => ({
        id: call.chatId, conversationTimestamp: call.date.getTime() / 1000,
      })), sock, true, false));
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
   * A stale protocol version can be refused before WhatsApp emits a QR. Read WhatsApp's live
   * revision first. The Baileys repository can lag behind while its helper
   * still reports isLatest: true. Both helpers resolve with bundled defaults on fetch failure,
   * so catching rejected promises alone silently advertised a stale version to WhatsApp.
   */
  private async currentWebVersion(): Promise<WAVersion> {
    for (const [source, fetchVersion] of [
      ['whatsapp', fetchLatestWaWebVersion],
      ['baileys', fetchLatestBaileysVersion],
    ] as const) {
      try {
        const result = await fetchVersion({ timeout: 10_000 });
        if (
          result.isLatest &&
          result.version.length === 3 &&
          result.version.every(part => Number.isSafeInteger(part) && part >= 0)
        ) {
          this.logger.log(`WhatsApp protocol version resolved from ${source}: ${result.version.join('.')}`);
          return result.version;
        }
      } catch {
        // Try the other source; neither transport errors nor credentials belong in the UI.
      }
      this.logger.warn(`Could not resolve a current WhatsApp protocol version from ${source}`);
    }
    throw new ServiceUnavailableException('Could not check WhatsApp connection settings. Try Get a new QR code again shortly.');
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
    this.commandRevision += 1;
    this.freshPairing = null;
    await this.reset();
  }

  private async reset(): Promise<void> {
    if (this.resetting) return this.resetting;
    const resetting = this.resetInternal();
    this.resetting = resetting;
    try { await resetting; }
    finally { if (this.resetting === resetting) this.resetting = null; }
  }

  private async resetInternal(): Promise<void> {
    // Order matters: stop first. A drop arriving mid-logout would otherwise schedule a retry that
    // relinks the device seconds after somebody deliberately unlinked it.
    this.stopped = true;
    this.generation += 1;
    this.cancelReconnect();
    this.reconnectAttempts = 0;

    const sock = this.socket;
    let wasLinked = !!this.linkedNumber || !!sock?.authState.creds.me?.id;
    this.socket = null;
    this.connecting = false;
    this.state = this.enabled ? 'disconnected' : 'disabled';
    this.qrDataUrl = null;
    this.linkedNumber = null;
    this.lastError = null;
    // Finish any already-started message save in the background. Old batches are guarded by
    // their socket and generation; a slow import must not block sign-out or the next connection.
    void this.ingestionQueue.idle().catch(() => undefined);
    this.ingestionQueue = new IngestionQueue();
    await this.onUpdate({ autoReconnect: false, linkedNumber: null, disconnectedAt: new Date() });
    const savedAuth = this.clearAuth ? null : await usePrismaAuthState(this.prisma, this.sessionId);
    wasLinked ||= !!savedAuth?.state.creds.me?.id || !!savedAuth?.state.creds.registered;
    const clear = this.clearAuth ?? savedAuth!.clear;
    this.clearAuth = null;
    let unlinkIncomplete = wasLinked && !sock;
    let timeout: NodeJS.Timeout | undefined;
    try {
      // An unresponsive old socket must not hold the new QR request indefinitely.
      if (sock) await Promise.race([
        sock.logout(),
        new Promise<void>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('WhatsApp logout timed out')), 5000); }),
      ]);
    } catch {
      unlinkIncomplete = wasLinked;
    }
    finally { if (timeout) clearTimeout(timeout); try { sock?.end(undefined); } catch { /* A closed socket still needs its saved session cleared. */ } }
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
    this.lastError = unlinkIncomplete
      ? 'The CRM connection is reset. WhatsApp could not finish removing the linked device; remove this CRM device in WhatsApp → Linked devices on your phone.'
      : null;
    // Save the stopped state before allowing a later pairing request to start. An older
    // connection callback must not leave auto-reconnect enabled after a successful sign-out.
    try { await this.onUpdate({ autoReconnect: false, linkedNumber: null, disconnectedAt: new Date() }, true); }
    catch { throw new ServiceUnavailableException('WhatsApp stopped, but the reset could not be saved. Retry Sign out & reset.'); }
  }

  async close(): Promise<void> {
    this.commandRevision += 1;
    this.freshPairing = null;
    this.stopped = true;
    this.generation += 1;
    this.cancelReconnect();
    try { this.socket?.end(undefined); } catch { /* Credentials still need to finish saving. */ }
    this.socket = null;
    await this.ingestionQueue.idle();
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
      await this.ingestionQueue.idle();
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
  private queueRoster(contacts: ContactSnapshot[], sock: WASocket, create: boolean, fullChatSnapshot = create) {
    if (this.stopped || this.socket !== sock) return Promise.resolve();
    const generation = this.generation;
    const active = () => !this.stopped && this.socket === sock && generation === this.generation;
    return this.ingestionQueue.enqueue(contacts, async contact => {
      if (!active()) return;
      try {
        await this.roster.persist(contact);
        if (!active()) return;
        await this.syncChat(contact, create, active, fullChatSnapshot);
      } catch (e) {
        if (!active()) return;
        this.captureError = 'Some WhatsApp chats could not be saved. Check the connection status and retry.';
        this.logger.error(`Failed to capture WhatsApp chat: ${(e as Error).message}`);
      }
    }, 'history');
  }

  private async syncChat(contact: ContactSnapshot, create: boolean, active: () => boolean, fullChatSnapshot = create) {
    if (!active()) return;
    const raw = [contact.id, contact.pnJid, contact.jid, contact.lidJid, contact.lid].map(contactJid).find(Boolean) ?? '';
    const jid = this.roster.resolve(raw) ?? raw;
    if (!jid.endsWith('@s.whatsapp.net') && !jid.endsWith('@lid')) return;
    const address = (value: string) => value.endsWith('@lid') ? value : value.split('@')[0].split(':')[0];
    const threadId = address(jid);
    // Update existing alternate-ID rows when the phone finally shares the real address.
    // Never combine or delete patient conversations during contact synchronization.
    const aliases = [...new Set([threadId, ...[raw, contact.pnJid, contact.jid, contact.lid, contact.lidJid].filter((id): id is string => !!id).flatMap(id => this.roster.aliases(id)).map(address)])];
    const rows = await this.prisma.conversation.findMany({ where: { channel: 'WHATSAPP', whatsappSessionId: this.sessionId, externalThreadId: { in: aliases } } });
    if (!active()) return;
    const label = this.roster.label(jid) ?? this.roster.label(raw);
    const seconds = Number(contact.conversationTimestamp);
    const lastMessageAt = Number.isFinite(seconds) && seconds > 0 && seconds <= Date.now() / 1000 + 300 ? new Date(seconds * 1000) : undefined;
    const pinSeconds = Number(contact.pinned);
    // History snapshots use seconds; app-state pin actions carry Date.now() in ms.
    const pinMillis = pinSeconds >= 1_000_000_000_000 ? pinSeconds : pinSeconds * 1000;
    // Complete chat snapshots omit the pin for an unpinned chat; partial contact/name
    // updates must leave the phone pin alone. App-state unpin events explicitly send null.
    const hasPin = fullChatSnapshot || contact.pinned !== undefined;
    const whatsappPinnedAt = Number.isFinite(pinMillis) && pinMillis > 0 && pinMillis <= Date.now() + 300_000
      ? new Date(pinMillis) : null;
    const archiveData = fullChatSnapshot || contact.archived !== undefined
      ? { isArchived: contact.archived === true } : {};
    if (rows.length === 0 && create) {
      await this.prisma.conversation.create({ data: {
        channel: 'WHATSAPP', whatsappSessionId: this.sessionId, externalThreadId: threadId,
        assignedToId: this.ownerUserId, lastMessageAt,
        whatsappActivityAt: lastMessageAt, ...(hasPin ? { whatsappPinnedAt } : {}),
        ...archiveData,
        whatsappContactName: label?.name, whatsappNameIsSaved: label?.saved ?? false,
      } });
    }
    for (const row of rows) {
      if (!active()) return;
      const nameData = label && (label.saved || !row.whatsappNameIsSaved) ? { whatsappContactName: label.name, whatsappNameIsSaved: label.saved } : {};
      await this.prisma.conversation.update({ where: { id: row.id }, data: {
        ...nameData,
        ...archiveData,
        ...(hasPin ? { whatsappPinnedAt } : {}),
        ...(lastMessageAt && (!row.whatsappActivityAt || row.whatsappActivityAt < lastMessageAt) ? { whatsappActivityAt: lastMessageAt } : {}),
        ...(rows.length === 1 && threadId !== row.externalThreadId ? { externalThreadId: threadId } : {}),
        ...(lastMessageAt && (!row.lastMessageAt || row.lastMessageAt < lastMessageAt) ? { lastMessageAt } : {}),
      } });
    }
  }

  private queueMessages(messages: Parameters<WhatsAppConnection['ingest']>[0][], sock: WASocket, live = false) {
    if (this.stopped || this.socket !== sock) return Promise.resolve();
    const generation = this.generation;
    const active = () => !this.stopped && this.socket === sock && generation === this.generation;
    this.messageEventsSeen += messages.length;
    return this.ingestionQueue.enqueue(messages, async msg => {
      if (!active()) return;
      await this.ingest(msg, active).catch((e) => {
        if (!active()) return;
        this.captureError = 'WhatsApp delivered a message, but the CRM could not save it. Retry linking or contact support.';
        this.logger.error(`Failed to capture WhatsApp message: ${(e as Error).message}`);
      });
    }, live ? 'live' : 'history');
  }

  private async ingest(msg: { key: { remoteJid?: string | null; remoteJidAlt?: string | null; fromMe?: boolean | null; id?: string | null }; message?: unknown; messageTimestamp?: unknown; messageStubType?: number | null; pushName?: string | null }, active: () => boolean) {
    if (!active()) return;
    if (msg.key.id && this.sentIds.has(msg.key.id)) return;

    const rawJid = contactJid(msg.key.remoteJid) ?? '';
    const alternate = contactJid(msg.key.remoteJidAlt);
    const contact = { id: rawJid, jid: alternate, ...(!msg.key.fromMe && msg.pushName ? { notify: msg.pushName } : {}) };
    this.roster.remember(contact);
    const jid = this.roster.resolve(rawJid) ?? rawJid;
    // Groups and status broadcasts are not patient conversations.
    if (!jid.endsWith('@s.whatsapp.net') && !jid.endsWith('@lid')) return;

    const body = this.extractText(msg.message);
    if (!body) {
      // Calls and reactions affect the phone's chat activity without being a new
      // patient text. Preserve their timestamp without creating fake chat messages.
      const content = msg.message as Record<string, unknown> | undefined;
      const callStub = [40, 41, 45, 46].includes(msg.messageStubType ?? -1);
      if (callStub || content?.call || content?.callLogMesssage || content?.reactionMessage) {
        await this.syncChat({ ...contact, conversationTimestamp: msg.messageTimestamp }, callStub || !!content?.call || !!content?.callLogMesssage, active, false);
      }
      return;
    }

    // Without an id the message cannot be deduplicated, so a reconnect would store it again.
    if (!msg.key.id) return;

    // An unmapped LID is retained as a chat address, never guessed to be a patient's phone number.
    const phone = jid.endsWith('@lid') ? jid : jid.split('@')[0].split(':')[0];
    const seconds = Number(msg.messageTimestamp);
    const messageAt = Number.isFinite(seconds) && seconds > 0 && seconds <= Date.now() / 1000 + 300 ? new Date(seconds * 1000) : undefined;
    await this.whatsapp.storeSessionMessage(phone, body, msg.key.id, this.sessionId, this.ownerUserId, !!msg.key.fromMe, messageAt);
    if (!active()) return;
    await this.roster.persist(contact);
    if (!active()) return;
    await this.syncChat({ ...contact, conversationTimestamp: msg.messageTimestamp }, false, active);
    if (!active()) return;
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
      let statusWrites: Promise<void> = Promise.resolve();
      connection = new WhatsAppConnection(this.config, this.prisma, this.whatsapp, sessionId, ownerUserId,
        (update, required = false) => {
          const pending = statusWrites.then(async () => {
            await this.prisma.whatsAppAccount.upsert({
              where: { sessionId }, create: { sessionId, ownerUserId, ...update }, update,
            });
          });
          statusWrites = pending.catch(() => this.logger.warn(`Could not persist WhatsApp session status ${sessionId}`));
          return required ? pending : statusWrites;
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
  async logout() { await this.connection().logout(); }
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
    return { sessionId, needsSetup: false, ...this.connection(sessionId, ownerId).status(), qrDataUrl: null };
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
