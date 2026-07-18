import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@dental-crm/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PatientsQueryDto } from './dto/patients-query.dto';

@ApiTags('patients')
@ApiBearerAuth()
@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
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
  @ApiOperation({ summary: 'Get a patient by ID' })
  findOne(@Param('id') id: string) {
    return this.patientsService.findOne(id);
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
