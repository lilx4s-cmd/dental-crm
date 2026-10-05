import {
  Module,
  Controller,
  Post,
  Headers,
  HttpCode,
  UnauthorizedException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '../common/decorators/public.decorator';
import { StaffAlertsModule } from '../staff-alerts/staff-alerts.module';
import { StaffAlertsService } from '../staff-alerts/staff-alerts.service';
import { TravelFinanceModule } from '../travel-finance/travel-finance.module';
import { TravelFinanceService } from '../travel-finance/travel-finance.service';
import { GoogleCalendarService } from '../travel-finance/google-calendar.service';
import { TicketExtractionService } from '../travel-finance/ticket-extraction.service';
@Controller('operations-jobs')
class OperationsJobsController {
  private running = false;
  private logger = new Logger('OperationsJobs');
  constructor(
    private config: ConfigService,
    private alerts: StaffAlertsService,
    private finance: TravelFinanceService,
    private google: GoogleCalendarService,
    private tickets: TicketExtractionService,
  ) {}
  @Post('run') @Public() @HttpCode(202) run(@Headers('x-crm-worker-key') provided: string) {
    const expected = this.config.get<string>('OPERATIONS_WORKER_SECRET');
    if (!expected || expected.length < 32)
      throw new ServiceUnavailableException('External scheduler is not configured');
    const a = Buffer.from(expected),
      b = Buffer.from(typeof provided === 'string' ? provided : '');
    if (a.length !== b.length || !timingSafeEqual(a, b))
      throw new UnauthorizedException('Invalid scheduler credential');
    if (this.running) return { accepted: true, running: true };
    this.running = true;
    void Promise.allSettled([
      this.alerts.sweep(),
      this.finance.syncCommissions(),
      this.google.sweep(),
      this.tickets.sweep(),
    ])
      .then((results) => {
        for (const result of results)
          if (result.status === 'rejected')
            this.logger.error('Background job failed; inspect the persisted queue result');
      })
      .finally(() => {
        this.running = false;
      });
    return {
      accepted: true,
      note: 'Jobs run in the background. Provider delivery is reported separately.',
    };
  }
}
@Module({
  imports: [StaffAlertsModule, TravelFinanceModule],
  controllers: [OperationsJobsController],
})
export class OperationsJobsModule {}
