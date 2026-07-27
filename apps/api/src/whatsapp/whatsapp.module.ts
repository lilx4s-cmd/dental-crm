import { Module, forwardRef } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppWebService } from './whatsapp-web.service';
import { EvolutionService } from './evolution.service';
import { WhatsAppSenderService } from './whatsapp-sender.service';
import { WhatsAppController } from './whatsapp.controller';
import { ConversationsModule } from '../conversations/conversations.module';
import { OUTBOUND_SENDER } from '../conversations/outbound-sender';

// Satisfies the conversation layer's OUTBOUND_SENDER token with the WhatsApp dispatcher. `useExisting`
// rather than `useClass` so both names resolve to one instance.
const OUTBOUND_SENDER_PROVIDER = { provide: OUTBOUND_SENDER, useExisting: WhatsAppSenderService };

@Module({
  imports: [forwardRef(() => ConversationsModule)],
  controllers: [WhatsAppController],
  providers: [WhatsAppService, WhatsAppWebService, EvolutionService, WhatsAppSenderService, OUTBOUND_SENDER_PROVIDER],
  exports: [WhatsAppService, WhatsAppWebService, EvolutionService, WhatsAppSenderService, OUTBOUND_SENDER],
})
export class WhatsAppModule {}
