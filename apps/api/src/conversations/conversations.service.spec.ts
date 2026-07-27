import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from './conversations.service';
import { OUTBOUND_SENDER } from './outbound-sender';

const WHATSAPP = { channel: 'WHATSAPP' as const, externalThreadId: '905551112233', lead: null, patient: null };

function build(overrides: { send?: jest.Mock; conversation?: Record<string, unknown> | null } = {}) {
  const send = overrides.send ?? jest.fn().mockResolvedValue('evolution');

  // Records what the service ends up storing against the message — the thing that actually matters
  // here, since the whole point is that an undelivered message must not look delivered.
  const updates: Record<string, unknown>[] = [];

  const prisma = {
    conversation: {
      findUnique: jest.fn().mockResolvedValue(
        overrides.conversation === undefined ? { id: 'c1', ...WHATSAPP } : overrides.conversation,
      ),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'c-new', ...data })),
      update: jest.fn().mockResolvedValue({}),
    },
    message: {
      create: jest.fn().mockResolvedValue({ id: 'm1', status: 'QUEUED' }),
      findFirst: jest.fn(),
      update: jest.fn().mockImplementation(({ data }) => {
        updates.push(data);
        return Promise.resolve({ id: 'm1', ...data });
      }),
    },
    lead: { findUnique: jest.fn() },
    patient: { findUnique: jest.fn() },
    $transaction: jest.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
  };

  return { prisma, send, updates };
}

async function make(deps: ReturnType<typeof build>) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      ConversationsService,
      { provide: PrismaService, useValue: deps.prisma },
      { provide: OUTBOUND_SENDER, useValue: { send: deps.send, sendText: deps.send, status: () => ({ transport: 'evolution', label: 'x', canSend: true }) } },
    ],
  }).compile();
  return moduleRef.get(ConversationsService);
}

describe('Outbound message delivery', () => {
  it('marks a delivered message SENT and stamps the time', async () => {
    const deps = build();
    const service = await make(deps);

    const result = await service.sendMessage('c1', { content: 'Hello' }, 'u1');

    expect(deps.send).toHaveBeenCalledWith('905551112233', 'Hello');
    expect(result.status).toBe('SENT');
    expect(deps.updates[0]).toMatchObject({ status: 'SENT', failureReason: null });
  });

  it('keeps the message and records why when the gateway rejects it', async () => {
    // The message must survive a failed send. Deleting it, or never writing it, would leave the
    // coordinator with no evidence they ever tried — and no prompt to try again.
    const deps = build({ send: jest.fn().mockRejectedValue(new Error('Evolution API returned 401')) });
    const service = await make(deps);

    const result = await service.sendMessage('c1', { content: 'Hello' }, 'u1');

    expect(result.status).toBe('FAILED');
    expect(result.failureReason).toContain('401');
    expect(deps.prisma.message.create).toHaveBeenCalled();
  });

  it('fails a message with no reachable number rather than sending it nowhere', async () => {
    const deps = build({ conversation: { id: 'c1', channel: 'WHATSAPP', externalThreadId: null, lead: null, patient: null } });
    const service = await make(deps);

    const result = await service.sendMessage('c1', { content: 'Hello' }, 'u1');

    expect(result.status).toBe('FAILED');
    expect(deps.send).not.toHaveBeenCalled();
  });

  it('falls back to the contact number when the thread has none', async () => {
    const deps = build({
      conversation: {
        id: 'c1',
        channel: 'WHATSAPP',
        externalThreadId: null,
        lead: { phone: '+90 555 111 22 33', whatsappNumber: null },
        patient: null,
      },
    });
    const service = await make(deps);

    await service.sendMessage('c1', { content: 'Hi' }, 'u1');

    // Punctuation stripped, so this matches the id inbound messages arrive under.
    expect(deps.send).toHaveBeenCalledWith('905551112233', 'Hi');
  });

  it('does not silently queue on a channel with no transport', async () => {
    const deps = build({ conversation: { id: 'c1', channel: 'EMAIL', externalThreadId: 'a@b.com', lead: null, patient: null } });
    const service = await make(deps);

    const result = await service.sendMessage('c1', { content: 'Hello' }, 'u1');

    expect(result.status).toBe('FAILED');
    expect(result.failureReason).toContain('EMAIL');
    expect(deps.send).not.toHaveBeenCalled();
  });
});

describe('Retrying a failed message', () => {
  it('resends the stored text, not text supplied by the caller', async () => {
    const deps = build();
    deps.prisma.message.findFirst.mockResolvedValue({ id: 'm1', status: 'FAILED', content: 'Original wording' });
    const service = await make(deps);

    await service.retryMessage('c1', 'm1');

    expect(deps.send).toHaveBeenCalledWith('905551112233', 'Original wording');
  });

  it('refuses to resend one that already went out', async () => {
    // Retrying a SENT message would deliver it to the patient twice.
    const deps = build();
    deps.prisma.message.findFirst.mockResolvedValue({ id: 'm1', status: 'SENT', content: 'Hello' });
    const service = await make(deps);

    await expect(service.retryMessage('c1', 'm1')).rejects.toBeInstanceOf(BadRequestException);
    expect(deps.send).not.toHaveBeenCalled();
  });
});

describe('Starting a conversation', () => {
  it('reuses the existing thread for that number instead of opening a second one', async () => {
    const deps = build();
    deps.prisma.lead.findUnique.mockResolvedValue({ id: 'l1', phone: '+905551112233', whatsappNumber: null });
    deps.prisma.conversation.findFirst.mockResolvedValue({ id: 'c-existing' });
    const service = await make(deps);

    const conv = await service.startConversation({ leadId: 'l1' });

    expect(conv).toMatchObject({ id: 'c-existing' });
    expect(deps.prisma.conversation.create).not.toHaveBeenCalled();
  });

  it('stores the number in the same shape inbound messages arrive in', async () => {
    // Otherwise the patient's reply creates a parallel thread and half the exchange goes missing.
    const deps = build();
    deps.prisma.lead.findUnique.mockResolvedValue({ id: 'l1', phone: '+90 (555) 111-22-33', whatsappNumber: null });
    const service = await make(deps);

    await service.startConversation({ leadId: 'l1' });

    expect(deps.prisma.conversation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ externalThreadId: '905551112233' }) }),
    );
  });

  it('refuses a contact with no usable number', async () => {
    const deps = build();
    deps.prisma.lead.findUnique.mockResolvedValue({ id: 'l1', phone: '123', whatsappNumber: null });
    const service = await make(deps);

    await expect(service.startConversation({ leadId: 'l1' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
