import { Module, Controller, Get, Query } from '@nestjs/common';
import { JwtPayload } from '@dental-crm/shared';
import { SCHEDULING } from '../common/access-policy';
import { Roles } from '../common/decorators/roles.decorator';
import { Permission } from '../common/decorators/permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StaffAlertsModule } from '../staff-alerts/staff-alerts.module';
import { PatientScheduleService } from './patient-schedule.service';
@Controller('patient-schedule')
export class PatientScheduleController {
  constructor(private service: PatientScheduleService) {}
  @Get('calendar')
  @Roles(...SCHEDULING)
  @Permission('appointments.read')
  calendar(@Query('from') from: string, @Query('to') to: string, @CurrentUser() user: JwtPayload) {
    return this.service.calendar(from, to, user);
  }
}
@Module({
  imports: [StaffAlertsModule],
  controllers: [PatientScheduleController],
  providers: [PatientScheduleService],
})
export class PatientScheduleModule {}
