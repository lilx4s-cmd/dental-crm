import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Res,
} from '@nestjs/common';
import type { Response } from 'express';
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
import { MergeDuplicatesDto } from './dto/merge-duplicates.dto';
import {
  BulkArchiveDto,
  BulkDeleteDto,
  BulkLeadIdsDto,
  BulkNoteDto,
  BulkTagDto,
  BulkTaskDto,
} from './dto/bulk.dto';
import { exportFilename } from './lead-csv';

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

  // Cleanup of deals sharing a number. Super Admin only: merging rewrites who owns what across the
  // whole pipeline, including deals the caller would not otherwise be allowed to see.
  @Get('duplicates')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Deals sharing a phone or WhatsApp number, grouped, worst first' })
  findDuplicates() {
    return this.leadsService.findDuplicateGroups();
  }

  @Post('duplicates/merge')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Fold duplicate deals into one survivor per number. Supports dryRun.' })
  mergeDuplicates(@Body() dto: MergeDuplicatesDto, @CurrentUser() user: JwtPayload) {
    return this.leadsService.mergeDuplicates(dto, user);
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

  /**
   * Bulk actions on a board selection. All declared before ':id'.
   *
   * Grouped under `/bulk` rather than overloaded onto the single-deal routes so the audit registry
   * can label them for what they are — a bulk archive is not a creation, and an export is not an
   * update. Each takes explicit ids and none takes a filter; see BulkLeadIdsDto for why.
   */
  @Post('bulk/archive')
  @Roles(...PIPELINE_ROLES)
  @ApiOperation({ summary: 'Archive or restore many deals at once' })
  bulkArchive(@Body() dto: BulkArchiveDto, @CurrentUser() user: JwtPayload) {
    return this.leadsService.bulkArchive(dto, user);
  }

  // Reception included: writing a note is the least consequential thing anyone can do to a deal,
  // and they take the calls that produce them.
  @Post('bulk/note')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Add the same note to the history of many deals' })
  bulkNote(@Body() dto: BulkNoteDto, @CurrentUser() user: JwtPayload) {
    return this.leadsService.bulkNote(dto, user);
  }

  /**
   * Exports the selection as CSV.
   *
   * POST for a read, deliberately: a selection can be hundreds of ids, which does not survive a
   * query string, and putting patient identifiers in a URL writes them into every access log and
   * proxy cache between here and the browser.
   */
  @Post('bulk/export')
  @Roles(...PIPELINE_ROLES)
  @ApiOperation({ summary: 'Export the selected deals as CSV' })
  async bulkExport(
    @Body() dto: BulkLeadIdsDto,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { csv, count } = await this.leadsService.bulkExport(dto, user);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFilename('deals', new Date())}"`,
      // The count cannot travel in the body — the body is a CSV — so it goes in a header the UI
      // reads to report how many rows it actually got. That is how an id scoped away becomes
      // visible rather than silently missing from a spreadsheet.
      'X-Export-Count': String(count),
      // Personal data. Nothing between here and the browser should keep a copy.
      'Cache-Control': 'no-store',
    });
    return csv;
  }

  // Reception included, matching POST /leads/:id/tasks: setting a reminder is the least
  // consequential thing anyone can do to a deal, and reception takes the call that prompts it.
  @Post('bulk/tasks')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Add the same reminder to many deals at once' })
  bulkTask(@Body() dto: BulkTaskDto, @CurrentUser() user: JwtPayload) {
    return this.leadsService.bulkTask(dto, user);
  }

  // Add or remove tags across a selection. One route for both directions — see BulkTagDto.
  @Post('bulk/tags')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Add tags to, or remove tags from, many deals at once' })
  bulkTag(@Body() dto: BulkTagDto, @CurrentUser() user: JwtPayload) {
    return this.leadsService.bulkTag(dto, user);
  }

  /**
   * Permanent deletion. Super Admin only.
   *
   * DELETE with a body rather than a query string, for the same reason as export. Nest and Express
   * both handle it; HTTP permits it and only leaves the semantics undefined.
   */
  @Delete('bulk')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Permanently delete the selected deals' })
  bulkDelete(@Body() dto: BulkDeleteDto, @CurrentUser() user: JwtPayload) {
    return this.leadsService.bulkDelete(dto, user);
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

  // Tags on one deal. WRITE_ROLES, matching notes and stage moves: labelling a deal is part of
  // working it, and reception takes the call that reveals the label.
  @Post(':id/tags/:tagId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Put a tag on a deal' })
  addTag(@Param('id') id: string, @Param('tagId') tagId: string, @CurrentUser() user: JwtPayload) {
    return this.leadsService.addTag(id, tagId, user);
  }

  @Delete(':id/tags/:tagId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Take a tag off a deal' })
  removeTag(@Param('id') id: string, @Param('tagId') tagId: string, @CurrentUser() user: JwtPayload) {
    return this.leadsService.removeTag(id, tagId, user);
  }

  // Read from LeadTagHistory rather than the join, so removals appear. A tag that came off the day
  // before a deal was lost is the interesting one, and the join cannot show it.
  @Get(':id/tags/history')
  @Roles(...PIPELINE_ROLES)
  @ApiOperation({ summary: 'When each tag went on this deal, and when it came off' })
  getTagHistory(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.leadsService.getTagHistory(id, user);
  }

  @Post(':id/convert')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Convert lead to patient' })
  convert(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.leadsService.convertToPatient(id, user);
  }
}
