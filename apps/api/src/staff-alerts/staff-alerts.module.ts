import { Module } from '@nestjs/common';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { StaffAlertsController } from './staff-alerts.controller';
import { StaffAlertsService } from './staff-alerts.service';
@Module({
  imports: [WhatsAppModule],
  exports:[StaffAlertsService],
  controllers: [StaffAlertsController],
  providers: [StaffAlertsService],
})
export class StaffAlertsModule {}
