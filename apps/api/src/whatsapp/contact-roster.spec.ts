// Phone fixtures use the reserved NANPA 202-555-0100 through 0199 example range.
import { ContactRoster, contactJid } from './contact-roster';

describe('WhatsApp contact name recovery', () => {
  let stored: { sessionId: string; key: string; value: object }[];
  let prisma: { whatsAppSession: { findMany: jest.Mock; upsert: jest.Mock } };
  beforeEach(() => {
    stored = [];
    prisma = { whatsAppSession: {
      findMany: jest.fn().mockImplementation(({ where }) => Promise.resolve(stored.filter(row => row.sessionId === where.sessionId))),
      upsert: jest.fn().mockImplementation(({ create, update }) => {
        const row = stored.find(row => row.sessionId === create.sessionId && row.key === create.key);
        if (row) row.value = update.value; else stored.push(create);
        return Promise.resolve(create);
      }),
    } };
  });
  it('normalizes device IDs and rejects group, broadcast and malformed addresses', () => {
    expect(contactJid('12025550101:2@c.us')).toBe('12025550101@s.whatsapp.net');
    expect(contactJid('999:3@lid')).toBe('999@lid');
    expect(contactJid('group@g.us')).toBeUndefined();
    expect(contactJid('status@broadcast')).toBeUndefined();
    expect(contactJid('unknown@s.whatsapp.net')).toBeUndefined();
  });
  it('keeps names received before their chat across restarts on the same work account', async () => {
    const first = new ContactRoster(prisma as never, 'user:staff');
    await first.persist({ id: '999:2@lid', pnJid: '12025550101@s.whatsapp.net', name: 'Name saved on phone' });
    const restored = new ContactRoster(prisma as never, 'user:staff');
    await restored.restore();
    expect(restored.resolve('999@lid')).toBe('12025550101@s.whatsapp.net');
    expect(restored.label('12025550101:5@s.whatsapp.net')).toEqual({ name: 'Name saved on phone', saved: true });
    const other = new ContactRoster(prisma as never, 'user:other');
    await other.restore();
    expect(other.label('999@lid')).toBeUndefined();
  });
  it('propagates names when the phone mapping arrives later without any name', async () => {
    const roster = new ContactRoster(prisma as never, 'user:staff');
    await roster.persist({ id: '999@lid', name: 'Saved name' });
    await roster.persist({ id: '999@lid', jid: '12025550101@s.whatsapp.net' });
    expect(roster.label('12025550101@s.whatsapp.net')).toEqual({ name: 'Saved name', saved: true });
  });
  it('preserves a saved name over profile names but accepts a renamed phone contact', async () => {
    const roster = new ContactRoster(prisma as never, 'user:staff');
    await roster.persist({ id: '12025550101@s.whatsapp.net', lid: '999@lid', name: 'Saved name' });
    await roster.persist({ id: '999@lid', notify: 'Profile name' });
    expect(roster.label('999@lid')?.name).toBe('Saved name');
    await roster.persist({ id: '999@lid', name: 'Renamed on phone' });
    expect(roster.label('12025550101@s.whatsapp.net')?.name).toBe('Renamed on phone');
  });
  it('uses verified business names when WhatsApp has not shared a saved or profile name', () => {
    const roster = new ContactRoster(prisma as never, 'user:staff');
    roster.remember({ id: '12025550101@s.whatsapp.net', verifiedName: 'Example Business' });
    expect(roster.label('12025550101@s.whatsapp.net')).toEqual({ name: 'Example Business', saved: false });
  });
});
