jest.mock('@whiskeysockets/baileys', () => ({
  __esModule: true,
  default: jest.fn(),
  fetchLatestBaileysVersion: jest.fn().mockResolvedValue({ version: [2, 3000, 1] }),
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
  beforeEach(() => {
    handlers = {};
    values = {};
    (makeWASocket as jest.Mock).mockImplementation(() => ({ ev: { on: (name: string, fn: (value: unknown) => Promise<void>) => { handlers[name] = fn; } }, end: jest.fn() }));
    service = new WhatsAppWebService({ get: (key: string) => values[key] } as never, {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'staff', isActive: true, role: Role.SALES_CONSULTANT }) },
      whatsAppAccount: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}) },
    } as never, {} as never);
  });
  afterEach(() => service.onModuleDestroy());

  it('prepares a QR for an authenticated work account without cloud tokens or server setup', async () => {
    expect(await service.ownStatus(user)).toMatchObject({ enabled: true, needsSetup: true, state: 'disconnected' });
    await service.connectOwn(user);
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
});
