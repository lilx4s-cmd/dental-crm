import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

/**
 * Global, like PrismaModule: password reset needs it today, and appointment reminders (C-5, Phase
 * B) and invoice delivery will need it from elsewhere. Wiring it into each consumer's imports as
 * that list grows is churn with no benefit.
 */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
