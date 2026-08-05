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
  findAll(@Query() query: ConversationsQueryDto) {
    return this.conversationsService.findAll(query);
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
  unreadSummary() {
    return this.conversationsService.unreadSummary();
  }

  @Get('sending-status')
  @Roles(...PATIENT_FACING)
  sendingStatus() {
    return this.conversationsService.sendingStatus();
  }

  @Post('start')
  @Roles(...PATIENT_FACING)
  start(@Body() dto: StartConversationDto) {
    return this.conversationsService.startConversation(dto);
  }

  @Get(':id')
  @Roles(...PATIENT_FACING)
  findOne(@Param('id') id: string) {
    return this.conversationsService.findOne(id);
  }

  @Post(':id/messages')
  @Roles(...PATIENT_FACING)
  sendMessage(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.conversationsService.sendMessage(id, dto, user.sub);
  }

  @Post(':id/messages/:messageId/retry')
  @Roles(...PATIENT_FACING)
  retry(@Param('id') id: string, @Param('messageId') messageId: string) {
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
  markRead(@Param('id') id: string) {
    return this.conversationsService.markRead(id);
  }

  @Patch(':id/archive')
  @Roles(...PATIENT_FACING)
  archive(@Param('id') id: string) {
    return this.conversationsService.archive(id);
  }

  @Patch(':id/assign/:userId')
  @Roles(...MANAGEMENT)
  assign(@Param('id') id: string, @Param('userId') userId: string) {
    return this.conversationsService.assign(id, userId);
  }
}
