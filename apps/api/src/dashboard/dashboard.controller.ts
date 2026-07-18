import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@dental-crm/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get dashboard KPI stats' })
  getStats() {
    return this.dashboardService.getStats();
  }

  @Get('pipeline')
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER, Role.SALES_CONSULTANT)
  @ApiOperation({ summary: 'Get leads grouped by pipeline stage' })
  getPipeline() {
    return this.dashboardService.getPipelineGroups();
  }
}
