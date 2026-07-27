import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
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
import { CreateLeadTaskDto, UpdateLeadTaskDto } from './dto/lead-task.dto';
import { ImportLeadsDto } from './dto/import-leads.dto';

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
  findAllByStage(@Query() query: LeadsQueryDto, @CurrentUser() user: JwtPayload) {
    return this.leadsService.findAllByStage(query, user);
  }

  // Today's follow-ups plus the cold deals worth re-approaching. Declared before ':id'.
  @Get('work-list')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Deals due a follow-up today, and dormant deals to recycle' })
  workList(@CurrentUser() user: JwtPayload) {
    return this.leadsService.workList(user);
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
  @Post('transfer/preview')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'List the leads a transfer would move, without moving them' })
  previewTransfer(@Body() dto: TransferLeadsDto, @CurrentUser() user: JwtPayload) {
    return this.leadsService.previewTransfer(dto, user);
  }

  @Post('transfer')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Transfer (reassign) leads between salespeople' })
  transferLeads(@Body() dto: TransferLeadsDto, @CurrentUser() user: JwtPayload) {
    return this.leadsService.transferLeads(dto, user);
  }

  /**
   * Bulk creation from a spreadsheet. Declared before ':id' like the transfer routes above.
   *
   * Above reception's level on purpose: an import writes hundreds of records at once and chooses
   * who owns them, which is a different act from entering the enquiry that just rang.
   */
  @Post('import')
  @Roles(...PIPELINE_ROLES)
  @ApiOperation({ summary: 'Create many leads from a parsed CSV, skipping ones already on file' })
  importLeads(@Body() dto: ImportLeadsDto, @CurrentUser() user: JwtPayload) {
    return this.leadsService.importLeads(dto, user);
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

  // WRITE_ROLES, not PIPELINE_ROLES: Reception already creates and converts leads, so blocking
  // them from moving a card was an inconsistency that surfaced only as a silent drag failure.
  @Patch(':id/stage')
  @Roles(...WRITE_ROLES)
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

  @Get(':id/tasks')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'List tasks on a lead (open first, then completed)' })
  findTasks(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.leadsService.findTasks(id, user);
  }

  @Post(':id/tasks')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Add a task to a lead' })
  createTask(
    @Param('id') id: string,
    @Body() dto: CreateLeadTaskDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.leadsService.createTask(id, dto, user);
  }

  @Patch('tasks/:taskId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Update a task, including completing or reopening it' })
  updateTask(
    @Param('taskId') taskId: string,
    @Body() dto: UpdateLeadTaskDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.leadsService.updateTask(taskId, dto, user);
  }

  @Delete('tasks/:taskId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Delete a task' })
  removeTask(@Param('taskId') taskId: string, @CurrentUser() user: JwtPayload) {
    return this.leadsService.removeTask(taskId, user);
  }

  @Post(':id/convert')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Convert lead to patient' })
  convert(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.leadsService.convertToPatient(id, user);
  }
}
