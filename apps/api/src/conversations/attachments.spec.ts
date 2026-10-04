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


  it('rejects files before creating a message that cannot be delivered', async () => {
    await expect(service.sendMessage('c1', { content: 'Quote', fileIds: ['f1'] }, 'u1')).rejects.toThrow('supports text only');
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });
  it('rejects an empty message', async () => {
    await expect(service.sendMessage('c1', { content: ' ' }, 'u1')).rejects.toThrow(BadRequestException);
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
