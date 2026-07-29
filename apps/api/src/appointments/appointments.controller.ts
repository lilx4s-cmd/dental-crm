import { Controller, Get, Post, Patch, Param, Body, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { APPOINTMENT_WRITE, SCHEDULING } from '../common/access-policy';
import { Role } from '@dental-crm/shared';
import { JwtPayload } from '@dental-crm/shared';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  @Roles(...SCHEDULING)
  findAll(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('dentistId') dentistId?: string,
    @Query('patientId') patientId?: string,
  ) {
    return this.appointmentsService.findAll(from, to, dentistId, patientId);
  }

  @Get(':id')
  @Roles(...SCHEDULING)
  findOne(@Param('id') id: string) {
    return this.appointmentsService.findOne(id);
  }

  @Post()
  @Roles(...APPOINTMENT_WRITE)
  create(@Body() dto: CreateAppointmentDto, @CurrentUser() user: JwtPayload) {
    return this.appointmentsService.create(dto, user.sub);
  }

  @Patch(':id')
  @Roles(...APPOINTMENT_WRITE)
  update(@Param('id') id: string, @Body() dto: UpdateAppointmentDto) {
    return this.appointmentsService.update(id, dto);
  }
}
