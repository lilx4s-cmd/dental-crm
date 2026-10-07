import { Module } from '@nestjs/common';
import { CallingController, CallingWebhookController } from './calling.controller';
import { CallingService } from './calling.service';
import { TelnyxProvider } from './telnyx.provider';
@Module({ controllers: [CallingController, CallingWebhookController], providers: [CallingService, TelnyxProvider] })
export class CallingModule {}
