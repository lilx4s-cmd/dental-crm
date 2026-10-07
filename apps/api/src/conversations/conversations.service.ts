import { hasPermission, canSeeAllLeads, canSupervise } from '@dental-crm/shared';
import { BadRequestException, ForbiddenException, Inject, Injectable, Optional, Logger, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { JwtPayload, Role } from '@dental-crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CoachingService } from '../coaching/coaching.service';
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
 *
 * Named `whatsappAddress` rather than `normalisePhone`, which is what it used to be called. The
 * shared package exports a `normalisePhone` too — a different function, with different rules and a
 * different return type — and two functions with one name is a mistake waiting for whoever adds
 * the next import. This one deliberately has no country logic: a WhatsApp id is already
 * international by the time it reaches us.
 */
function whatsappAddress(value?: string | null): string | null {
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
  // Ordered by when they were linked, which is the order they were picked in the composer. A
  // quote followed by its itinerary reads differently from the reverse.
  attachments: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      file: {
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
          scanStatus: true,
          createdAt: true,
          uploadedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  },
} as const;

const CONVERSATION_SELECT = {
  whatsappSessionId: true,
  whatsappContactName: true,
  id: true,
  channel: true,
  externalThreadId: true,
  isArchived: true,
  isPinned: true,
  pinnedAt: true,
  lastMessageAt: true,
  lastReadAt: true,
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
    @Optional() private readonly coaching?: CoachingService,
  ) {}

  private scope(user?: JwtPayload): Prisma.ConversationWhereInput {
    if (!user || hasPermission(user, 'conversations.all', user.role === Role.SUPER_ADMIN || user.role === Role.CLINIC_MANAGER)) return {};
    return { AND: [{ OR: [{ whatsappSessionId: 'default' }, { whatsappSessionId: `user:${user.sub}` }, ...(canSupervise(user) ? [{ lead: { supervisorId: user.sub } }] : [])] }] };
  }

  async assertAccess(id: string, user: JwtPayload) {
    const conversation = await this.prisma.conversation.findFirst({ where: { id, ...this.scope(user) }, select: { id: true } });
    if (!conversation) throw new NotFoundException('Conversation not found');
  }

  async assertSendAccess(id: string, user: JwtPayload) {
    await this.assertAccess(id, user);
    const conversation = await this.prisma.conversation.findUnique({ where: { id }, select: { whatsappSessionId: true } });
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.whatsappSessionId !== 'default' && conversation.whatsappSessionId !== `user:${user.sub}`) throw new ForbiddenException('You can only send through your own work account.');
  }

  async assertStartAccess(dto: StartConversationDto, user: JwtPayload) {
    if (!!dto.leadId === !!dto.patientId) throw new BadRequestException('Choose exactly one lead or patient.');
    if (dto.whatsappSessionId && dto.whatsappSessionId !== 'default' && dto.whatsappSessionId !== `user:${user.sub}`) {
      throw new ForbiddenException('Start conversations using your own work number or the shared clinic number.');
    }
    if (dto.leadId && !canSeeAllLeads(user)) {
      const lead = await this.prisma.lead.findFirst({ where: { id: dto.leadId, assignedToId: user.sub }, select: { id: true } });
      if (!lead) throw new NotFoundException('Lead not found');
    }
  }

  async findAll(query: ConversationsQueryDto, user?: JwtPayload) {
    const where: Prisma.ConversationWhereInput = this.scope(user);
    if (query.whatsappSessionId) where.whatsappSessionId = query.whatsappSessionId;
    if (query.leadId) where.leadId = query.leadId;
    if (query.channel) where.channel = query.channel as $Enums.ConversationChannel;
    if (query.assignedToId) where.assignedToId = query.assignedToId;
    if (query.unassignedOnly) where.assignedToId = null;
    where.isArchived = query.isArchived ?? false;

    const search = query.search?.trim();
    if (search) {
      const digits = search.replace(/\D/g, '');
      where.OR = [
        { whatsappContactName: { contains: search, mode: 'insensitive' } },
        { lead: { firstName: { contains: search, mode: 'insensitive' } } },
        { lead: { lastName: { contains: search, mode: 'insensitive' } } },
        { patient: { firstName: { contains: search, mode: 'insensitive' } } },
        { patient: { lastName: { contains: search, mode: 'insensitive' } } },
        // What was said in the thread. Last, because it is the widest of the conditions and the
        // planner will take a cheaper one first when it can.
        { messages: { some: { content: { contains: search, mode: 'insensitive' } } } },
        // A typed number is matched against the stored digits, not the formatted string: staff
        // type "+90 555" and the record holds 905551234567. Four digits minimum, or "0" matches
        // half the inbox and proves it with a full scan.
        ...(digits.length >= 4
          ? [
              { lead: { phone: { contains: digits } } },
              { lead: { whatsappNumber: { contains: digits } } },
              { patient: { phone: { contains: digits } } },
              { externalThreadId: { contains: digits } },
            ]
          : []),
      ];
    }

    const conversations = await this.prisma.conversation.findMany({
      where,
      select: CONVERSATION_SELECT,
      // Pinned first, then most recently spoken. Imported chats without a timestamp stay
      // after dated chats within each pin group while their history is still arriving.
      orderBy: [{ isPinned: 'desc' }, { lastMessageAt: { sort: 'desc', nulls: 'last' } }],
    });

    const withCounts = await this.withUnreadCounts(conversations);

    // Filtered after counting rather than in SQL: "unread" is derived from lastReadAt against each
    // thread's messages, which is the grouped query below and not a column anything can filter on.
    return query.unreadOnly ? withCounts.filter((c) => c.unreadCount > 0) : withCounts;
  }

  /**
   * Pins or unpins a thread.
   *
   * Clinic-wide, not per person — see the schema. `pinnedAt` is recorded so a future ordering can
   * put the most recently pinned first; today they sort by last message like everything else,
   * because a clinic with three pinned threads does not need them ranked among themselves.
   */
  async setPinned(id: string, isPinned: boolean) {
    const existing = await this.prisma.conversation.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Conversation not found');

    return this.prisma.conversation.update({
      where: { id },
      data: { isPinned, pinnedAt: isPinned ? new Date() : null },
      select: CONVERSATION_SELECT,
    });
  }

  /**
   * How many inbound messages have arrived since staff last opened each thread.
   *
   * One grouped query for the whole list rather than a count per conversation: an inbox of forty
   * threads would otherwise be forty round-trips, and the inbox is the screen people leave open.
   *
   * A thread nobody has ever opened counts everything inbound, which is the honest reading of
   * `lastReadAt` being null — not "zero unread", but "none of it has been looked at".
   */
  private async withUnreadCounts<T extends { id: string; lastReadAt: Date | null }>(conversations: T[]) {
    if (conversations.length === 0) return conversations.map((c) => ({ ...c, unreadCount: 0 }));

    const counts = await this.prisma.message.groupBy({
      by: ['conversationId'],
      where: {
        direction: $Enums.MessageDirection.INBOUND,
        OR: conversations.map((c) => ({
          conversationId: c.id,
          ...(c.lastReadAt ? { createdAt: { gt: c.lastReadAt } } : {}),
        })),
      },
      _count: { _all: true },
    });

    const byId = new Map(counts.map((row) => [row.conversationId, row._count._all]));
    return conversations.map((c) => ({ ...c, unreadCount: byId.get(c.id) ?? 0 }));
  }

  /**
   * The number the navigation badge shows.
   *
   * Deliberately counts threads, not messages: "6" meaning six conversations needing an answer is
   * actionable, where "137" meaning message lines is only alarming.
   */
  async unreadSummary(user?: JwtPayload) {
    const conversations = await this.prisma.conversation.findMany({
      where: { isArchived: false, ...this.scope(user) },
      select: { id: true, lastReadAt: true },
    });

    const withCounts = await this.withUnreadCounts(conversations);
    const threads = withCounts.filter((c) => c.unreadCount > 0);

    return {
      conversations: threads.length,
      messages: threads.reduce((sum, c) => sum + c.unreadCount, 0),
    };
  }

  /**
   * Marks a thread read, as of now.
   *
   * Called when the thread is opened. Uses the server's clock rather than a timestamp from the
   * client, so a device with a skewed clock cannot mark future messages read before they arrive.
   */
  async markRead(id: string) {
    await this.prisma.conversation.update({
      where: { id },
      data: { lastReadAt: new Date() },
      select: { id: true },
    });
    return { ok: true };
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
  sendingStatus(sessionId = 'default') {
    return this.sender.status(sessionId);
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

    // Checked before anything is written: an id from another thread is not attachable here,
    // however it was come by. Scoped to this conversation rather than merely to files the caller
    // could read, because a file being readable is not the same as it belonging in this thread.
    const fileIds = [...new Set(dto.fileIds ?? [])];
    if (fileIds.length || dto.mediaUrl || dto.templateName) {
      throw new BadRequestException('This WhatsApp transport supports text only. Send files from the linked work phone.');
    }
    const attachable = fileIds.length
      ? await this.prisma.file.findMany({
          where: {
            id: { in: fileIds },
            ownerType: $Enums.AttachableType.CONVERSATION,
            ownerId: conversationId,
          },
          select: { id: true },
        })
      : [];

    if (attachable.length !== fileIds.length) {
      throw new BadRequestException('One of those attachments does not belong to this conversation.');
    }

    if (!dto.content?.trim() && attachable.length === 0) {
      throw new BadRequestException('Send some text, an attachment, or both.');
    }

    // Preserves the order they were picked in rather than whatever order the database returned.
    const ordered = fileIds.filter((id) => attachable.some((f) => f.id === id));

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
          // Written in the same transaction as the message. A message that exists without its
          // attachments is one the patient is told about and cannot be given.
          attachments: { create: ordered.map((fileId) => ({ fileId })) },
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
   * Every file sent or received in this thread, newest first.
   *
   * Read from the attachments rather than from `File.ownerId`, so a file uploaded into the
   * composer and then removed before sending does not appear — it exists in storage until the
   * sweep collects it, but it was never part of the conversation.
   */
  async attachments(conversationId: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true },
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    const rows = await this.prisma.messageAttachment.findMany({
      where: { message: { conversationId } },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        message: { select: { id: true, direction: true, createdAt: true } },
        file: {
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            sizeBytes: true,
            scanStatus: true,
            createdAt: true,
            uploadedBy: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    return rows.map((r) => ({ ...r.file, message: r.message }));
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
  async startConversation(dto: StartConversationDto, userId?: string) {
    const sessionId = dto.whatsappSessionId ?? 'default';
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

    const phone = whatsappAddress(contact.whatsappNumber ?? contact.phone);
    if (!phone) {
      throw new BadRequestException('This contact has no phone number to message');
    }

    // Matching on the number, not on the lead, keeps one thread per person: an inbound message
    // arriving later finds this same conversation rather than opening a second one beside it.
    const existing = await this.prisma.conversation.findFirst({
      where: { channel, externalThreadId: phone, whatsappSessionId: sessionId },
      select: CONVERSATION_SELECT,
    });
    if (existing) return existing;

    return this.prisma.conversation.create({
      data: {
        channel,
        externalThreadId: phone,
        whatsappSessionId: sessionId,
        assignedToId: userId,
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
      whatsappSessionId?: string;
      leadId?: string | null;
      patientId?: string | null;
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

    if (conv.externalThreadId?.endsWith('@lid')) return fail('WhatsApp has not shared this contact’s phone number yet. Reply from the linked work phone.');
    const phone = whatsappAddress(
      conv.externalThreadId ??
        conv.patient?.whatsappNumber ??
        conv.patient?.phone ??
        conv.lead?.whatsappNumber ??
        conv.lead?.phone,
    );
    if (!phone) return fail('No phone number on this conversation');
    if (!content.trim()) return fail('Nothing to send');

    try {
      const transport = await this.sender.sendText(phone, content, conv.whatsappSessionId ?? 'default');
      this.logger.log(`Sent message ${messageId} via ${transport}`);
      const sent = await this.prisma.message.update({
        where: { id: messageId },
        data: { status: $Enums.MessageStatus.SENT, sentAt: new Date(), failureReason: null },
        select: MESSAGE_SELECT,
      });
      try { if (this.coaching) {
        const leadId = conv.leadId ?? (conv.patientId ? (await this.prisma.patient.findUnique({where:{id:conv.patientId},select:{convertedFromLeadId:true}}))?.convertedFromLeadId : null);
        if (leadId) await this.coaching.evaluateLead(leadId).catch(()=>this.logger.warn('Coaching refresh queued for reconciliation'));
      } } catch { this.logger.warn('Coaching refresh queued for reconciliation'); }
      return sent;
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
    sessionId = 'default',
    ownerUserId?: string,
    outbound = false,
    messageAt?: Date,
  ) {
    const duplicate = await this.prisma.message.findFirst({ where: { externalMessageId } });
    if (duplicate) return duplicate;
    let conversation = await this.prisma.conversation.findFirst({
      where: { channel, externalThreadId, whatsappSessionId: sessionId },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: { channel, externalThreadId, leadId, patientId, whatsappSessionId: sessionId, assignedToId: ownerUserId, lastMessageAt: messageAt ?? new Date() },
      });
    } else if (!messageAt || !conversation.lastMessageAt || conversation.lastMessageAt < messageAt || (!conversation.leadId && leadId) || (!conversation.patientId && patientId)) {
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          ...(!messageAt || !conversation.lastMessageAt || conversation.lastMessageAt < messageAt ? { lastMessageAt: messageAt ?? new Date() } : {}),
          ...(!conversation.leadId && leadId ? { leadId } : {}),
          ...(!conversation.patientId && patientId ? { patientId } : {}),
        },
      });
    }

    return this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: outbound ? $Enums.MessageDirection.OUTBOUND : $Enums.MessageDirection.INBOUND,
        senderUserId: outbound ? ownerUserId : undefined,
        sentAt: outbound ? messageAt ?? new Date() : undefined,
        createdAt: messageAt,
        content,
        externalMessageId,
        status: outbound ? $Enums.MessageStatus.SENT : $Enums.MessageStatus.DELIVERED,
      },
    });
  }
}
