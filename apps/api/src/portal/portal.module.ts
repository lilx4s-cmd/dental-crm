import { Module } from '@nestjs/common';
import { PortalService } from './portal.service';
import { PortalController } from './portal.controller';
import { PdfModule } from '../pdf/pdf.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [PdfModule, SettingsModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
