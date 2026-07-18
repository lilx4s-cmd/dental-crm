import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('kpi')
  getKpi() {
    return this.reportsService.getKpiSnapshot();
  }

  @Get('revenue')
  @ApiQuery({ name: 'months', required: false, type: Number })
  getRevenue(@Query('months') months?: string) {
    return this.reportsService.getMonthlyRevenue(months ? parseInt(months) : 12);
  }

  @Get('appointments')
  getAppointments() {
    return this.reportsService.getAppointmentStats();
  }

  @Get('patient-growth')
  @ApiQuery({ name: 'months', required: false, type: Number })
  getPatientGrowth(@Query('months') months?: string) {
    return this.reportsService.getPatientGrowth(months ? parseInt(months) : 12);
  }

  @Get('lead-funnel')
  getLeadFunnel() {
    return this.reportsService.getLeadFunnel();
  }
}
