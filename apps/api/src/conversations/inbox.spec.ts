import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';

import { ConversationsService } from './conversations.service';
import { PrismaService } from '../prisma/prisma.service';

// The service takes its transport by token, not by class — see conversations.module.ts.
const OUTBOUND_SENDER = 'OUTBOUND_SENDER';

const mockPrisma: Record<string, any> = {
  conversation: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  message: { groupBy: jest.fn() },
};

/**
 * Finding a thread, and keeping one where it can be found.
 *
 * An inbox is only usable while it is short. These are the two things that keep it usable once it
 * is not: a pin for the handful that matter all week, and a search for everything else.
 */
describe('ConversationsService — the inbox', () => {
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
    mockPrisma.conversation.findMany.mockResolvedValue([]);
    mockPrisma.message.groupBy.mockResolvedValue([]);
  });

  const whereOf = () => mockPrisma.conversation.findMany.mock.calls[0][0].where;
  const orderOf = () => mockPrisma.conversation.findMany.mock.calls[0][0].orderBy;

  describe('ordering', () => {
    it('floats pinned threads to the top', async () => {
      // A pin that did not move the thread up would be a flag, not a pin.
      await service.findAll({});
      expect(orderOf()).toEqual([{ isPinned: 'desc' }, { lastMessageAt: 'desc' }]);
    });

    it('hides archived threads unless asked', async () => {
      await service.findAll({});
      expect(whereOf().isArchived).toBe(false);
    });
  });

  describe('search', () => {
    it('looks at names on both sides of the conversion', async () => {
      // A thread survives a lead becoming a patient, so searching only leads loses every thread
      // belonging to somebody who actually came.
      await service.findAll({ search: 'ahmed' });
      const or = whereOf().OR;
      expect(or.some((c: any) => c.lead?.firstName)).toBe(true);
      expect(or.some((c: any) => c.patient?.firstName)).toBe(true);
    });

    it('searches what was said', async () => {
      // "The one where they mentioned the hotel" is how people describe a thread they are after.
      await service.findAll({ search: 'hotel' });
      expect(whereOf().OR.some((c: any) => c.messages?.some?.content)).toBe(true);
    });

    it('strips punctuation from a number before matching it', async () => {
      // Staff type "+90 555"; the record holds 905551234567.
      await service.findAll({ search: '+90 555' });
      const phone = whereOf().OR.find((c: any) => c.lead?.phone);
      expect(phone.lead.phone.contains).toBe('90555');
    });

    it('does not treat a short digit run as a number', async () => {
      // "Ali 2" must not become a phone search for "2", which matches half the inbox and costs a
      // full scan to prove it.
      await service.findAll({ search: 'Ali 2' });
      expect(whereOf().OR.some((c: any) => c.lead?.phone)).toBe(false);
    });

    it('ignores surrounding whitespace', async () => {
      await service.findAll({ search: '   ' });
      expect(whereOf().OR).toBeUndefined();
    });
  });

  describe('filters', () => {
    it('narrows to threads nobody has taken', async () => {
      // The gap an inbox shared by four people actually has.
      await service.findAll({ unassignedOnly: true });
      expect(whereOf().assignedToId).toBeNull();
    });

    it('keeps only threads with something waiting', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([
        { id: 'c1', lastReadAt: null },
        { id: 'c2', lastReadAt: new Date() },
      ]);
      mockPrisma.message.groupBy.mockResolvedValue([{ conversationId: 'c1', _count: { _all: 3 } }]);

      const result = await service.findAll({ unreadOnly: true });

      expect(result.map((c) => c.id)).toEqual(['c1']);
    });

    it('does not filter unread in SQL', async () => {
      // Unread is derived from lastReadAt against each thread's messages — a grouped query, not a
      // column anything can filter on. Attempting it in the where-clause would silently return
      // everything.
      await service.findAll({ unreadOnly: true });
      expect(whereOf().unreadCount).toBeUndefined();
    });
  });

  describe('pinning', () => {
    it('stamps when it was pinned', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({ id: 'c1' });
      mockPrisma.conversation.update.mockResolvedValue({ id: 'c1' });

      await service.setPinned('c1', true);

      const data = mockPrisma.conversation.update.mock.calls[0][0].data;
      expect(data.isPinned).toBe(true);
      expect(data.pinnedAt).toBeInstanceOf(Date);
    });

    it('clears the stamp on unpin', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({ id: 'c1' });
      mockPrisma.conversation.update.mockResolvedValue({ id: 'c1' });

      await service.setPinned('c1', false);

      expect(mockPrisma.conversation.update.mock.calls[0][0].data).toEqual({
        isPinned: false,
        pinnedAt: null,
      });
    });

    it('404s for a thread that does not exist', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);
      await expect(service.setPinned('nope', true)).rejects.toThrow(NotFoundException);
    });
  });
});
