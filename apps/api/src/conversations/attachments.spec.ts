import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';

import { ConversationsService } from './conversations.service';
import { PrismaService } from '../prisma/prisma.service';

const OUTBOUND_SENDER = 'OUTBOUND_SENDER';

const mockPrisma: Record<string, any> = {
  conversation: { findUnique: jest.fn(), update: jest.fn() },
  file: { findMany: jest.fn() },
  message: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  messageAttachment: { findMany: jest.fn() },
  $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
};

const sender = { send: jest.fn() };

/**
 * Sending files with a message.
 *
 * The interesting cases are all about what a file id is allowed to reach. Ids arrive from a
 * browser, and a file being *readable* by the caller is not the same as it belonging in this
 * thread — so the check is against the conversation, not against permission.
 */
describe('ConversationsService — attachments', () => {
  let service: ConversationsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ConversationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OUTBOUND_SENDER, useValue: sender },
      ],
    }).compile();
    service = moduleRef.get(ConversationsService);
    jest.clearAllMocks();

    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: 'c1',
      channel: 'WHATSAPP',
      lead: { phone: '905551234567', whatsappNumber: null },
      patient: null,
    });
    mockPrisma.file.findMany.mockResolvedValue([]);
    mockPrisma.message.create.mockResolvedValue({ id: 'm1', status: 'QUEUED' });
    mockPrisma.message.findUnique.mockResolvedValue({ id: 'm1', status: 'QUEUED' });
    mockPrisma.message.update.mockResolvedValue({ id: 'm1', status: 'SENT' });
    mockPrisma.conversation.update.mockResolvedValue({});
    mockPrisma.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
    sender.send.mockResolvedValue({ ok: true, externalMessageId: 'wa-1' });
  });

  const createArg = () => mockPrisma.message.create.mock.calls[0][0];

  describe('what may be attached', () => {
    it('refuses a file belonging to another conversation', async () => {
      // The id resolves to a real file the caller may even be able to read — it is simply not
      // part of this thread. Scoping to permission rather than to the conversation would let a
      // coordinator paste another patient's scan into a chat.
      mockPrisma.file.findMany.mockResolvedValue([]);

      await expect(
        service.sendMessage('c1', { content: 'here', fileIds: ['f-elsewhere'] }, 'u1'),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.message.create).not.toHaveBeenCalled();
    });

    it('scopes the lookup to this conversation', async () => {
      mockPrisma.file.findMany.mockResolvedValue([{ id: 'f1' }]);

      await service.sendMessage('c1', { content: 'here', fileIds: ['f1'] }, 'u1');

      expect(mockPrisma.file.findMany.mock.calls[0][0].where).toMatchObject({
        ownerType: 'CONVERSATION',
        ownerId: 'c1',
      });
    });

    it('refuses when only some of the ids belong here', async () => {
      // Partial success would send a message the patient is told about and cannot be given.
      mockPrisma.file.findMany.mockResolvedValue([{ id: 'f1' }]);

      await expect(
        service.sendMessage('c1', { content: 'x', fileIds: ['f1', 'f-elsewhere'] }, 'u1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('collapses a repeated id', async () => {
      mockPrisma.file.findMany.mockResolvedValue([{ id: 'f1' }]);

      await service.sendMessage('c1', { content: 'x', fileIds: ['f1', 'f1'] }, 'u1');

      expect(createArg().data.attachments.create).toEqual([{ fileId: 'f1' }]);
    });
  });

  describe('what counts as a message', () => {
    it('sends an attachment with no text', async () => {
      // A photo on its own is a message. Requiring text would make people type "." to send one.
      mockPrisma.file.findMany.mockResolvedValue([{ id: 'f1' }]);

      await service.sendMessage('c1', { fileIds: ['f1'] }, 'u1');

      expect(mockPrisma.message.create).toHaveBeenCalled();
      expect(createArg().data.attachments.create).toEqual([{ fileId: 'f1' }]);
    });

    it('refuses a message with neither text nor attachment', async () => {
      // The patient would get a notification for a blank message.
      await expect(service.sendMessage('c1', {}, 'u1')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.message.create).not.toHaveBeenCalled();
    });

    it('refuses whitespace-only text with no attachment', async () => {
      await expect(service.sendMessage('c1', { content: '   ' }, 'u1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('sends text with no attachment, as before', async () => {
      await service.sendMessage('c1', { content: 'Hello' }, 'u1');
      expect(createArg().data.attachments.create).toEqual([]);
    });
  });

  describe('how they are written', () => {
    it('keeps the order they were picked in', async () => {
      // The database returns whatever order it likes; a quote followed by its itinerary reads
      // differently from the reverse.
      mockPrisma.file.findMany.mockResolvedValue([{ id: 'f2' }, { id: 'f1' }]);

      await service.sendMessage('c1', { content: 'x', fileIds: ['f1', 'f2'] }, 'u1');

      expect(createArg().data.attachments.create).toEqual([{ fileId: 'f1' }, { fileId: 'f2' }]);
    });

    it('writes the links in the same transaction as the message', async () => {
      // A message without its attachments is one the patient is told about and cannot be given.
      mockPrisma.file.findMany.mockResolvedValue([{ id: 'f1' }]);

      await service.sendMessage('c1', { content: 'x', fileIds: ['f1'] }, 'u1');

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(createArg().data.attachments).toBeDefined();
    });

    it('does not query for files when none were attached', async () => {
      await service.sendMessage('c1', { content: 'Hello' }, 'u1');
      expect(mockPrisma.file.findMany).not.toHaveBeenCalled();
    });
  });

  describe('the thread’s attachment list', () => {
    it('reads from what was sent, not from what was uploaded', async () => {
      // A file picked in the composer and removed before sending exists in storage until the
      // sweep collects it, but was never part of the conversation.
      mockPrisma.messageAttachment.findMany.mockResolvedValue([]);

      await service.attachments('c1');

      expect(mockPrisma.messageAttachment.findMany.mock.calls[0][0].where).toEqual({
        message: { conversationId: 'c1' },
      });
    });

    it('carries the message each file was sent with', async () => {
      mockPrisma.messageAttachment.findMany.mockResolvedValue([
        {
          createdAt: new Date(),
          message: { id: 'm1', direction: 'INBOUND', createdAt: new Date() },
          file: { id: 'f1', fileName: 'scan.pdf', mimeType: 'application/pdf', sizeBytes: 1000 },
        },
      ]);

      const [first] = await service.attachments('c1');

      expect(first.id).toBe('f1');
      expect(first.message.direction).toBe('INBOUND');
    });
  });
});
