jest.mock('@whiskeysockets/baileys', () => ({
  initAuthCreds: () => ({ registered: false }),
  BufferJSON: { replacer: (_key: string, value: unknown) => value, reviver: (_key: string, value: unknown) => value },
  proto: {},
}));
import { usePrismaAuthState } from './baileys-auth-state';

describe('WhatsApp credential reset', () => {
  it('waits for existing writes and prevents old credentials reappearing after reset', async () => {
    let finish!: () => void;
    const write = new Promise<void>(resolve => { finish = resolve; });
    const db = { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockReturnValue(write), deleteMany: jest.fn().mockResolvedValue({ count: 1 }) };
    const auth = await usePrismaAuthState({ whatsAppSession: db } as never, 'user:staff');
    const saving = auth.saveCreds();
    await Promise.resolve(); await Promise.resolve();
    expect(db.upsert).toHaveBeenCalledTimes(1);
    const clearing = auth.clear();
    const clearingAgain = auth.clear();
    expect(db.deleteMany).not.toHaveBeenCalled();
    finish();
    await Promise.all([saving, clearing, clearingAgain]);
    expect(db.deleteMany).toHaveBeenCalledWith({ where: { sessionId: 'user:staff' } });
    expect(db.deleteMany).toHaveBeenCalledTimes(1);
    await auth.saveCreds();
    await auth.state.keys.set({ 'pre-key': { '1': {} as never } });
    expect(db.upsert).toHaveBeenCalledTimes(1);
  });

  it('serializes credential snapshots so an old save cannot overwrite scanned credentials', async () => {
    let finish!: () => void;
    const firstWrite = new Promise<void>(resolve => { finish = resolve; });
    const db = { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockReturnValueOnce(firstWrite).mockResolvedValue({}), deleteMany: jest.fn() };
    const auth = await usePrismaAuthState({ whatsAppSession: db } as never, 'user:staff');
    const first = auth.saveCreds();
    auth.state.creds.registered = true;
    const second = auth.saveCreds();
    await Promise.resolve(); await Promise.resolve();
    expect(db.upsert).toHaveBeenCalledTimes(1);
    expect(db.upsert.mock.calls[0][0].create.value.registered).toBe(false);
    let flushed = false;
    const flush = auth.flush().then(() => { flushed = true; });
    await Promise.resolve();
    expect(flushed).toBe(false);
    finish(); await Promise.all([first, second, flush]);
    expect(db.upsert).toHaveBeenCalledTimes(2);
    expect(db.upsert.mock.calls[1][0].create.value.registered).toBe(true);
  });

  it('closes for a server restart without deleting the linked credentials', async () => {
    const db = { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}), deleteMany: jest.fn() };
    const auth = await usePrismaAuthState({ whatsAppSession: db } as never, 'user:staff');
    await auth.saveCreds(); await auth.close(); await auth.saveCreds();
    expect(db.upsert).toHaveBeenCalledTimes(1);
    expect(db.deleteMany).not.toHaveBeenCalled();
  });

  it('finishes queued credential snapshots when closing for a restart', async () => {
    const db = { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}), deleteMany: jest.fn() };
    const auth = await usePrismaAuthState({ whatsAppSession: db } as never, 'user:staff');
    const saving = auth.saveCreds();
    auth.state.creds.registered = true;
    const scanned = auth.saveCreds();
    await Promise.all([auth.close(), saving, scanned]);
    expect(db.upsert).toHaveBeenCalledTimes(2);
    expect(db.upsert.mock.calls[1][0].create.value.registered).toBe(true);
    expect(db.deleteMany).not.toHaveBeenCalled();
  });

  it('discards queued credential saves when signing out instead of writing them all first', async () => {
    let finish!: () => void;
    const writing = new Promise<void>(resolve => { finish = resolve; });
    const db = { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockReturnValueOnce(writing).mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({ count: 1 }) };
    const auth = await usePrismaAuthState({ whatsAppSession: db } as never, 'user:staff');
    const first = auth.saveCreds();
    const queued = Array.from({ length: 20 }, () => auth.saveCreds());
    await Promise.resolve(); await Promise.resolve();
    const clearing = auth.clear();
    finish();
    await Promise.all([first, ...queued, clearing]);
    expect(db.upsert).toHaveBeenCalledTimes(1);
    expect(db.deleteMany).toHaveBeenCalledWith({ where: { sessionId: 'user:staff' } });
  });
});
