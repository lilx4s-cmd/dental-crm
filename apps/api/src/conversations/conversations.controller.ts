import { Controller, Get, Post, Patch, Param, Body, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '@dental-crm/shared';
import { ConversationsService } from './conversations.service';
import { ConversationsQueryDto } from './dto/conversations-query.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { StartConversationDto } from './dto/start-conversation.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { PATIENT_FACING, MANAGEMENT } from '../common/access-policy';

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  @Roles(...PATIENT_FACING)
  findAll(@Query() query: ConversationsQueryDto, @CurrentUser() user: JwtPayload) {
    return this.conversationsService.findAll(query, user);
  }

  /**
   * Whether a reply typed right now could actually be delivered.
   *
   * Declared before ':id' — Nest matches routes in order, so a later literal path would be
   * swallowed by the parameter route and arrive as a lookup for a conversation called "sending".
   */
  /** Threads needing an answer, for the navigation badge. Declared before ':id'. */
  @Get('unread')
  @Roles(...PATIENT_FACING)
  unreadSummary(@CurrentUser() user: JwtPayload) {
    return this.conversationsService.unreadSummary(user);
  }

  @Get('sending-status')
  @Roles(...PATIENT_FACING)
  async sendingStatus(@Query('conversationId') id: string | undefined, @CurrentUser() user: JwtPayload) {
    if (!id) return this.conversationsService.sendingStatus();
    await this.conversationsService.assertAccess(id, user);
    const conversation = await this.conversationsService.findOne(id);
    return this.conversationsService.sendingStatus(conversation.whatsappSessionId);
  }

  @Post('start')
  @Roles(...PATIENT_FACING)
  async start(@Body() dto: StartConversationDto, @CurrentUser() user: JwtPayload) {
    await this.conversationsService.assertStartAccess(dto, user);
    return this.conversationsService.startConversation(dto, user.sub);
  }

  @Get(':id')
  @Roles(...PATIENT_FACING)
  async findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.conversationsService.assertAccess(id, user);
    return this.conversationsService.findOne(id);
  }

  @Post(':id/messages')
  @Roles('SALES_CONSULTANT', 'RECEPTION')
  async sendMessage(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.conversationsService.assertAccess(id, user);
    return this.conversationsService.sendMessage(id, dto, user.sub);
  }

  @Post(':id/messages/:messageId/retry')
  @Roles('SALES_CONSULTANT', 'RECEPTION')
  async retry(@Param('id') id: string, @Param('messageId') messageId: string, @CurrentUser() user: JwtPayload) {
    await this.conversationsService.assertAccess(id, user);
    return this.conversationsService.retryMessage(id, messageId);
  }

  /**
   * Marks a thread read, as of the server's clock.
   *
   * A PATCH rather than a side effect of GET :id, because a read is a change to shared state — two
   * people opening the same inbox should not have one of them silently clearing the other's badge
   * just by looking.
   */
  @Patch(':id/read')
  @Roles(...PATIENT_FACING)
  async markRead(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.conversationsService.assertAccess(id, user);
    if (user.role === 'SUPER_ADMIN' || user.role === 'CLINIC_MANAGER') return { success: true };
    return this.conversationsService.markRead(id);
  }

  // Everything sent or received in this thread, for the attachments panel.
  @Get(':id/attachments')
  @Roles(...PATIENT_FACING)
  async attachments(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.conversationsService.assertAccess(id, user);
    return this.conversationsService.attachments(id);
  }

  // Pinning is clinic-wide, so it is deliberately not restricted to whoever is assigned: the
  // point of a pin is that the person covering can find the thread too.
  @Patch(':id/pin')
  @Roles(...PATIENT_FACING)
  async pin(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.conversationsService.assertAccess(id, user);
    return this.conversationsService.setPinned(id, true);
  }

  @Patch(':id/unpin')
  @Roles(...PATIENT_FACING)
  async unpin(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.conversationsService.assertAccess(id, user);
    return this.conversationsService.setPinned(id, false);
  }

  @Patch(':id/archive')
  @Roles(...PATIENT_FACING)
  async archive(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.conversationsService.assertAccess(id, user);
    return this.conversationsService.archive(id);
  }

  @Patch(':id/assign/:userId')
  @Roles(...MANAGEMENT)
  assign(@Param('id') id: string, @Param('userId') userId: string) {
    return this.conversationsService.assign(id, userId);
  }
}
