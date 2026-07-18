import { Injectable, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationsQueryDto } from './dto/conversations-query.dto';
import { SendMessageDto } from './dto/send-message.dto';

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
  constructor(private readonly prisma: PrismaService) {}

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
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            direction: true,
            content: true,
            mediaUrl: true,
            status: true,
            createdAt: true,
            senderUser: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    return conv;
  }

  async sendMessage(conversationId: string, dto: SendMessageDto, userId: string) {
    const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
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
        select: {
          id: true,
          direction: true,
          content: true,
          status: true,
          createdAt: true,
          senderUser: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    return message;
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
