import { Module, forwardRef } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { ConversationsController } from './conversations.controller';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

// forwardRef both ways: WhatsApp writes inbound messages into conversations, and conversations
// send outbound ones back through WhatsApp. The cycle is real and intentional — the alternative
// is a third module that exists only to break it.
@Module({
  imports: [forwardRef(() => WhatsAppModule)],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
