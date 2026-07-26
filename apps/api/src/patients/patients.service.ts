import { Injectable, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { UpdateCaseEconomicsDto } from './dto/case-economics.dto';
import { computeCaseEconomics } from '@dental-crm/shared';
import { PatientsQueryDto } from './dto/patients-query.dto';

const PATIENT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  whatsappNumber: true,
  dateOfBirth: true,
  gender: true,
  address: true,
  city: true,
  country: true,
  nationalId: true,
  notes: true,
  allergies: true,
  diagnosis: true,
  insuranceInfo: true,
  isActive: true,
  convertedFromLeadId: true,
  createdAt: true,
  updatedAt: true,
  tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
} as const;

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: PatientsQueryDto) {
    const { page, limit, search, tagId } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.PatientWhereInput = { isActive: true };

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    if (tagId) {
      where.tags = { some: { tagId } };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.patient.findMany({ where, select: PATIENT_SELECT, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.patient.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id }, select: PATIENT_SELECT });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  async create(dto: CreatePatientDto) {
    return this.prisma.patient.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        whatsappNumber: dto.whatsappNumber,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        gender: dto.gender as $Enums.Gender | undefined,
        address: dto.address,
        city: dto.city,
        country: dto.country,
        nationalId: dto.nationalId,
        notes: dto.notes,
        allergies: dto.allergies,
        diagnosis: dto.diagnosis,
        insuranceInfo: dto.insuranceInfo,
      },
      select: PATIENT_SELECT,
    });
  }

  async update(id: string, dto: UpdatePatientDto) {
    await this.findOne(id);
    return this.prisma.patient.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        whatsappNumber: dto.whatsappNumber,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        gender: dto.gender as $Enums.Gender | undefined,
        address: dto.address,
        city: dto.city,
        country: dto.country,
        nationalId: dto.nationalId,
        notes: dto.notes,
        allergies: dto.allergies,
        diagnosis: dto.diagnosis,
        insuranceInfo: dto.insuranceInfo,
      },
      select: PATIENT_SELECT,
    });
  }

  /**
   * The case file: what was quoted, what was paid, what it cost and what is left.
   *
   * Price and paid are read from the invoices and payments that already exist rather than stored
   * again — one answer to "how much has this patient paid", not two that can disagree. Appointments
   * come along because "when are they in" is the other half of planning a case.
   */
  async caseFile(id: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      select: {
        id: true,
        caseNumber: true,
        firstName: true,
        lastName: true,
        aftercareStartedAt: true,
        serviceCost: true,
        salesCommission: true,
        commissionUser: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    const [invoices, appointments] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { patientId: id, status: { not: 'CANCELLED' } },
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          currency: true,
          status: true,
          issuedAt: true,
          // Only settled money counts as paid — a pending authorisation is not in the bank.
          payments: { where: { status: 'COMPLETED' }, select: { amount: true, paidAt: true } },
        },
      }),
      this.prisma.appointment.findMany({
        where: { patientId: id },
        select: {
          id: true,
          startTime: true,
          endTime: true,
          type: true,
          status: true,
          dentist: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { startTime: 'asc' },
      }),
    ]);

    const economics = computeCaseEconomics({
      invoiceTotals: invoices.map((i) => Number(i.total)),
      completedPayments: invoices.flatMap((i) => i.payments.map((p) => Number(p.amount))),
      serviceCost: patient.serviceCost == null ? null : Number(patient.serviceCost),
      salesCommission: patient.salesCommission == null ? null : Number(patient.salesCommission),
    });

    return {
      patient,
      economics,
      currency: invoices[0]?.currency ?? 'USD',
      invoices: invoices.map(({ payments, ...i }) => ({
        ...i,
        paid: payments.reduce((s, p) => s + Number(p.amount), 0),
      })),
      appointments,
    };
  }

  async updateCaseEconomics(id: string, dto: UpdateCaseEconomicsDto) {
    await this.findOne(id);
    await this.prisma.patient.update({
      where: { id },
      data: {
        serviceCost: dto.serviceCost,
        salesCommission: dto.salesCommission,
        // Empty string means "nobody", which a foreign key cannot hold.
        commissionUserId: dto.commissionUserId === '' ? null : dto.commissionUserId,
      },
    });
    return this.caseFile(id);
  }

  async deactivate(id: string) {
    await this.findOne(id);
    await this.prisma.patient.update({ where: { id }, data: { isActive: false } });
  }

  async addTag(patientId: string, tagId: string) {
    await this.findOne(patientId);
    await this.prisma.patientTag.upsert({
      where: { patientId_tagId: { patientId, tagId } },
      create: { patientId, tagId },
      update: {},
    });
    return this.findOne(patientId);
  }

  async removeTag(patientId: string, tagId: string) {
    await this.findOne(patientId);
    await this.prisma.patientTag.deleteMany({ where: { patientId, tagId } });
    return this.findOne(patientId);
  }
}
