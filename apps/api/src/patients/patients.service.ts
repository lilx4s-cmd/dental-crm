import { Injectable, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { UpdateCaseEconomicsDto } from './dto/case-economics.dto';
import {
  computeCaseEconomics,
  patientGuidance,
  patientMonth,
  type PatientTreatmentStatus,
} from '@dental-crm/shared';
import { PatientsQueryDto } from './dto/patients-query.dto';
import {
  patientBaseWhere,
  patientListWhere,
  reservationWhere,
  reservationRange,
  reservationBookingWhere,
  UPCOMING_APPOINTMENTS,
} from './patient-filters';

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
  // The medical history carried over from the enquiry form. Listed explicitly because
  // PATIENT_SELECT is a whitelist: a column missing from it is a column the record never shows,
  // which is how the questionnaire came to be collected and never read.
  medications: true,
  medicalConditions: true,
  previousSurgeries: true,
  isSmoker: true,
  drinksAlcohol: true,
  isPregnant: true,
  takesBloodThinners: true,
  heightCm: true,
  weightKg: true,
  nationality: true,
  diagnosis: true,
  insuranceInfo: true,
  isActive: true,
  treatmentStatus: true,
  treatmentFinishedAt: true,
  convertedFromLead: {
    select: { assignedTo: { select: { id: true, firstName: true, lastName: true } } },
  },
  convertedFromLeadId: true,
  createdAt: true,
  updatedAt: true,
  tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
} as const;

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: PatientsQueryDto) {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;
    const now = new Date();
    const where = patientListWhere(query, now);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.patient.findMany({
        where,
        select: {
          ...PATIENT_SELECT,
          appointments: {
            where: {
              startTime: reservationRange(now, query.month, query.dueDays),
              status: { in: [...UPCOMING_APPOINTMENTS] },
            },
            select: { id: true, startTime: true, endTime: true, type: true },
            orderBy: { startTime: 'asc' },
            take: 3,
          },
          travelBookings: {
            where: reservationBookingWhere(now, query.month, query.dueDays),
            select: { id: true, visit: true, status: true, arrivalAt: true, departureAt: true },
            orderBy: { arrivalAt: 'asc' },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.patient.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async summary(query: PatientsQueryDto, now = new Date()) {
    const base = patientBaseWhere(query);
    const common: Prisma.PatientWhereInput =
      query.month || query.dueDays
        ? { AND: [base, reservationWhere(now, query.month, query.dueDays)] }
        : base;
    const [working, finished, total, reservations, staffOptions, reservationCount] =
      await Promise.all([
        this.prisma.patient.count({ where: { AND: [common, { treatmentStatus: 'WORKING' }] } }),
        this.prisma.patient.count({ where: { AND: [common, { treatmentStatus: 'FINISHED' }] } }),
        this.prisma.patient.count({ where: common }),
        this.prisma.patient.findMany({
          where: { AND: [base, reservationWhere(now, undefined, query.dueDays)] },
          select: {
            id: true,
            travelBookings: {
              where: reservationBookingWhere(now, undefined, query.dueDays),
              select: { arrivalAt: true, departureAt: true },
            },
            appointments: {
              where: {
                status: { in: [...UPCOMING_APPOINTMENTS] },
                startTime: reservationRange(now, undefined, query.dueDays),
              },
              select: { startTime: true },
            },
          },
        }),
        this.prisma.user.findMany({
          where: { isActive: true },
          select: { id: true, firstName: true, lastName: true },
          orderBy: { firstName: 'asc' },
        }),
        this.prisma.patient.count({
          where: { AND: [common, reservationWhere(now, query.month, query.dueDays)] },
        }),
      ]);
    const months = new Map<string, Set<string>>();
    for (const patient of reservations) {
      for (const at of [
        ...patient.travelBookings.flatMap((b) => [b.arrivalAt, b.departureAt]),
        ...patient.appointments.map((a) => a.startTime),
      ]) {
        if (
          !at ||
          at < now ||
          (query.dueDays && at >= new Date(now.getTime() + query.dueDays * 86400000))
        )
          continue;
        const month = patientMonth(at);
        if (!months.has(month)) months.set(month, new Set());
        months.get(month)!.add(patient.id);
      }
    }
    return {
      working,
      finished,
      total,
      reservations: reservationCount,
      months: [...months]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, patients]) => ({ month, count: patients.size })),
      staffOptions,
      timezone: 'Europe/Istanbul',
    };
  }

  async treatmentStatus(id: string, status: PatientTreatmentStatus) {
    const previous = await this.findOne(id);
    return this.prisma.patient.update({
      where: { id },
      data: {
        treatmentStatus: status,
        treatmentFinishedAt:
          status === 'FINISHED' ? (previous.treatmentFinishedAt ?? new Date()) : null,
      },
      select: PATIENT_SELECT,
    });
  }

  async findOne(id: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id }, select: PATIENT_SELECT });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  /**
   * What to do next with this patient, and what is missing from the record.
   *
   * The rules live in `@dental-crm/shared` and are pure — this method only gathers the counts they
   * need. That split is deliberate: the ordering of "ask about blood thinners" against "raise an
   * invoice" is a clinical judgement that should be readable and testable without a database in
   * front of it.
   *
   * Counted rather than fetched. The checklist needs to know *whether* there is an approved plan,
   * not what is in it, and pulling every plan, appointment and invoice to answer nine yes/no
   * questions would make opening a patient record slower than the record is worth.
   */
  async guidance(id: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      select: {
        firstName: true,
        lastName: true,
        phone: true,
        whatsappNumber: true,
        email: true,
        dateOfBirth: true,
        country: true,
        allergies: true,
        medications: true,
        medicalConditions: true,
        takesBloodThinners: true,
        isPregnant: true,
        diagnosis: true,
        aftercareStartedAt: true,
      },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    const now = new Date();

    const [
      treatmentPlanCount,
      approvedPlanCount,
      upcomingAppointmentCount,
      pastAppointmentCount,
      invoiceCount,
      unpaidCount,
      passportCount,
      warrantyCount,
    ] = await this.prisma.$transaction([
      this.prisma.treatmentPlan.count({ where: { patientId: id } }),
      this.prisma.treatmentPlan.count({
        where: { patientId: id, approvalStatus: $Enums.PatientApprovalStatus.APPROVED },
      }),
      this.prisma.appointment.count({
        where: {
          patientId: id,
          startTime: { gte: now },
          status: { in: [$Enums.AppointmentStatus.SCHEDULED, $Enums.AppointmentStatus.CONFIRMED] },
        },
      }),
      // What actually happened, not merely what was booked and then cancelled — the warranty and
      // aftercare steps hang off this, and neither is due because somebody no-showed.
      this.prisma.appointment.count({
        where: { patientId: id, status: $Enums.AppointmentStatus.COMPLETED },
      }),
      this.prisma.invoice.count({ where: { patientId: id } }),
      this.prisma.invoice.count({
        where: {
          patientId: id,
          status: { notIn: [$Enums.InvoiceStatus.PAID, $Enums.InvoiceStatus.CANCELLED] },
        },
      }),
      // Files are polymorphic; a passport on a patient record is what this asks about. One taken
      // on the deal before conversion is a different row and is not counted — which is honest,
      // since it is also not where a clinician would look for it.
      this.prisma.file.count({
        where: {
          ownerType: $Enums.AttachableType.PATIENT,
          ownerId: id,
          category: $Enums.FileCategory.PASSPORT,
        },
      }),
      // A warranty hangs off a treatment plan *item*, not the plan — one is issued per crown, not
      // per proposal. So the patient is two relations away.
      this.prisma.warranty.count({
        where: { treatmentPlanItem: { treatmentPlan: { patientId: id } } },
      }),
    ]);

    return patientGuidance({
      ...patient,
      treatmentPlanCount,
      approvedPlanCount,
      upcomingAppointmentCount,
      pastAppointmentCount,
      invoiceCount,
      // Vacuously true with no invoices, which is why the checklist asks whether one exists first.
      fullyPaid: invoiceCount > 0 && unpaidCount === 0,
      hasPassportOnFile: passportCount > 0,
      warrantyCount,
    });
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
        // The medical history. Only `allergies` was writable before, so four of the five questions
        // the patient checklist asks could not be answered anywhere in the app — a nag with no
        // path to clearing it.
        allergies: dto.allergies,
        medications: dto.medications,
        medicalConditions: dto.medicalConditions,
        previousSurgeries: dto.previousSurgeries,
        takesBloodThinners: dto.takesBloodThinners,
        isPregnant: dto.isPregnant,
        isSmoker: dto.isSmoker,
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
        medications: dto.medications,
        medicalConditions: dto.medicalConditions,
        previousSurgeries: dto.previousSurgeries,
        takesBloodThinners: dto.takesBloodThinners,
        isPregnant: dto.isPregnant,
        isSmoker: dto.isSmoker,
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
