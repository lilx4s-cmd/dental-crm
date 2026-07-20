import { Controller, Get, Post, Delete, Patch, Param, Body, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role, JwtPayload } from '@dental-crm/shared';
import { TreatmentPlansService } from './treatment-plans.service';
import { PdfService } from '../pdf/pdf.service';
import { SettingsService } from '../settings/settings.service';
import { CreateTreatmentPlanDto } from './dto/create-treatment-plan.dto';
import { UpdateTreatmentPlanDto } from './dto/update-treatment-plan.dto';
import { AddCommentDto } from './dto/add-comment.dto';
import { UpdateTimelineStepDto } from './dto/update-timeline-step.dto';

// Named role groups mirror leads.controller.ts's PIPELINE_ROLES convention.
// STAFF = clinical authorship (dentists own the plan); COORDINATION adds the sales
// consultant who acts as the treatment coordinator (per the confirmed decision to
// reuse SALES_CONSULTANT rather than introduce a new Role enum value).
export const PLAN_STAFF_ROLES = [Role.SUPER_ADMIN, Role.CLINIC_MANAGER, Role.DENTIST];
export const PLAN_COORDINATION_ROLES = [...PLAN_STAFF_ROLES, Role.SALES_CONSULTANT];

@Controller('treatment-plans')
export class TreatmentPlansController {
  constructor(
    private readonly service: TreatmentPlansService,
    private readonly pdfService: PdfService,
    private readonly settingsService: SettingsService,
    private readonly config: ConfigService,
  ) {}

  // First configured CORS origin doubles as the canonical web app base URL for building
  // portal share links — there's no dedicated FRONTEND_URL env var in this project.
  private webBaseUrl(): string {
    const origins = this.config.get<string[]>('cors.origin') ?? ['http://localhost:3000'];
    return origins[0];
  }

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
  @Roles(...PLAN_COORDINATION_ROLES)
  create(@Body() dto: CreateTreatmentPlanDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(dto, user.sub);
  }

  @Post('categories')
  @Roles(...PLAN_STAFF_ROLES)
  createCategory(@Body('name') name: string, @Body('description') description?: string) {
    return this.service.createCategory(name, description);
  }

  @Patch(':id')
  @Roles(...PLAN_COORDINATION_ROLES)
  update(@Param('id') id: string, @Body() dto: UpdateTreatmentPlanDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/comments')
  @Roles(...PLAN_COORDINATION_ROLES)
  addComment(@Param('id') id: string, @Body() dto: AddCommentDto, @CurrentUser() user: JwtPayload) {
    return this.service.addComment(id, dto.body, user.sub);
  }

  @Patch(':id/timeline-steps/:stepId')
  @Roles(...PLAN_COORDINATION_ROLES)
  updateTimelineStep(
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @Body() dto: UpdateTimelineStepDto,
  ) {
    return this.service.updateTimelineStep(id, stepId, dto);
  }

  @Get(':id/pdf')
  @Roles(...PLAN_COORDINATION_ROLES)
  async downloadPdf(
    @Param('id') id: string,
    @Res() res: Response,
    @Query('portalToken') portalToken?: string,
  ) {
    const plan = await this.service.findOne(id);
    const clinicSettings = await this.settingsService.get();
    // The raw share-link token is never persisted (only its sha256 hash is), so the backend
    // has no way to recover a working portal URL on its own. The frontend passes the raw
    // token it received from POST :id/share-link (only available in-memory, right after
    // creation) as ?portalToken=. If it's absent (link never created this session, or
    // already navigated away), we simply omit the QR code rather than embedding a broken
    // link — see pdf.service.ts's buildQrDataUrl, which already handles undefined portalUrl.
    const portalUrl = portalToken ? `${this.webBaseUrl()}/portal/${portalToken}` : undefined;

    const buffer = await this.pdfService.generateTreatmentPlanPdf(
      plan,
      {
        clinicName: clinicSettings?.clinicName ?? 'Dental Clinic',
        address: clinicSettings?.address,
        city: clinicSettings?.city,
        country: clinicSettings?.country,
      },
      portalUrl,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="treatment-plan-${id}.pdf"`,
    });
    res.send(buffer);
  }

  @Post(':id/share-link')
  @Roles(...PLAN_COORDINATION_ROLES)
  createShareLink(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.createShareLink(id, user.sub);
  }

  @Delete(':id/share-link')
  @Roles(...PLAN_COORDINATION_ROLES)
  revokeShareLink(@Param('id') id: string) {
    return this.service.revokeShareLink(id);
  }
}
