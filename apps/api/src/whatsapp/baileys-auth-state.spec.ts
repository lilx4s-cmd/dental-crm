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
    const clearing = auth.clear();
    expect(db.deleteMany).not.toHaveBeenCalled();
    finish();
    await Promise.all([saving, clearing]);
    expect(db.deleteMany).toHaveBeenCalledWith({ where: { sessionId: 'user:staff' } });
    await auth.saveCreds();
    await auth.state.keys.set({ 'pre-key': { '1': {} as never } });
    expect(db.upsert).toHaveBeenCalledTimes(1);
  });
});
