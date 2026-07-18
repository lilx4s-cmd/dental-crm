import { Controller, Get, Post, Patch, Param, Body, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role, JwtPayload } from '@dental-crm/shared';
import { TreatmentPlansService } from './treatment-plans.service';
import { CreateTreatmentPlanDto } from './dto/create-treatment-plan.dto';

@Controller('treatment-plans')
export class TreatmentPlansController {
  constructor(private readonly service: TreatmentPlansService) {}

  @Get()
  findByPatient(@Query('patientId') patientId: string) {
    return this.service.findByPatient(patientId);
  }

  @Get('categories')
  findCategories() {
    return this.service.findCategories();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER, Role.DENTIST)
  create(@Body() dto: CreateTreatmentPlanDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(dto, user.sub);
  }

  @Post('categories')
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER, Role.DENTIST)
  createCategory(@Body('name') name: string, @Body('description') description?: string) {
    return this.service.createCategory(name, description);
  }

  @Patch(':id/status')
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER, Role.DENTIST)
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.service.updateStatus(id, status);
  }
}
