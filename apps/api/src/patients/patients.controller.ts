import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@dental-crm/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { CLINICAL, FINANCE } from '../common/access-policy';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { UpdateCaseEconomicsDto } from './dto/case-economics.dto';
import { PatientsQueryDto } from './dto/patients-query.dto';

@ApiTags('patients')
@ApiBearerAuth()
@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  // The list is not a directory of names — it selects allergies, diagnosis and insurance, so it
  // carries the same medical detail as the record it links to and is gated the same way.
  @Get()
  @Roles(...CLINICAL)
  @ApiOperation({ summary: 'List patients with search and pagination' })
  findAll(@Query() query: PatientsQueryDto) {
    return this.patientsService.findAll(query);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER, Role.RECEPTION)
  @ApiOperation({ summary: 'Create a patient' })
  create(@Body() dto: CreatePatientDto) {
    return this.patientsService.create(dto);
  }

  @Get(':id')
  @Roles(...CLINICAL)
  @ApiOperation({ summary: 'Get a patient by ID' })
  findOne(@Param('id') id: string) {
    return this.patientsService.findOne(id);
  }

  // The case file is the patient's money — service cost, commission, invoices — so it answers to
  // FINANCE rather than to whoever may read the clinical record.
  @Get(':id/case')
  @Roles(...FINANCE)
  @ApiOperation({ summary: 'Case file: economics, invoices and appointments for one patient' })
  caseFile(@Param('id') id: string) {
    return this.patientsService.caseFile(id);
  }

  // Money that only management should be setting.
  @Patch(':id/case')
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER)
  @ApiOperation({ summary: 'Set the service cost and sales commission for a case' })
  updateCaseEconomics(@Param('id') id: string, @Body() dto: UpdateCaseEconomicsDto) {
    return this.patientsService.updateCaseEconomics(id, dto);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER, Role.RECEPTION)
  @ApiOperation({ summary: 'Update a patient' })
  update(@Param('id') id: string, @Body() dto: UpdatePatientDto) {
    return this.patientsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER)
  @ApiOperation({ summary: 'Deactivate a patient' })
  deactivate(@Param('id') id: string) {
    return this.patientsService.deactivate(id);
  }

  @Post(':id/tags/:tagId')
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER, Role.RECEPTION)
  @ApiOperation({ summary: 'Add a tag to a patient' })
  addTag(@Param('id') id: string, @Param('tagId') tagId: string) {
    return this.patientsService.addTag(id, tagId);
  }

  @Delete(':id/tags/:tagId')
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER, Role.RECEPTION)
  @ApiOperation({ summary: 'Remove a tag from a patient' })
  removeTag(@Param('id') id: string, @Param('tagId') tagId: string) {
    return this.patientsService.removeTag(id, tagId);
  }
}
