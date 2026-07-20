import { Module } from '@nestjs/common';
import { TreatmentPlansService } from './treatment-plans.service';
import { TreatmentPlansController } from './treatment-plans.controller';
import { PdfModule } from '../pdf/pdf.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [PdfModule, SettingsModule],
  controllers: [TreatmentPlansController],
  providers: [TreatmentPlansService],
  exports: [TreatmentPlansService],
})
export class TreatmentPlansModule {}
