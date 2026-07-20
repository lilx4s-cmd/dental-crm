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
import { TransferLeadsDto } from './dto/transfer-leads.dto';
import { ActivityQueryDto } from './dto/activity-query.dto';

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
  findAll(@Query() query: LeadsQueryDto, @CurrentUser() user: JwtPayload) {
    return this.leadsService.findAll(query, user);
  }

  // Must be declared before ':id' so it is not captured by the param route.
  @Get('by-stage')
  @Roles(...PIPELINE_ROLES)
  @ApiOperation({ summary: 'List leads grouped by pipeline stage (kanban board)' })
  findAllByStage(@CurrentUser() user: JwtPayload) {
    return this.leadsService.findAllByStage(user);
  }

  // Sales oversight feed. Declared before ':id'. Service scopes non-admins to
  // their own actions; Super Admin sees everyone (optionally filtered by userId).
  @Get('activity')
  @Roles(...PIPELINE_ROLES)
  @ApiOperation({ summary: 'Sales activity history (stage changes + reassignments)' })
  getActivityFeed(@Query() query: ActivityQueryDto, @CurrentUser() user: JwtPayload) {
    return this.leadsService.getActivityFeed(query, user);
  }

  // Reassign leads between salespeople. Super Admin only — this moves data
  // ownership. Declared before ':id'.
  @Post('transfer')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Transfer (reassign) leads between salespeople' })
  transferLeads(@Body() dto: TransferLeadsDto, @CurrentUser() user: JwtPayload) {
    return this.leadsService.transferLeads(dto, user);
  }

  @Post()
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Create a lead' })
  create(@Body() dto: CreateLeadDto, @CurrentUser() user: JwtPayload) {
    return this.leadsService.create(dto, user);
  }

  @Get(':id')
  @Roles(...PIPELINE_ROLES)
  @ApiOperation({ summary: 'Get a lead by ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.leadsService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(...PIPELINE_ROLES)
  @ApiOperation({ summary: 'Update lead fields' })
  update(@Param('id') id: string, @Body() dto: UpdateLeadDto, @CurrentUser() user: JwtPayload) {
    return this.leadsService.update(id, dto, user);
  }

  @Patch(':id/stage')
  @Roles(...PIPELINE_ROLES)
  @ApiOperation({ summary: 'Move lead to a new pipeline stage' })
  updateStage(
    @Param('id') id: string,
    @Body() dto: UpdateLeadStageDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.leadsService.updateStage(id, dto, user);
  }

  @Get(':id/activities')
  @Roles(...PIPELINE_ROLES)
  @ApiOperation({ summary: 'Get stage activity history for a lead' })
  getActivities(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.leadsService.getActivities(id, user);
  }

  @Post(':id/convert')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Convert lead to patient' })
  convert(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.leadsService.convertToPatient(id, user);
  }
}
