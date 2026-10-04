jest.mock('@whiskeysockets/baileys', () => ({
  __esModule: true,
  default: jest.fn(),
  fetchLatestBaileysVersion: jest.fn().mockResolvedValue({ version: [2, 3000, 1] }),
  Browsers: { macOS: (name: string) => ['Mac OS', name, '14.4.1'] },
  DisconnectReason: { loggedOut: 401, connectionReplaced: 440, badSession: 500, forbidden: 403, multideviceMismatch: 411, restartRequired: 515 },
}));
jest.mock('./baileys-auth-state', () => ({ usePrismaAuthState: jest.fn().mockResolvedValue({ state: {}, saveCreds: jest.fn(), clear: jest.fn() }) }));
jest.mock('./whatsapp.service', () => ({ WhatsAppService: class {} }));

import makeWASocket from '@whiskeysockets/baileys';
import { WhatsAppWebService } from './whatsapp-web.service';
import { Role } from '@dental-crm/shared';

describe('QR-only work-account setup', () => {
  const user = { sub: 'staff', email: 'staff@test.invalid', role: Role.SALES_CONSULTANT };
  let service: WhatsAppWebService;
  let handlers: Record<string, (value: unknown) => Promise<void>>;
  let values: Record<string, string>;
  let storeSessionMessage: jest.Mock;
  beforeEach(() => {
    handlers = {};
    values = {};
    storeSessionMessage = jest.fn().mockResolvedValue({});
    (makeWASocket as jest.Mock).mockImplementation(() => ({ ev: { on: (name: string, fn: (value: unknown) => Promise<void>) => { handlers[name] = fn; } }, end: jest.fn() }));
    service = new WhatsAppWebService({ get: (key: string) => values[key] } as never, {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'staff', isActive: true, role: Role.SALES_CONSULTANT }) },
      whatsAppAccount: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}) },
      conversation: { count: jest.fn().mockResolvedValue(0) },
      message: { count: jest.fn().mockResolvedValue(0) },
    } as never, { storeSessionMessage } as never);
  });
  afterEach(() => service.onModuleDestroy());

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
    await handlers['messaging-history.set']({ contacts: [{ id: '905550000001@s.whatsapp.net', lid: '999@lid' }], messages: [{ key: { remoteJid: '999@lid', id: 'old-1' }, message: { conversation: 'Previous patient reply' }, messageTimestamp: 1700000000 }] });
    expect(storeSessionMessage).toHaveBeenCalledWith('905550000001', 'Previous patient reply', 'old-1', 'user:staff', 'staff', false, new Date(1700000000000));
  });
  it('captures append events and wrapped work-phone outgoing messages', async () => {
    await service.connectOwn(user);
    await handlers['messages.upsert']({ type: 'append', messages: [{ key: { remoteJid: '905550000001@s.whatsapp.net', fromMe: true, id: 'out-1' }, message: { ephemeralMessage: { message: { extendedTextMessage: { text: 'Follow-up' } } } } }] });
    expect(storeSessionMessage).toHaveBeenCalledWith('905550000001', 'Follow-up', 'out-1', 'user:staff', 'staff', true, undefined);
  });
  it('retains an unmapped alternate-ID conversation without inventing a phone number', async () => {
    await service.connectOwn(user);
    await handlers['messages.upsert']({ type: 'notify', messages: [{ key: { remoteJid: '888@lid', id: 'lid-1' }, message: { conversation: 'Hello' } }] });
    expect(storeSessionMessage).toHaveBeenCalledWith('888@lid', 'Hello', 'lid-1', 'user:staff', 'staff', false, undefined);
  });
  it('serializes simultaneous history and live captures and excludes group chats', async () => {
    await service.connectOwn(user);
    await Promise.all([
      handlers['messaging-history.set']({ contacts: [], messages: [{ key: { remoteJid: '905550000001@s.whatsapp.net', id: 'history' }, message: { conversation: 'Old' } }] }),
      handlers['messages.upsert']({ type: 'notify', messages: [{ key: { remoteJid: 'group@g.us', id: 'group' }, message: { conversation: 'Group' } }, { key: { remoteJid: '905550000001@s.whatsapp.net', id: 'live' }, message: { conversation: 'New' } }] }),
    ]);
    expect(storeSessionMessage.mock.calls.map(call => call[2])).toEqual(['history', 'live']);
  });
  it('reports a capture failure separately from connection status without leaking database errors', async () => {
    await service.connectOwn(user);
    storeSessionMessage.mockRejectedValue(new Error('private database detail'));
    await handlers['messages.upsert']({ messages: [{ key: { remoteJid: '905550000001@s.whatsapp.net', id: 'failed' }, message: { conversation: 'Test' } }] });
    const status = await service.ownStatus(user);
    expect(status.messageEventsSeen).toBe(1);
    expect(status.captureError).toContain('could not save');
    expect(status.captureError).not.toContain('private database');
  });
});
