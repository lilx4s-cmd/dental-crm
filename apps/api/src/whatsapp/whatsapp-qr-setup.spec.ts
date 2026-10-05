// Phone fixtures use the reserved NANPA 202-555-0100 through 0199 example range.
jest.mock('@whiskeysockets/baileys', () => ({
  __esModule: true,
  default: jest.fn(),
  fetchLatestBaileysVersion: jest.fn().mockResolvedValue({ version: [2, 3000, 1] }),
  Browsers: { macOS: (name: string) => ['Mac OS', name, '14.4.1'] },
  DisconnectReason: { loggedOut: 401, connectionReplaced: 440, badSession: 500, forbidden: 403, multideviceMismatch: 411, restartRequired: 515 },
}));
jest.mock('./baileys-auth-state', () => ({ usePrismaAuthState: jest.fn() }));
jest.mock('./whatsapp.service', () => ({ WhatsAppService: class {} }));

import makeWASocket from '@whiskeysockets/baileys';
import { WhatsAppWebService } from './whatsapp-web.service';
import { Role } from '@dental-crm/shared';
import { usePrismaAuthState } from './baileys-auth-state';

describe('QR-only work-account setup', () => {
  const user = { sub: 'staff', email: 'staff@test.invalid', role: Role.SALES_CONSULTANT };
  let service: WhatsAppWebService;
  let handlers: Record<string, (value: unknown) => Promise<void>>;
  let values: Record<string, string>;
  let storeSessionMessage: jest.Mock;
  let chats: Record<string, any>[];
  let conversation: { count: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
  let accounts: { findUnique: jest.Mock; upsert: jest.Mock; updateMany: jest.Mock };
  beforeEach(() => {
    jest.clearAllMocks();
    (usePrismaAuthState as jest.Mock).mockResolvedValue({ state: { creds: {} }, saveCreds: jest.fn().mockResolvedValue(undefined), flush: jest.fn().mockResolvedValue(undefined), close: jest.fn().mockResolvedValue(undefined), clear: jest.fn().mockResolvedValue(undefined) });
    handlers = {};
    values = {};
    storeSessionMessage = jest.fn().mockResolvedValue({});
    chats = [];
    conversation = {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockImplementation(({ where }) => Promise.resolve(chats.filter(c => c.whatsappSessionId === where.whatsappSessionId && where.externalThreadId.in.includes(c.externalThreadId)))),
      create: jest.fn().mockImplementation(({ data }) => { const row = { id: `chat-${chats.length}`, ...data }; chats.push(row); return Promise.resolve(row); }),
      update: jest.fn().mockImplementation(({ where, data }) => { const row = chats.find(c => c.id === where.id); Object.assign(row!, data); return Promise.resolve(row); }),
    };
    (makeWASocket as jest.Mock).mockImplementation(() => ({ ev: { on: (name: string, fn: (value: unknown) => Promise<void>) => { handlers[name] = fn; } }, end: jest.fn(), logout: jest.fn().mockResolvedValue(undefined), user: { id: '12025550100:1@s.whatsapp.net' }, authState: { creds: { myAppStateKeyId: 'test-key' }, keys: { set: jest.fn().mockResolvedValue(undefined), get: jest.fn().mockResolvedValue({ critical_unblock_low: { version: 2 } }) } }, resyncAppState: jest.fn().mockResolvedValue(undefined) }));
    accounts = { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
    service = new WhatsAppWebService({ get: (key: string) => values[key] } as never, {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'staff', isActive: true, role: Role.SALES_CONSULTANT }) },
      whatsAppAccount: accounts,
      whatsAppSession: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn().mockResolvedValue({}) },
      conversation,
      message: { count: jest.fn().mockResolvedValue(0) },
    } as never, { storeSessionMessage } as never);
  });
  afterEach(async () => { await service.onModuleDestroy(); jest.useRealTimers(); });

  it('prepares a QR for an authenticated work account without cloud tokens or server setup', async () => {
    expect(await service.ownStatus(user)).toMatchObject({ enabled: true, needsSetup: true, state: 'disconnected' });
    await service.connectOwn(user);
    expect(makeWASocket).toHaveBeenCalledWith(expect.objectContaining({ browser: ['Mac OS', 'Desktop', '14.4.1'], syncFullHistory: true }));
    await handlers['connection.update']({ qr: 'internal-test-pairing-code' });
    expect(await service.ownStatus(user)).toMatchObject({ state: 'awaiting_scan', qrDataUrl: expect.stringMatching(/^data:image\/png;base64,/) });
  });
  it('honors explicit administrator disablement for team pairing', () => {
    values['whatsapp.teamWebEnabled'] = 'false';
    expect(service.status('user:staff')).toMatchObject({ enabled: false, state: 'disabled' });
  });
  it('keeps legacy shared session opt-in while enabling separate work numbers alongside Evolution', () => {
    values['evolution.url'] = 'https://gateway.test.invalid';
    expect(service.status()).toMatchObject({ enabled: false });
    expect(service.status('user:staff')).toMatchObject({ enabled: true });
  });
  it('only exposes the QR in the waiting-for-scan state', async () => {
    await service.connectOwn(user);
    expect(await service.ownStatus(user)).toMatchObject({ state: 'connecting', qrDataUrl: null });
  });
  it('imports pairing history with original dates and mapped alternate contact IDs', async () => {
    await service.connectOwn(user);
    await handlers['messaging-history.set']({ contacts: [{ id: '12025550101@s.whatsapp.net', lid: '999@lid' }], messages: [{ key: { remoteJid: '999@lid', id: 'old-1' }, message: { conversation: 'Previous patient reply' }, messageTimestamp: 1700000000 }] });
    expect(storeSessionMessage).toHaveBeenCalledWith('12025550101', 'Previous patient reply', 'old-1', 'user:staff', 'staff', false, new Date(1700000000000));
  });
  it('captures append events and wrapped work-phone outgoing messages', async () => {
    await service.connectOwn(user);
    await handlers['messages.upsert']({ type: 'append', messages: [{ key: { remoteJid: '12025550101@s.whatsapp.net', fromMe: true, id: 'out-1' }, message: { ephemeralMessage: { message: { extendedTextMessage: { text: 'Follow-up' } } } } }] });
    expect(storeSessionMessage).toHaveBeenCalledWith('12025550101', 'Follow-up', 'out-1', 'user:staff', 'staff', true, undefined);
  });
  it('retains an unmapped alternate-ID conversation without inventing a phone number', async () => {
    await service.connectOwn(user);
    await handlers['messages.upsert']({ type: 'notify', messages: [{ key: { remoteJid: '888@lid', id: 'lid-1' }, message: { conversation: 'Hello' } }] });
    expect(storeSessionMessage).toHaveBeenCalledWith('888@lid', 'Hello', 'lid-1', 'user:staff', 'staff', false, undefined);
  });
  it('serializes simultaneous history and live captures and excludes group chats', async () => {
    await service.connectOwn(user);
    await Promise.all([
      handlers['messaging-history.set']({ contacts: [], messages: [{ key: { remoteJid: '12025550101@s.whatsapp.net', id: 'history' }, message: { conversation: 'Old' } }] }),
      handlers['messages.upsert']({ type: 'notify', messages: [{ key: { remoteJid: 'group@g.us', id: 'group' }, message: { conversation: 'Group' } }, { key: { remoteJid: '12025550101@s.whatsapp.net', id: 'live' }, message: { conversation: 'New' } }] }),
    ]);
    expect(storeSessionMessage.mock.calls.map(call => call[2])).toEqual(['history', 'live']);
  });
  it('reports a capture failure separately from connection status without leaking database errors', async () => {
    await service.connectOwn(user);
    storeSessionMessage.mockRejectedValue(new Error('private database detail'));
    await handlers['messages.upsert']({ messages: [{ key: { remoteJid: '12025550101@s.whatsapp.net', id: 'failed' }, message: { conversation: 'Test' } }] });
    const status = await service.ownStatus(user);
    expect(status.messageEventsSeen).toBe(1);
    expect(status.captureError).toContain('could not save');
    expect(status.captureError).not.toContain('private database');
  });
  it('imports every supplied direct chat, including more than ten chats without messages', async () => {
    await service.connectOwn(user);
    const roster = Array.from({ length: 35 }, (_, i) => ({ id: `12025550${100+i}@s.whatsapp.net`, conversationTimestamp: 1700000000 }));
    await handlers['messaging-history.set']({ contacts: roster.map((c, i) => ({ ...c, name: `Saved contact ${i}` })), chats: [...roster, { id: 'group@g.us' }], messages: [] });
    expect(chats).toHaveLength(35);
    expect(chats[34]).toMatchObject({ whatsappContactName: 'Saved contact 34', whatsappNameIsSaved: true, whatsappSessionId: 'user:staff', assignedToId: 'staff' });
    expect(storeSessionMessage).not.toHaveBeenCalled();
    await handlers['chats.upsert'](roster);
    expect(chats).toHaveLength(35);
  });
  it('backfills saved names and phone addresses without changing another work account', async () => {
    chats.push({ id: 'old', externalThreadId: '999@lid', whatsappSessionId: 'user:staff', whatsappContactName: 'Push name', whatsappNameIsSaved: false });
    chats.push({ id: 'other', externalThreadId: '999@lid', whatsappSessionId: 'user:other', whatsappContactName: 'Other account' });
    await service.connectOwn(user);
    await handlers['contacts.upsert']([{ id: '12025550101@s.whatsapp.net', lid: '999@lid', name: 'Name saved on phone' }]);
    expect(chats[0]).toMatchObject({ externalThreadId: '12025550101', whatsappContactName: 'Name saved on phone', whatsappNameIsSaved: true });
    expect(chats[1].whatsappContactName).toBe('Other account');
    await handlers['contacts.update']([{ id: '12025550101@s.whatsapp.net', notify: 'New push name' }]);
    expect(chats[0].whatsappContactName).toBe('Name saved on phone');
  });
  it('preserves a saved name after restart when only a push name is received', async () => {
    chats.push({ id: 'saved', externalThreadId: '12025550101', whatsappSessionId: 'user:staff', whatsappContactName: 'Saved previously', whatsappNameIsSaved: true });
    await service.connectOwn(user);
    await handlers['contacts.upsert']([{ id: '12025550101@s.whatsapp.net', notify: 'Push name' }]);
    expect(chats[0].whatsappContactName).toBe('Saved previously');
  });

  it('clears a connected session and creates a fresh socket for a new QR', async () => {
    await service.connectOwn(user);
    await handlers['connection.update']({ connection: 'open' });
    const oldCreds = handlers['creds.update'];
    const oldSocket = (makeWASocket as jest.Mock).mock.results[(makeWASocket as jest.Mock).mock.results.length - 1].value;
    const auth = await (usePrismaAuthState as jest.Mock).mock.results[(usePrismaAuthState as jest.Mock).mock.results.length - 1].value;
    auth.clear.mockClear(); auth.saveCreds.mockClear();
    await service.newQrOwn(user);
    expect(oldSocket.logout).toHaveBeenCalled();
    expect(oldSocket.end).toHaveBeenCalled();
    expect(auth.clear).toHaveBeenCalledTimes(1);
    expect((makeWASocket as jest.Mock).mock.results[(makeWASocket as jest.Mock).mock.results.length - 1].value).not.toBe(oldSocket);
    await oldCreds({});
    expect(auth.saveCreds).not.toHaveBeenCalled();
    await handlers['connection.update']({ qr: 'fresh-test-qr' });
    expect(await service.ownStatus(user)).toMatchObject({ state: 'awaiting_scan', linkedNumber: null, qrDataUrl: expect.stringMatching(/^data:image/) });
  });
  it('replaces an expired QR instead of ignoring connect while awaiting a scan', async () => {
    await service.connectOwn(user);
    await handlers['connection.update']({ qr: 'old-qr' });
    const before = (await service.ownStatus(user)).qrDataUrl;
    await Promise.all([service.newQrOwn(user), service.newQrOwn(user)]);
    expect(await service.ownStatus(user)).toMatchObject({ state: 'connecting', qrDataUrl: null });
    await handlers['connection.update']({ qr: 'replacement-qr' });
    expect((await service.ownStatus(user)).qrDataUrl).not.toBe(before);
  });

  it('does not create a competing socket when Connect is repeated while a QR is waiting', async () => {
    await service.connectOwn(user);
    await handlers['connection.update']({ qr: 'waiting-qr' });
    await service.connectOwn(user);
    expect(makeWASocket).toHaveBeenCalledTimes(1);
    expect(await service.ownStatus(user)).toMatchObject({ state: 'awaiting_scan' });
  });

  it('waits for scanned credentials to persist before the pairing restart reconnects', async () => {
    jest.useFakeTimers();
    let persisted!: () => void;
    const saving = new Promise<void>(resolve => { persisted = resolve; });
    await service.connectOwn(user);
    const auth = await (usePrismaAuthState as jest.Mock).mock.results[0].value;
    auth.flush.mockReturnValue(saving);
    const closing = handlers['connection.update']({ connection: 'close', lastDisconnect: { error: { output: { statusCode: 515 } } } });
    await Promise.resolve(); await Promise.resolve();
    await jest.advanceTimersByTimeAsync(1);
    expect(makeWASocket).toHaveBeenCalledTimes(1);
    persisted(); await closing;
    await jest.advanceTimersByTimeAsync(1);
    expect(makeWASocket).toHaveBeenCalledTimes(2);
  });

  it('captures a saved alternate-ID name when a live message finally shares the phone address', async () => {
    chats.push({ id: 'saved-lid', externalThreadId: '999@lid', whatsappSessionId: 'user:staff' });
    await service.connectOwn(user);
    await handlers['contacts.upsert']([{ id: '999:2@lid', name: 'Saved on phone' }]);
    await handlers['messages.upsert']({ messages: [{ key: { remoteJid: '999@lid', remoteJidAlt: '12025550101:7@s.whatsapp.net', id: 'mapped' }, pushName: 'Profile name', message: { conversation: 'Hello' } }] });
    expect(chats[0]).toMatchObject({ externalThreadId: '12025550101', whatsappContactName: 'Saved on phone', whatsappNameIsSaved: true });
    expect(storeSessionMessage).toHaveBeenCalledWith('12025550101', 'Hello', 'mapped', 'user:staff', 'staff', false, undefined);
  });

  it('replays contact names while keeping the existing phone linked', async () => {
    chats.push({ id: 'nameless', externalThreadId: '12025550101', whatsappSessionId: 'user:staff' });
    await service.connectOwn(user);
    await handlers['connection.update']({ connection: 'open' });
    const sock = (makeWASocket as jest.Mock).mock.results[0].value;
    sock.resyncAppState.mockImplementation(async () => handlers['contacts.upsert']([{ id: '12025550101@s.whatsapp.net', name: 'Name from phone' }]));
    await service.syncOwnContacts(user);
    await sock.resyncAppState.mock.results[0].value;
    expect(sock.resyncAppState).toHaveBeenCalledWith(['critical_unblock_low'], false);
    expect(sock.logout).not.toHaveBeenCalled();
    expect(chats[0].whatsappContactName).toBe('Name from phone');
    expect(await service.ownStatus(user)).toMatchObject({ state: 'connected' });
  });

  it('still clears the local session when closing an old socket throws', async () => {
    await service.connectOwn(user);
    const sock = (makeWASocket as jest.Mock).mock.results[0].value;
    sock.end.mockImplementationOnce(() => { throw new Error('already closed'); });
    const auth = await (usePrismaAuthState as jest.Mock).mock.results[0].value;
    await service.newQrOwn(user);
    expect(auth.clear).toHaveBeenCalledTimes(1);
    expect(makeWASocket).toHaveBeenCalledTimes(2);
  });

  it('resets a disconnected account without touching saved conversations', async () => {
    const result = await service.logoutOwn(user);
    const auth = await (usePrismaAuthState as jest.Mock).mock.results[0].value;
    expect(auth.clear).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ state: 'disconnected', linkedNumber: null, qrDataUrl: null });
    expect(conversation.update).not.toHaveBeenCalled();
    expect(conversation.create).not.toHaveBeenCalled();
  });

  it('signs out without waiting for an in-progress chat import', async () => {
    await service.connectOwn(user);
    await handlers['connection.update']({ connection: 'open' });
    let finish!: () => void;
    storeSessionMessage.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    const receiving = handlers['messages.upsert']({ messages: [{ key: { remoteJid: '12025550101@s.whatsapp.net', id: 'in-flight' }, message: { conversation: 'Synthetic test message' } }] });
    await new Promise<void>(resolve => setImmediate(resolve));
    let signedOut = false;
    const signingOut = service.logoutOwn(user).then(() => { signedOut = true; });
    await new Promise<void>(resolve => setImmediate(resolve));
    const completedBeforeImport = signedOut;
    finish();
    await Promise.all([receiving, signingOut]);
    expect(completedBeforeImport).toBe(true);
    expect(await service.ownStatus(user)).toMatchObject({ state: 'disconnected', linkedNumber: null });
  });

  it('keeps a later sign-out disconnected when an older new-QR request finishes', async () => {
    await service.connectOwn(user);
    await handlers['connection.update']({ connection: 'open' });
    const sock = (makeWASocket as jest.Mock).mock.results[0].value;
    let finish!: () => void;
    sock.logout.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    const preparingQr = service.newQrOwn(user);
    await new Promise<void>(resolve => setImmediate(resolve));
    const signingOut = service.logoutOwn(user);
    await new Promise<void>(resolve => setImmediate(resolve));
    finish();
    await Promise.all([preparingQr, signingOut]);
    expect(makeWASocket).toHaveBeenCalledTimes(1);
    expect(await service.ownStatus(user)).toMatchObject({ state: 'disconnected', qrDataUrl: null, linkedNumber: null });
  });

  it('keeps the saved account disconnected when an old connected-status write finishes late', async () => {
    await service.connectOwn(user);
    let finish!: () => void;
    let saved: Record<string, unknown> = {};
    accounts.upsert.mockImplementation(async ({ update }) => {
      if (update.autoReconnect) await new Promise<void>(resolve => { finish = resolve; });
      saved = { ...saved, ...update };
      return saved;
    });
    const opening = handlers['connection.update']({ connection: 'open' });
    await new Promise<void>(resolve => setImmediate(resolve));
    const signingOut = service.logoutOwn(user);
    await new Promise<void>(resolve => setImmediate(resolve));
    finish();
    await Promise.all([opening, signingOut]);
    expect(saved).toMatchObject({ autoReconnect: false, linkedNumber: null });
  });

  it('does not let a late message-import failure corrupt the next connection', async () => {
    await service.connectOwn(user);
    let fail!: (error: Error) => void;
    storeSessionMessage.mockReturnValueOnce(new Promise<void>((_resolve, reject) => { fail = reject; }));
    const receiving = handlers['messages.upsert']({ messages: [{ key: { remoteJid: '12025550101@s.whatsapp.net', id: 'old-batch' }, message: { conversation: 'Synthetic old message' } }] });
    await new Promise<void>(resolve => setImmediate(resolve));
    await service.logoutOwn(user);
    await service.connectOwn(user);
    fail(new Error('Synthetic old import failure'));
    await receiving;
    await handlers['messages.upsert']({ messages: [{ key: { remoteJid: '12025550101@s.whatsapp.net', id: 'new-batch' }, message: { conversation: 'Synthetic new message' } }] });
    expect(await service.ownStatus(user)).toMatchObject({ captureError: null, messageEventsSeen: 1 });
    expect(storeSessionMessage).toHaveBeenLastCalledWith('12025550101', 'Synthetic new message', 'new-batch', 'user:staff', 'staff', false, undefined);
  });

  it('resets an unresponsive linked socket and explains how to remove the device on the phone', async () => {
    await service.connectOwn(user);
    await handlers['connection.update']({ connection: 'open' });
    const sock = (makeWASocket as jest.Mock).mock.results[0].value;
    sock.logout.mockReturnValue(new Promise<void>(() => undefined));
    jest.useFakeTimers();
    const signingOut = service.logoutOwn(user);
    await jest.advanceTimersByTimeAsync(5000);
    expect(await signingOut).toMatchObject({ state: 'disconnected', linkedNumber: null, needsSetup: false, error: expect.stringContaining('Linked devices') });
    const auth = await (usePrismaAuthState as jest.Mock).mock.results[0].value;
    expect(auth.clear).toHaveBeenCalledTimes(1);
    expect(sock.end).toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(120000);
    expect(makeWASocket).toHaveBeenCalledTimes(1);
  });

  it('reports an unsuccessful saved reset so the caller can retry instead of showing success', async () => {
    accounts.upsert.mockRejectedValue(new Error('Synthetic write failure'));
    await expect(service.logoutOwn(user)).rejects.toThrow('reset could not be saved');
    expect(service.status('user:staff')).toMatchObject({ state: 'disconnected', linkedNumber: null });
  });

  it('explains phone unlinking when a saved linked account has no active socket', async () => {
    const auth = await (usePrismaAuthState as jest.Mock).mock.results[0]?.value;
    expect(auth).toBeUndefined();
    (usePrismaAuthState as jest.Mock).mockResolvedValue({ state: { creds: { registered: true, me: { id: '12025550100@s.whatsapp.net' } } }, clear: jest.fn().mockResolvedValue(undefined) });
    expect(await service.logoutOwn(user)).toMatchObject({ state: 'disconnected', linkedNumber: null, error: expect.stringContaining('Linked devices') });
    expect(makeWASocket).not.toHaveBeenCalled();
  });

  it('refuses contact sync while disconnected and while initial keys are still arriving', async () => {
    await expect(service.syncOwnContacts(user)).rejects.toThrow('Connect your work WhatsApp');
    await service.connectOwn(user);
    await handlers['connection.update']({ connection: 'open' });
    const sock = (makeWASocket as jest.Mock).mock.results[0].value;
    sock.authState.creds.myAppStateKeyId = undefined;
    await expect(service.syncOwnContacts(user)).rejects.toThrow('still syncing');
    expect(sock.authState.keys.set).not.toHaveBeenCalled();
    expect(sock.logout).not.toHaveBeenCalled();
  });

  it('returns sync progress promptly while a large address book is still loading', async () => {
    await service.connectOwn(user);
    await handlers['connection.update']({ connection: 'open' });
    const sock = (makeWASocket as jest.Mock).mock.results[0].value;
    let finish!: () => void;
    sock.resyncAppState.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    expect(await service.syncOwnContacts(user)).toMatchObject({ state: 'connected', syncingContacts: true });
    finish(); await new Promise<void>(resolve => setImmediate(resolve));
    expect(await service.ownStatus(user)).toMatchObject({ syncingContacts: false, contactSyncError: null });
  });

  it('reports background sync failure without leaking WhatsApp internals', async () => {
    await service.connectOwn(user);
    await handlers['connection.update']({ connection: 'open' });
    const sock = (makeWASocket as jest.Mock).mock.results[0].value;
    sock.resyncAppState.mockRejectedValue(new Error('private WhatsApp detail'));
    await service.syncOwnContacts(user);
    await new Promise<void>(resolve => setImmediate(resolve));
    const status = await service.ownStatus(user);
    expect(status.contactSyncError).toContain('could not finish');
    expect(status.contactSyncError).not.toContain('private');
    expect(status.syncingContacts).toBe(false);
  });

  it('cancels an old name sync when the user resets for a fresh QR', async () => {
    await service.connectOwn(user);
    await handlers['connection.update']({ connection: 'open' });
    const sock = (makeWASocket as jest.Mock).mock.results[0].value;
    let fail!: (error: Error) => void;
    sock.resyncAppState.mockReturnValue(new Promise<void>((_resolve, reject) => { fail = reject; }));
    await service.syncOwnContacts(user);
    await service.newQrOwn(user);
    fail(new Error('old connection closed'));
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(await service.ownStatus(user)).toMatchObject({ state: 'connecting', contactSyncError: null, syncingContacts: false });
  });

});
