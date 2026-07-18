import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

const APPOINTMENT_SELECT = {
  id: true,
  type: true,
  status: true,
  startTime: true,
  endTime: true,
  notes: true,
  cancelReason: true,
  createdAt: true,
  updatedAt: true,
  patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
  dentist: { select: { id: true, firstName: true, lastName: true, calendarColor: true } },
  resource: { select: { id: true, name: true, type: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} as const;

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(from?: string, to?: string, dentistId?: string, patientId?: string) {
    const where: Prisma.AppointmentWhereInput = {};
    if (from || to) {
      where.startTime = {};
      if (from) where.startTime.gte = new Date(from);
      if (to) where.startTime.lte = new Date(to);
    }
    if (dentistId) where.dentistId = dentistId;
    if (patientId) where.patientId = patientId;

    return this.prisma.appointment.findMany({
      where,
      select: APPOINTMENT_SELECT,
      orderBy: { startTime: 'asc' },
    });
  }

  async findOne(id: string) {
    const appt = await this.prisma.appointment.findUnique({ where: { id }, select: APPOINTMENT_SELECT });
    if (!appt) throw new NotFoundException('Appointment not found');
    return appt;
  }

  async create(dto: CreateAppointmentDto, createdById: string) {
    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);
    if (end <= start) throw new BadRequestException('End time must be after start time');

    return this.prisma.appointment.create({
      data: {
        patientId: dto.patientId,
        dentistId: dto.dentistId,
        resourceId: dto.resourceId,
        createdById,
        type: dto.type as $Enums.AppointmentType,
        status: $Enums.AppointmentStatus.SCHEDULED,
        startTime: start,
        endTime: end,
        notes: dto.notes,
      },
      select: APPOINTMENT_SELECT,
    });
  }

  async update(id: string, dto: UpdateAppointmentDto) {
    await this.findOne(id);
    const data: Prisma.AppointmentUpdateInput = {};
    if (dto.dentistId !== undefined) data.dentist = { connect: { id: dto.dentistId } };
    if (dto.resourceId !== undefined) data.resource = { connect: { id: dto.resourceId } };
    if (dto.startTime) data.startTime = new Date(dto.startTime);
    if (dto.endTime) data.endTime = new Date(dto.endTime);
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.cancelReason !== undefined) data.cancelReason = dto.cancelReason;
    if (dto.status) data.status = dto.status as $Enums.AppointmentStatus;

    return this.prisma.appointment.update({ where: { id }, data, select: APPOINTMENT_SELECT });
  }

  async findTodayCount() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return this.prisma.appointment.count({
      where: {
        startTime: { gte: start, lte: end },
        status: { not: $Enums.AppointmentStatus.CANCELLED },
      },
    });
  }
}
