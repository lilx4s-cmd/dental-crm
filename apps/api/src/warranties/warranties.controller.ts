import { Role } from '@dental-crm/shared';
import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { Permission, RoleBoundary } from '../common/decorators/permission.decorator';
import { CaseAccess, CaseAccessGuard } from '../common/guards/case-access.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  PLAN_STAFF_ROLES,
} from '../treatment-plans/treatment-plans.controller';
import { WarrantiesService } from './warranties.service';
import { CreateWarrantyTemplateDto } from './dto/create-warranty-template.dto';
import { UpdateWarrantyTemplateDto } from './dto/update-warranty-template.dto';
import { IssueWarrantyDto } from './dto/issue-warranty.dto';

@Controller()
@RoleBoundary()
@UseGuards(CaseAccessGuard)
@CaseAccess({ type: 'WARRANTY', field: 'id' })
export class WarrantiesController {
  constructor(private readonly service: WarrantiesService) {}

  @Get('warranty-templates')
  @Permission('plans.read')
  @CaseAccess()
  @Roles(...PLAN_STAFF_ROLES)
  findTemplates(@Query('isActive') isActive?: string) {
    return this.service.findTemplates(isActive);
  }

  @Post('warranty-templates')
  @Permission('plans.write')
  @CaseAccess()
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER)
  createTemplate(@Body() dto: CreateWarrantyTemplateDto) {
    return this.service.createTemplate(dto);
  }

  @Patch('warranty-templates/:id')
  @Permission('plans.write')
  @CaseAccess()
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER)
  updateTemplate(@Param('id') id: string, @Body() dto: UpdateWarrantyTemplateDto) {
    return this.service.updateTemplate(id, dto);
  }

  @Get('warranties')
  @Permission('plans.read')
  @CaseAccess({ type: 'PATIENT', field: 'patientId', source: 'query' })
  @Roles(...PLAN_STAFF_ROLES)
  findByPatient(@Query('patientId') patientId: string) {
    return this.service.findByPatient(patientId);
  }

  @Get('warranties/:id')
  @Permission('plans.read')
  @Roles(...PLAN_STAFF_ROLES)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post('treatment-plan-items/:id/warranty')
  @Permission('plans.write')
  @CaseAccess({ type: 'PLAN_ITEM', field: 'id' })
  @Roles(...PLAN_STAFF_ROLES)
  issue(@Param('id') id: string, @Body() dto: IssueWarrantyDto) {
    return this.service.issue(id, dto);
  }
}
