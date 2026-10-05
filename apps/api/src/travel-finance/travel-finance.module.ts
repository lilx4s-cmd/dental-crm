import { TicketExtractionService } from './ticket-extraction.service';
import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { GoogleCalendarService } from './google-calendar.service';
import { TravelFinanceService } from './travel-finance.service';
import { TravelController, OperationsFinanceController } from './travel-finance.controller';
@Module({
  imports: [FilesModule],
  providers: [TravelFinanceService, GoogleCalendarService, TicketExtractionService],
  exports: [TravelFinanceService, GoogleCalendarService, TicketExtractionService],
  controllers: [TravelController, OperationsFinanceController],
})
export class TravelFinanceModule {}
