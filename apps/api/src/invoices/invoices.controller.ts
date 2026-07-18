import { Controller, Get, Post, Patch, Param, Body, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role, JwtPayload } from '@dental-crm/shared';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  findAll(@Query('patientId') patientId?: string, @Query('status') status?: string) {
    return this.invoicesService.findAll(patientId, status);
  }

  @Get('summary')
  getSummary() {
    return this.invoicesService.getFinanceSummary();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.invoicesService.findOne(id);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER, Role.RECEPTION)
  create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: JwtPayload) {
    return this.invoicesService.create(dto, user.sub);
  }

  @Patch(':id/status')
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER, Role.RECEPTION)
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.invoicesService.updateStatus(id, status as any);
  }

  @Post(':id/payments')
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER, Role.RECEPTION)
  recordPayment(
    @Param('id') id: string,
    @Body() dto: RecordPaymentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.invoicesService.recordPayment(id, dto, user.sub);
  }
}
