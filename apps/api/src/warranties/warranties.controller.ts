import { Controller, Get, Post, Patch, Param, Body, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { PLAN_STAFF_ROLES, PLAN_COORDINATION_ROLES } from '../treatment-plans/treatment-plans.controller';
import { WarrantiesService } from './warranties.service';
import { CreateWarrantyTemplateDto } from './dto/create-warranty-template.dto';
import { UpdateWarrantyTemplateDto } from './dto/update-warranty-template.dto';
import { IssueWarrantyDto } from './dto/issue-warranty.dto';

@Controller()
export class WarrantiesController {
  constructor(private readonly service: WarrantiesService) {}

  @Get('warranty-templates')
  @Roles(...PLAN_STAFF_ROLES)
  findTemplates(@Query('isActive') isActive?: string) {
    return this.service.findTemplates(isActive);
  }

  @Post('warranty-templates')
  @Roles(...PLAN_STAFF_ROLES)
  createTemplate(@Body() dto: CreateWarrantyTemplateDto) {
    return this.service.createTemplate(dto);
  }

  @Patch('warranty-templates/:id')
  @Roles(...PLAN_STAFF_ROLES)
  updateTemplate(@Param('id') id: string, @Body() dto: UpdateWarrantyTemplateDto) {
    return this.service.updateTemplate(id, dto);
  }

  @Get('warranties')
  @Roles(...PLAN_STAFF_ROLES)
  findByPatient(@Query('patientId') patientId: string) {
    return this.service.findByPatient(patientId);
  }

  @Get('warranties/:id')
  @Roles(...PLAN_STAFF_ROLES)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post('treatment-plan-items/:id/warranty')
  @Roles(...PLAN_COORDINATION_ROLES)
  issue(@Param('id') id: string, @Body() dto: IssueWarrantyDto) {
    return this.service.issue(id, dto);
  }
}
