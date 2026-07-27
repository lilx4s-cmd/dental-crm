import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { Roles } from '../common/decorators/roles.decorator';
import { MANAGEMENT, PIPELINE } from '../common/access-policy';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('kpi')
  @Roles(...MANAGEMENT)
  getKpi() {
    return this.reportsService.getKpiSnapshot();
  }

  @Get('revenue')
  @Roles(...MANAGEMENT)
  @ApiQuery({ name: 'months', required: false, type: Number })
  getRevenue(@Query('months') months?: string) {
    return this.reportsService.getMonthlyRevenue(months ? parseInt(months) : 12);
  }

  @Get('appointments')
  @Roles(...MANAGEMENT)
  getAppointments() {
    return this.reportsService.getAppointmentStats();
  }

  @Get('patient-growth')
  @Roles(...MANAGEMENT)
  @ApiQuery({ name: 'months', required: false, type: Number })
  getPatientGrowth(@Query('months') months?: string) {
    return this.reportsService.getPatientGrowth(months ? parseInt(months) : 12);
  }

  @Get('lead-funnel')
  @Roles(...PIPELINE)
  getLeadFunnel() {
    return this.reportsService.getLeadFunnel();
  }
}
