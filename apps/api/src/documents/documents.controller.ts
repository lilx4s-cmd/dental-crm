import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permission } from '../common/decorators/permission.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role, type JwtPayload } from '@dental-crm/shared';
import {
  PLAN_COORDINATION_ROLES,
  PLAN_STAFF_ROLES,
} from '../treatment-plans/treatment-plans.controller';
import { DocumentsService } from './documents.service';
@Controller('documents')
@Roles(...PLAN_COORDINATION_ROLES)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}
  @Get('context') @Permission('plans.read') context(
    @CurrentUser() user: JwtPayload,
    @Query('patientId') patientId?: string,
    @Query('leadId') leadId?: string,
  ) {
    return this.documents.context(patientId, leadId, user);
  }
  @Get() @Permission('plans.read') list(
    @CurrentUser() user: JwtPayload,
    @Query('patientId') patientId?: string,
    @Query('leadId') leadId?: string,
  ) {
    return this.documents.list(patientId, leadId, user);
  }
  @Get('verify/:token') @Public() verify(@Param('token') token: string) {
    return this.documents.verify(token);
  }
  @Post('items/:id/complete') @Roles(...PLAN_STAFF_ROLES) @Permission('plans.write') complete(
    @Param('id') id: string,
    @Body('completedAt') completedAt: string,
  ) {
    return this.documents.completeItem(id, completedAt);
  }
  @Post('preview') @Permission('plans.read') async preview(
    @Body('patientId') patientId: string,
    @Body('plan') plan: unknown,
    @Body('payment') payment: unknown,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    if (!patientId) throw new BadRequestException('Choose a patient');
    res.type('application/pdf').send(await this.documents.preview(patientId, plan, user, payment));
  }
  @Post('plans') @Permission('plans.write') create(
    @Body('patientId') patientId: string,
    @Body('plan') plan: unknown,
    @Body('payment') payment: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.documents.createPlan(patientId, plan, user.sub, user, payment);
  }
  @Post('plans/:id/invoice')
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER)
  @Permission('finance.write')
  invoice(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.documents.createInvoice(id, user.sub);
  }
  @Post('invoices/:id')
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER)
  @Permission('finance.read')
  invoicePdf(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.documents.invoiceDocument(id, user.sub);
  }
  @Post('warranties/:id') @Roles(...PLAN_STAFF_ROLES) @Permission('plans.write') warranty(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.documents.warrantyDocument(id, user.sub);
  }
  @Post(':id/regenerate') @Permission('plans.write') regenerate(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.documents.regenerate(id, user.sub, user);
  }
  @Post(':id/send') @Permission('conversations.send') send(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.documents.send(id, user);
  }
  @Get(':id/pdf') @Permission('plans.read') async pdf(
    @Param('id') id: string,
    @Res() res: Response,
    @CurrentUser() user: JwtPayload,
  ) {
    const doc = await this.documents.download(id, user);
    res
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${doc.kind.toLowerCase()}-${doc.id}-v${doc.version}.pdf"`,
      })
      .send(doc.pdfData);
  }
}
