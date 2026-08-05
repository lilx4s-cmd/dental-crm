import { Test } from '@nestjs/testing';

import { ConversationsService } from './conversations.service';
import { PrismaService } from '../prisma/prisma.service';
// The service takes its transport by token, not by class — see conversations.module.ts.
const OUTBOUND_SENDER = 'OUTBOUND_SENDER';

const mockPrisma = {
  conversation: { findMany: jest.fn(), update: jest.fn() },
  message: { groupBy: jest.fn() },
};

/**
 * Unread was the one thing genuinely missing from the communication centre.
 *
 * `Message.readAt` already existed and means the opposite: it is WhatsApp's delivery receipt, the
 * *patient* having read us. Nothing recorded staff reading the patient, so an inbox of forty
 * threads gave no clue which needed an answer — the single question it is opened to ask.
 */
describe('ConversationsService — unread', () => {
  let service: ConversationsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ConversationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OUTBOUND_SENDER, useValue: { send: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(ConversationsService);
    jest.clearAllMocks();
    mockPrisma.message.groupBy.mockResolvedValue([]);
  });

  it('counts every inbound message on a thread nobody has opened', async () => {
    // The honest reading of a null lastReadAt is "none of it has been looked at", not "zero
    // unread". Defaulting the column to now() on migration would have declared the backlog handled.
    mockPrisma.conversation.findMany.mockResolvedValue([{ id: 'c1', lastReadAt: null }]);
    mockPrisma.message.groupBy.mockResolvedValue([{ conversationId: 'c1', _count: { _all: 4 } }]);

    const summary = await service.unreadSummary();

    const where = mockPrisma.message.groupBy.mock.calls[0][0].where;
    // No time bound for a never-opened thread.
    expect(where.OR[0].createdAt).toBeUndefined();
    expect(summary.messages).toBe(4);
  });

  it('counts only what arrived after the thread was last opened', async () => {
    const readAt = new Date('2026-08-01T10:00:00Z');
    mockPrisma.conversation.findMany.mockResolvedValue([{ id: 'c1', lastReadAt: readAt }]);

    await service.unreadSummary();

    expect(mockPrisma.message.groupBy.mock.calls[0][0].where.OR[0].createdAt).toEqual({ gt: readAt });
  });

  it('never counts what we sent', async () => {
    // An outbound message is not something waiting for a reply from us.
    mockPrisma.conversation.findMany.mockResolvedValue([{ id: 'c1', lastReadAt: null }]);

    await service.unreadSummary();

    expect(mockPrisma.message.groupBy.mock.calls[0][0].where.direction).toBe('INBOUND');
  });

  it('reports threads and messages separately', async () => {
    // The badge shows threads: "6" meaning six people waiting is actionable, where "137" meaning
    // message lines is only alarming.
    mockPrisma.conversation.findMany.mockResolvedValue([
      { id: 'c1', lastReadAt: null },
      { id: 'c2', lastReadAt: null },
      { id: 'c3', lastReadAt: null },
    ]);
    mockPrisma.message.groupBy.mockResolvedValue([
      { conversationId: 'c1', _count: { _all: 5 } },
      { conversationId: 'c2', _count: { _all: 2 } },
    ]);

    const summary = await service.unreadSummary();

    expect(summary.conversations).toBe(2);
    expect(summary.messages).toBe(7);
  });

  it('asks the database once for the whole inbox, not once per thread', async () => {
    // Forty threads would otherwise be forty round-trips, on the screen people leave open.
    mockPrisma.conversation.findMany.mockResolvedValue(
      Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, lastReadAt: null })),
    );

    await service.unreadSummary();

    expect(mockPrisma.message.groupBy).toHaveBeenCalledTimes(1);
  });

  it('does not query at all for an empty inbox', async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([]);

    const summary = await service.unreadSummary();

    expect(mockPrisma.message.groupBy).not.toHaveBeenCalled();
    expect(summary).toEqual({ conversations: 0, messages: 0 });
  });

  it('ignores archived threads', async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([]);
    await service.unreadSummary();
    expect(mockPrisma.conversation.findMany.mock.calls[0][0].where.isArchived).toBe(false);
  });

  it('marks read using the server clock, not the client\'s', async () => {
    // A device with a skewed clock must not mark future messages read before they arrive.
    mockPrisma.conversation.update.mockResolvedValue({ id: 'c1' });

    await service.markRead('c1');

    const written = mockPrisma.conversation.update.mock.calls[0][0].data.lastReadAt;
    expect(written).toBeInstanceOf(Date);
    expect(Math.abs(Date.now() - written.getTime())).toBeLessThan(5000);
  });
});
