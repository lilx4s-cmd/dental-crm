import { Module } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppWebService } from './whatsapp-web.service';
import { WhatsAppController } from './whatsapp.controller';
import { ConversationsModule } from '../conversations/conversations.module';

@Module({
  imports: [ConversationsModule],
  controllers: [WhatsAppController],
  providers: [WhatsAppService, WhatsAppWebService],
  exports: [WhatsAppService, WhatsAppWebService],
})
export class WhatsAppModule {}
