import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OUTBOUND_SENDER, type OutboundSender } from './outbound-sender';
import { ConversationsQueryDto } from './dto/conversations-query.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { StartConversationDto } from './dto/start-conversation.dto';

/**
 * Reduces a phone number to the bare digits WhatsApp addresses people by.
 *
 * Inbound messages arrive as `905551112233@s.whatsapp.net`, while staff type numbers with plus
 * signs, spaces and brackets. Storing both in the same shape is what keeps a thread the clinic
 * started and a reply the patient sends from becoming two separate conversations.
 */
function normalisePhone(value?: string | null): string | null {
  const digits = (value ?? '').replace(/\D/g, '');
  // Shorter than this is a typo or an extension, not a reachable international number.
  return digits.length >= 8 ? digits : null;
}

const MESSAGE_SELECT = {
  id: true,
  direction: true,
  content: true,
  mediaUrl: true,
  status: true,
  failureReason: true,
  createdAt: true,
  sentAt: true,
  senderUser: { select: { id: true, firstName: true, lastName: true } },
} as const;

const CONVERSATION_SELECT = {
  id: true,
  channel: true,
  externalThreadId: true,
  isArchived: true,
  lastMessageAt: true,
  createdAt: true,
  patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
  lead: { select: { id: true, firstName: true, lastName: true, phone: true, stage: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
  messages: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: { content: true, direction: true, createdAt: true },
  },
} as const;

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    // Injected by token, not by class — see outbound-sender.ts for why that matters here.
    @Inject(OUTBOUND_SENDER)
    private readonly sender: OutboundSender,
  ) {}

  async findAll(query: ConversationsQueryDto) {
    const where: Prisma.ConversationWhereInput = {};
    if (query.channel) where.channel = query.channel as $Enums.ConversationChannel;
    if (query.assignedToId) where.assignedToId = query.assignedToId;
    where.isArchived = query.isArchived ?? false;

    return this.prisma.conversation.findMany({
      where,
      select: CONVERSATION_SELECT,
      orderBy: { lastMessageAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id },
      select: {
        ...CONVERSATION_SELECT,
        messages: { orderBy: { createdAt: 'asc' }, select: MESSAGE_SELECT },
      },
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    return conv;
  }

  /** Whether a reply typed right now could actually leave the building, and by which route. */
  sendingStatus() {
    return this.sender.status();
  }

  /**
   * Records an outbound message and hands it to WhatsApp.
   *
   * The row is written first and then updated with the outcome, rather than only being written on
   * success. A coordinator who typed a message needs to see it either way — a send that vanishes
   * because the gateway was down looks identical to one that was never typed, and the second
   * attempt then duplicates or, worse, never happens.
   */
  async sendMessage(conversationId: string, dto: SendMessageDto, userId: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        lead: { select: { phone: true, whatsappNumber: true } },
        patient: { select: { phone: true, whatsappNumber: true } },
      },
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId,
          direction: $Enums.MessageDirection.OUTBOUND,
          senderUserId: userId,
          content: dto.content,
          mediaUrl: dto.mediaUrl,
          templateName: dto.templateName,
          status: $Enums.MessageStatus.QUEUED,
        },
        select: MESSAGE_SELECT,
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    return this.dispatch(message.id, conv, dto.content ?? '');
  }

  /**
   * Retries a message that failed to go out.
   *
   * Re-sends the text already stored rather than taking it again from the client, so a retry
   * cannot quietly change what the patient receives.
   */
  async retryMessage(conversationId: string, messageId: string) {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId },
      select: { id: true, status: true, content: true },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.status !== $Enums.MessageStatus.FAILED) {
      throw new BadRequestException('Only a failed message can be retried');
    }

    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        lead: { select: { phone: true, whatsappNumber: true } },
        patient: { select: { phone: true, whatsappNumber: true } },
      },
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    return this.dispatch(message.id, conv, message.content ?? '');
  }

  /**
   * Opens a thread with somebody who has never written in.
   *
   * Until now a conversation could only be created by an inbound message, so the clinic could
   * reply but never start — which is backwards for a sales pipeline where reaching out first is
   * the entire job.
   */
  async startConversation(dto: StartConversationDto) {
    const channel = $Enums.ConversationChannel.WHATSAPP;

    const contact = dto.leadId
      ? await this.prisma.lead.findUnique({
          where: { id: dto.leadId },
          select: { id: true, phone: true, whatsappNumber: true },
        })
      : await this.prisma.patient.findUnique({
          where: { id: dto.patientId },
          select: { id: true, phone: true, whatsappNumber: true },
        });
    if (!contact) throw new NotFoundException('Contact not found');

    const phone = normalisePhone(contact.whatsappNumber ?? contact.phone);
    if (!phone) {
      throw new BadRequestException('This contact has no phone number to message');
    }

    // Matching on the number, not on the lead, keeps one thread per person: an inbound message
    // arriving later finds this same conversation rather than opening a second one beside it.
    const existing = await this.prisma.conversation.findFirst({
      where: { channel, externalThreadId: phone },
      select: CONVERSATION_SELECT,
    });
    if (existing) return existing;

    return this.prisma.conversation.create({
      data: {
        channel,
        externalThreadId: phone,
        leadId: dto.leadId,
        patientId: dto.patientId,
        lastMessageAt: new Date(),
      },
      select: CONVERSATION_SELECT,
    });
  }

  /** Sends, then stamps the message with what happened. Never throws — the outcome is the return. */
  private async dispatch(
    messageId: string,
    conv: {
      channel: $Enums.ConversationChannel;
      externalThreadId: string | null;
      lead: { phone: string | null; whatsappNumber: string | null } | null;
      patient: { phone: string | null; whatsappNumber: string | null } | null;
    },
    content: string,
  ) {
    const fail = (reason: string) =>
      this.prisma.message.update({
        where: { id: messageId },
        data: { status: $Enums.MessageStatus.FAILED, failureReason: reason },
        select: MESSAGE_SELECT,
      });

    if (conv.channel !== $Enums.ConversationChannel.WHATSAPP) {
      // Email, SMS and Messenger have no transport wired up yet. Marking them FAILED with a plain
      // reason is honest; leaving them QUEUED forever would imply delivery is still coming.
      return fail(`Sending on ${conv.channel} is not connected yet`);
    }

    const phone = normalisePhone(
      conv.externalThreadId ??
        conv.patient?.whatsappNumber ??
        conv.patient?.phone ??
        conv.lead?.whatsappNumber ??
        conv.lead?.phone,
    );
    if (!phone) return fail('No phone number on this conversation');
    if (!content.trim()) return fail('Nothing to send');

    try {
      const transport = await this.sender.sendText(phone, content);
      this.logger.log(`Sent message ${messageId} via ${transport}`);
      return this.prisma.message.update({
        where: { id: messageId },
        data: { status: $Enums.MessageStatus.SENT, sentAt: new Date(), failureReason: null },
        select: MESSAGE_SELECT,
      });
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'WhatsApp rejected the message';
      this.logger.warn(`Message ${messageId} failed to send: ${reason}`);
      return fail(reason);
    }
  }

  async archive(id: string) {
    await this.findOne(id);
    return this.prisma.conversation.update({ where: { id }, data: { isArchived: true }, select: CONVERSATION_SELECT });
  }

  async assign(id: string, assignedToId: string) {
    await this.findOne(id);
    return this.prisma.conversation.update({ where: { id }, data: { assignedToId }, select: CONVERSATION_SELECT });
  }

  async createInboundMessage(
    channel: $Enums.ConversationChannel,
    externalThreadId: string,
    content: string,
    externalMessageId: string,
    leadId?: string,
    patientId?: string,
  ) {
    let conversation = await this.prisma.conversation.findFirst({
      where: { channel, externalThreadId },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: { channel, externalThreadId, leadId, patientId, lastMessageAt: new Date() },
      });
    } else {
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      });
    }

    return this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: $Enums.MessageDirection.INBOUND,
        content,
        externalMessageId,
        status: $Enums.MessageStatus.DELIVERED,
      },
    });
  }
}
