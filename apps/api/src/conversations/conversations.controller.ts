import { Controller, Get, Post, Patch, Param, Body, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '@dental-crm/shared';
import { ConversationsService } from './conversations.service';
import { ConversationsQueryDto } from './dto/conversations-query.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { StartConversationDto } from './dto/start-conversation.dto';

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  findAll(@Query() query: ConversationsQueryDto) {
    return this.conversationsService.findAll(query);
  }

  /**
   * Whether a reply typed right now could actually be delivered.
   *
   * Declared before ':id' — Nest matches routes in order, so a later literal path would be
   * swallowed by the parameter route and arrive as a lookup for a conversation called "sending".
   */
  @Get('sending-status')
  sendingStatus() {
    return this.conversationsService.sendingStatus();
  }

  @Post('start')
  start(@Body() dto: StartConversationDto) {
    return this.conversationsService.startConversation(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.conversationsService.findOne(id);
  }

  @Post(':id/messages')
  sendMessage(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.conversationsService.sendMessage(id, dto, user.sub);
  }

  @Post(':id/messages/:messageId/retry')
  retry(@Param('id') id: string, @Param('messageId') messageId: string) {
    return this.conversationsService.retryMessage(id, messageId);
  }

  @Patch(':id/archive')
  archive(@Param('id') id: string) {
    return this.conversationsService.archive(id);
  }

  @Patch(':id/assign/:userId')
  assign(@Param('id') id: string, @Param('userId') userId: string) {
    return this.conversationsService.assign(id, userId);
  }
}
