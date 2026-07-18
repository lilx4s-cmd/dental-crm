import {
  Body, Controller, Get, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@dental-crm/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '@dental-crm/shared';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { UpdateLeadStageDto } from './dto/update-lead-stage.dto';
import { LeadsQueryDto } from './dto/leads-query.dto';

const PIPELINE_ROLES = [Role.SUPER_ADMIN, Role.CLINIC_MANAGER, Role.SALES_CONSULTANT];
const WRITE_ROLES = [...PIPELINE_ROLES, Role.RECEPTION];

@ApiTags('leads')
@ApiBearerAuth()
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  @Roles(...PIPELINE_ROLES)
  @ApiOperation({ summary: 'List leads with filters and pagination' })
  findAll(@Query() query: LeadsQueryDto) {
    return this.leadsService.findAll(query);
  }

  @Post()
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Create a lead' })
  create(@Body() dto: CreateLeadDto) {
    return this.leadsService.create(dto);
  }

  @Get(':id')
  @Roles(...PIPELINE_ROLES)
  @ApiOperation({ summary: 'Get a lead by ID' })
  findOne(@Param('id') id: string) {
    return this.leadsService.findOne(id);
  }

  @Patch(':id')
  @Roles(...PIPELINE_ROLES)
  @ApiOperation({ summary: 'Update lead fields' })
  update(@Param('id') id: string, @Body() dto: UpdateLeadDto) {
    return this.leadsService.update(id, dto);
  }

  @Patch(':id/stage')
  @Roles(...PIPELINE_ROLES)
  @ApiOperation({ summary: 'Move lead to a new pipeline stage' })
  updateStage(
    @Param('id') id: string,
    @Body() dto: UpdateLeadStageDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.leadsService.updateStage(id, dto, user.sub);
  }

  @Get(':id/activities')
  @Roles(...PIPELINE_ROLES)
  @ApiOperation({ summary: 'Get stage activity history for a lead' })
  getActivities(@Param('id') id: string) {
    return this.leadsService.getActivities(id);
  }

  @Post(':id/convert')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Convert lead to patient' })
  convert(@Param('id') id: string) {
    return this.leadsService.convertToPatient(id);
  }
}
