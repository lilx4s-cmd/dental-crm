import { Injectable, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { computePlanTotal } from '@dental-crm/shared';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTreatmentPlanDto, UpdateItineraryDto } from './dto/create-treatment-plan.dto';
import { UpdateTreatmentPlanDto } from './dto/update-treatment-plan.dto';

// Declared outside PLAN_SELECT: the `as const` there would make this a readonly tuple, which
// Prisma's orderBy input does not accept.
const SCHEDULE_ORDER: Prisma.TreatmentPlanScheduleItemOrderByWithRelationInput[] = [
  { date: 'asc' },
  { createdAt: 'asc' },
];

/** Optional ISO date from a DTO to a Date, keeping "not provided" distinct from "invalid". */
const toDate = (value?: string) => (value ? new Date(value) : undefined);

const PLAN_SELECT = {
  id: true,
  title: true,
  status: true,
  totalCost: true,
  currency: true,
  notes: true,
  approvalStatus: true,
  approvedAt: true,
  rejectionReason: true,
  doctorRecommendation: true,
  diagnosisSnapshot: true,
  aiSummary: true,
  // What the price covers, and how it is paid. Listed explicitly because PLAN_SELECT is a
  // whitelist: a column missing from it is a column the dossier silently prints nothing for.
  packageIncludes: true,
  depositAmount: true,
  cardFeePercent: true,
  cashDiscountPercent: true,
  flightRefundNote: true,
  paymentTerms: true,
  language: true,
  assignedDentistId: true,
  assignedCoordinatorId: true,
  createdAt: true,
  updatedAt: true,
  patient: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      gender: true,
      email: true,
      phone: true,
      dateOfBirth: true,
      city: true,
      country: true,
      // Read live rather than snapshotted alongside diagnosisSnapshot: a treatment plan is a
      // point-in-time quote, but an allergy list printed on a clinical document must never be
      // stale. If it changes, every document reprinted from here should reflect that immediately.
      allergies: true,
    },
  },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  assignedDentist: { select: { id: true, firstName: true, lastName: true, specialization: true } },
  assignedCoordinator: { select: { id: true, firstName: true, lastName: true } },
  items: {
    select: {
      id: true,
      description: true,
      toothNumber: true,
      quantity: true,
      cost: true,
      unitPrice: true,
      discount: true,
      material: true,
      brand: true,
      clinicalNotes: true,
      status: true,
      phaseNumber: true,
      toothCondition: true,
      treatmentCategory: { select: { id: true, name: true } },
    },
  },
  diagnoses: {
    select: { id: true, condition: true, toothNumbers: true, notes: true },
    orderBy: { createdAt: 'asc' as const },
  },
  phases: {
    select: {
      id: true,
      phaseNumber: true,
      name: true,
      discountAmount: true,
      discountPercent: true,
      healingPeriodMonths: true,
    },
    orderBy: { phaseNumber: 'asc' as const },
  },
  stay: {
    select: {
      id: true,
      arrivalDate: true,
      arrivalFlight: true,
      departureDate: true,
      departureFlight: true,
      hotelName: true,
      hotelAddress: true,
      roomType: true,
      nights: true,
      companions: true,
      checkInDate: true,
      checkOutDate: true,
      airportTransfer: true,
      clinicTransfer: true,
      notes: true,
    },
  },
  scheduleItems: {
    select: { id: true, date: true, time: true, title: true, location: true, notes: true },
    // Time is free text ("Morning", "09:30") so it cannot be sorted on in SQL; date orders the
    // days and the entry order within a day is whatever the coordinator typed.
    orderBy: SCHEDULE_ORDER,
  },
  timelineSteps: {
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      order: true,
      dueDate: true,
      completedAt: true,
    },
    orderBy: { order: 'asc' as const },
  },
  comments: {
    select: {
      id: true,
      authorType: true,
      authorName: true,
      body: true,
      createdAt: true,
      authorUser: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

// Sensible default milestones seeded onto every new plan. Staff can edit/reorder
// afterward; the patient portal renders these as a progress tracker.
const DEFAULT_TIMELINE_STEPS = [
  { title: 'Treatment plan proposed', order: 1 },
  { title: 'Patient approval', order: 2 },
  { title: 'Treatment in progress', order: 3 },
  { title: 'Treatment completed', order: 4 },
];

@Injectable()
export class TreatmentPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async findByPatient(patientId: string) {
    return this.prisma.treatmentPlan.findMany({
      where: { patientId },
      select: PLAN_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const plan = await this.prisma.treatmentPlan.findUnique({ where: { id }, select: PLAN_SELECT });
    if (!plan) throw new NotFoundException('Treatment plan not found');
    return plan;
  }

  async create(dto: CreateTreatmentPlanDto, createdById: string) {
    // `cost` is already the authoritative per-line total (unitPrice*qty - discount, computed
    // client-side), so phase subtotals are sums of line costs — not re-derived from
    // unitPrice/quantity, which would double-apply the line discount. Phase-level discounts come
    // off on top, via the shared pricing helper the builder and the PDF also use.
    const itemsTotal = computePlanTotal(dto.items ?? [], dto.phases ?? []);

    // Snapshot the patient's current diagnosis so the patient-facing presentation stays stable
    // even if the live diagnosis is edited later.
    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
      select: { diagnosis: true },
    });

    // The clinic's standing terms, copied onto the plan at the moment it is created.
    //
    // Copied rather than referenced: a proposal sent in March has to keep saying what was promised
    // in March after the clinic changes its card fee in June. And filled in here rather than left
    // to the coordinator, because retyping the same package and the same terms into every proposal
    // is exactly the twenty minutes this is meant to remove — and is how two patients end up
    // holding two different sets of terms.
    const settings = await this.prisma.clinicSettings.findUnique({
      where: { id: 'singleton' },
      select: {
        defaultPackageIncludes: true,
        defaultCardFeePercent: true,
        defaultCashDiscountPercent: true,
        defaultDepositPercent: true,
        defaultPaymentTerms: true,
      },
    });

    // A deposit is configured as a percentage but quoted as an amount: "€500 to reserve your
    // dates" is answerable, "20%" is a sum the patient has to work out themselves.
    const depositFromPercent =
      settings?.defaultDepositPercent != null
        ? Math.round(itemsTotal * (Number(settings.defaultDepositPercent) / 100) * 100) / 100
        : undefined;

    return this.prisma.treatmentPlan.create({
      data: {
        patientId: dto.patientId,
        createdById,
        title: dto.title,
        notes: dto.notes,
        currency: dto.currency ?? 'USD',
        totalCost: itemsTotal,
        assignedDentistId: dto.assignedDentistId,
        assignedCoordinatorId: dto.assignedCoordinatorId,
        doctorRecommendation: dto.doctorRecommendation,
        diagnosisSnapshot: patient?.diagnosis ?? null,
        // `??` throughout, not `||`: an explicit empty package or a deliberate 0% card fee is a
        // decision, and falling back to the clinic default there would overrule the coordinator.
        packageIncludes: dto.packageIncludes ?? settings?.defaultPackageIncludes ?? [],
        depositAmount: dto.depositAmount ?? depositFromPercent,
        cardFeePercent: dto.cardFeePercent ?? settings?.defaultCardFeePercent ?? undefined,
        cashDiscountPercent: dto.cashDiscountPercent ?? settings?.defaultCashDiscountPercent ?? undefined,
        flightRefundNote: dto.flightRefundNote,
        paymentTerms: dto.paymentTerms ?? settings?.defaultPaymentTerms ?? undefined,
        language: dto.language ?? 'en',
        items: dto.items?.length
          ? {
              create: dto.items.map((item) => ({
                treatmentCategoryId: item.treatmentCategoryId,
                toothNumber: item.toothNumber,
                description: item.description,
                quantity: item.quantity,
                cost: item.cost,
                unitPrice: item.unitPrice,
                discount: item.discount ?? 0,
                material: item.material,
                brand: item.brand,
                clinicalNotes: item.clinicalNotes,
                phaseNumber: item.phaseNumber ?? 1,
                toothCondition: item.toothCondition,
              })),
            }
          : undefined,
        diagnoses: dto.diagnoses?.length
          ? {
              create: dto.diagnoses.map((d) => ({
                condition: d.condition,
                toothNumbers: d.toothNumbers,
                notes: d.notes,
              })),
            }
          : undefined,
        phases: dto.phases?.length
          ? {
              create: dto.phases.map((p) => ({
                phaseNumber: p.phaseNumber,
                name: p.name,
                discountAmount: p.discountAmount ?? 0,
                discountPercent: p.discountPercent,
                healingPeriodMonths: p.healingPeriodMonths,
              })),
            }
          : undefined,
        stay: dto.stay
          ? {
              create: {
                ...dto.stay,
                arrivalDate: toDate(dto.stay.arrivalDate),
                departureDate: toDate(dto.stay.departureDate),
                checkInDate: toDate(dto.stay.checkInDate),
                checkOutDate: toDate(dto.stay.checkOutDate),
              },
            }
          : undefined,
        scheduleItems: dto.scheduleItems?.length
          ? {
              create: dto.scheduleItems.map((s) => ({
                date: new Date(s.date),
                time: s.time,
                title: s.title,
                location: s.location,
                notes: s.notes,
              })),
            }
          : undefined,
        timelineSteps: { create: DEFAULT_TIMELINE_STEPS },
      },
      select: PLAN_SELECT,
    });
  }

  /**
   * Replaces the plan's travel and itinerary in one transaction.
   *
   * Schedule entries are deleted and recreated rather than diffed: they carry no identity anyone
   * refers to elsewhere, and a diff would let a half-applied edit leave the printed itinerary
   * disagreeing with the one on screen. The stay is upserted so a coordinator can fill it in
   * progressively — hotel first, flight number a week later — which is the normal case.
   */
  async updateItinerary(id: string, dto: UpdateItineraryDto) {
    await this.findOne(id);

    const stayData = dto.stay
      ? {
          ...dto.stay,
          arrivalDate: toDate(dto.stay.arrivalDate),
          departureDate: toDate(dto.stay.departureDate),
          checkInDate: toDate(dto.stay.checkInDate),
          checkOutDate: toDate(dto.stay.checkOutDate),
        }
      : null;

    await this.prisma.$transaction([
      ...(stayData
        ? [
            this.prisma.treatmentPlanStay.upsert({
              where: { treatmentPlanId: id },
              create: { treatmentPlanId: id, ...stayData },
              update: stayData,
            }),
          ]
        : // An explicitly empty stay clears it, so a trip that falls through does not keep
          // printing a hotel the patient never went to.
          [this.prisma.treatmentPlanStay.deleteMany({ where: { treatmentPlanId: id } })]),
      this.prisma.treatmentPlanScheduleItem.deleteMany({ where: { treatmentPlanId: id } }),
      ...(dto.scheduleItems?.length
        ? [
            this.prisma.treatmentPlanScheduleItem.createMany({
              data: dto.scheduleItems.map((s) => ({
                treatmentPlanId: id,
                date: new Date(s.date),
                time: s.time,
                title: s.title,
                location: s.location,
                notes: s.notes,
              })),
            }),
          ]
        : []),
    ]);

    return this.findOne(id);
  }

  async update(id: string, dto: UpdateTreatmentPlanDto) {
    await this.findOne(id);

    // When a patient/staff approval decision comes through, keep approvedAt in sync so the
    // portal + dashboard can show when it happened. Clear the stamp if it swings back to PENDING.
    const approvalPatch =
      dto.approvalStatus === 'APPROVED'
        ? { approvedAt: new Date() }
        : dto.approvalStatus && dto.approvalStatus !== 'APPROVED'
          ? { approvedAt: null }
          : {};

    // Empty-string assignment id means "unassign" → store null (a real FK can't be ''), while
    // undefined means "leave unchanged". `?? undefined` keeps unrelated PATCHes from touching FKs.
    const unassignable = (v: string | undefined) => (v === '' ? null : (v ?? undefined));

    return this.prisma.treatmentPlan.update({
      where: { id },
      data: {
        status: dto.status as $Enums.TreatmentStatus | undefined,
        approvalStatus: dto.approvalStatus as $Enums.PatientApprovalStatus | undefined,
        rejectionReason: dto.rejectionReason,
        assignedDentistId: unassignable(dto.assignedDentistId),
        assignedCoordinatorId: unassignable(dto.assignedCoordinatorId),
        doctorRecommendation: dto.doctorRecommendation,
        title: dto.title,
        notes: dto.notes,
        // Undefined leaves each alone, so saving the package step cannot blank the payment terms
        // somebody set a moment earlier from a different part of the editor.
        packageIncludes: dto.packageIncludes,
        depositAmount: dto.depositAmount,
        cardFeePercent: dto.cardFeePercent,
        cashDiscountPercent: dto.cashDiscountPercent,
        flightRefundNote: dto.flightRefundNote,
        paymentTerms: dto.paymentTerms,
        language: dto.language,
        ...approvalPatch,
      },
      select: PLAN_SELECT,
    });
  }

  // Staff-authored comment. Patient comments arrive through the public portal with
  // authorType PATIENT; this is the STAFF side of the same thread.
  async addComment(planId: string, body: string, authorUserId: string) {
    await this.findOne(planId);
    await this.prisma.treatmentPlanComment.create({
      data: { treatmentPlanId: planId, authorType: 'STAFF', authorUserId, body },
    });
    return this.findOne(planId);
  }

  // Advance/reset a milestone. Completing a step stamps completedAt; moving it away from
  // COMPLETED clears the stamp so the portal progress tracker stays truthful.
  async updateTimelineStep(
    planId: string,
    stepId: string,
    data: { status?: string; title?: string; description?: string },
  ) {
    const step = await this.prisma.treatmentTimelineStep.findFirst({
      where: { id: stepId, treatmentPlanId: planId },
    });
    if (!step) throw new NotFoundException('Timeline step not found');

    const completedPatch =
      data.status === 'COMPLETED'
        ? { completedAt: new Date() }
        : data.status && data.status !== 'COMPLETED'
          ? { completedAt: null }
          : {};

    await this.prisma.treatmentTimelineStep.update({
      where: { id: stepId },
      data: {
        status: data.status as $Enums.TimelineStepStatus | undefined,
        title: data.title,
        description: data.description,
        ...completedPatch,
      },
    });
    return this.findOne(planId);
  }

  async findCategories() {
    return this.prisma.treatmentCategory.findMany({ orderBy: { name: 'asc' } });
  }

  async createCategory(name: string, description?: string) {
    return this.prisma.treatmentCategory.create({ data: { name, description } });
  }

  // Finds any share link for this plan that is neither revoked nor expired — used to build
  // the QR portal URL embedded in the staff-facing PDF export.
  async findActiveShareLink(planId: string) {
    return this.prisma.treatmentPlanShareLink.findFirst({
      where: {
        treatmentPlanId: planId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Issues a fresh public share link, revoking any existing active one first (a plan should
  // only ever have one "live" link at a time). Returns the raw token — the ONLY time it's
  // ever available, since only its sha256 hash is persisted.
  async createShareLink(planId: string, createdById: string) {
    await this.findOne(planId);

    const existing = await this.findActiveShareLink(planId);
    if (existing) {
      await this.prisma.treatmentPlanShareLink.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const link = await this.prisma.treatmentPlanShareLink.create({
      data: { treatmentPlanId: planId, tokenHash, createdById },
    });

    return { token: rawToken, id: link.id, createdAt: link.createdAt };
  }

  async revokeShareLink(planId: string) {
    const link = await this.findActiveShareLink(planId);
    if (!link) throw new NotFoundException('No active share link for this plan');
    await this.prisma.treatmentPlanShareLink.update({
      where: { id: link.id },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }
}
