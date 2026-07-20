import { Injectable, NotFoundException } from '@nestjs/common';
import { $Enums } from '@prisma/client';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTreatmentPlanDto } from './dto/create-treatment-plan.dto';
import { UpdateTreatmentPlanDto } from './dto/update-treatment-plan.dto';

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
  assignedDentistId: true,
  assignedCoordinatorId: true,
  createdAt: true,
  updatedAt: true,
  patient: { select: { id: true, firstName: true, lastName: true } },
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
      treatmentCategory: { select: { id: true, name: true } },
    },
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
    // client-side), so the plan total is just the sum of the line costs — not re-derived from
    // unitPrice/quantity, which would double-apply the discount.
    const itemsTotal = (dto.items ?? []).reduce((sum, i) => sum + i.cost, 0);

    // Snapshot the patient's current diagnosis so the patient-facing presentation stays stable
    // even if the live diagnosis is edited later.
    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
      select: { diagnosis: true },
    });

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
              })),
            }
          : undefined,
        timelineSteps: { create: DEFAULT_TIMELINE_STEPS },
      },
      select: PLAN_SELECT,
    });
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
