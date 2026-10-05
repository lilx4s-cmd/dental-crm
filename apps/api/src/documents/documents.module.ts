import { TravelFinanceModule } from '../travel-finance/travel-finance.module';
import { Module } from '@nestjs/common';
import { TreatmentPlansModule } from '../treatment-plans/treatment-plans.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
@Module({
  imports: [TreatmentPlansModule, InvoicesModule,TravelFinanceModule],
  providers: [DocumentsService],
  controllers: [DocumentsController],
})
export class DocumentsModule {}
