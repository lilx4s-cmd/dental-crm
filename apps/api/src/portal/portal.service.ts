import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { PdfService } from '../pdf/pdf.service';
import { RejectPlanDto } from './dto/reject-plan.dto';
import { AddPortalCommentDto } from './dto/add-portal-comment.dto';

// Sanitized shape for the public patient portal — patient first/last name only, no DOB, ID,
// phone, or address (mirrors the "generic 404, don't leak existence" posture of this whole module).
const PORTAL_PLAN_SELECT = {
  id: true,
  title: true,
  status: true,
  totalCost: true,
  currency: true,
  approvalStatus: true,
  rejectionReason: true,
  doctorRecommendation: true,
  aiSummary: true,
  createdAt: true,
  patient: { select: { firstName: true, lastName: true } },
  items: {
    select: {
      id: true,
      description: true,
      toothNumber: true,
      quantity: true,
      cost: true,
      material: true,
      brand: true,
      status: true,
      warranties: {
        select: {
          id: true,
          startDate: true,
          durationMonths: true,
          status: true,
          termsAndConditions: true,
          maintenanceRequirements: true,
          exclusions: true,
          annualCheckupRequired: true,
        },
      },
    },
  },
  timelineSteps: {
    select: { id: true, title: true, description: true, status: true, order: true, dueDate: true, completedAt: true },
    orderBy: { order: 'asc' as const },
  },
  comments: {
    select: { id: true, authorType: true, authorName: true, body: true, createdAt: true },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly pdfService: PdfService,
  ) {}

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  // Looks up an active (non-revoked, non-expired) share link by raw token. Throws a generic
  // NotFoundException in every failure case so the response can't be used to distinguish
  // "wrong token" from "revoked/expired link" — avoids leaking existence.
  private async findActiveLink(token: string) {
    const tokenHash = this.hash(token);
    const link = await this.prisma.treatmentPlanShareLink.findUnique({ where: { tokenHash } });
    if (!link) throw new NotFoundException('Link not found');
    if (link.revokedAt) throw new NotFoundException('Link not found');
    if (link.expiresAt && link.expiresAt <= new Date()) throw new NotFoundException('Link not found');
    return link;
  }

  async getPlan(token: string) {
    const link = await this.findActiveLink(token);

    // Side effect: touch lastViewedAt so staff can see when a patient last opened the link.
    await this.prisma.treatmentPlanShareLink.update({
      where: { id: link.id },
      data: { lastViewedAt: new Date() },
    });

    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id: link.treatmentPlanId },
      select: PORTAL_PLAN_SELECT,
    });
    if (!plan) throw new NotFoundException('Link not found');

    const clinicSettings = await this.settingsService.get();

    return {
      plan,
      clinic: {
        clinicName: clinicSettings?.clinicName ?? 'Dental Clinic',
        logoUrl: clinicSettings?.logoUrl ?? null,
        address: clinicSettings?.address ?? null,
        city: clinicSettings?.city ?? null,
        country: clinicSettings?.country ?? null,
      },
    };
  }

  async approve(token: string) {
    const link = await this.findActiveLink(token);
    // Mirrors treatment-plans.service.ts's update() approvedAt-sync logic exactly.
    await this.prisma.treatmentPlan.update({
      where: { id: link.treatmentPlanId },
      data: { approvalStatus: 'APPROVED', approvedAt: new Date() },
    });
    return { success: true };
  }

  async reject(token: string, dto: RejectPlanDto) {
    const link = await this.findActiveLink(token);
    await this.prisma.treatmentPlan.update({
      where: { id: link.treatmentPlanId },
      data: { approvalStatus: 'REJECTED', approvedAt: null, rejectionReason: dto.reason },
    });
    return { success: true };
  }

  async addComment(token: string, dto: AddPortalCommentDto) {
    const link = await this.findActiveLink(token);
    await this.prisma.treatmentPlanComment.create({
      data: {
        treatmentPlanId: link.treatmentPlanId,
        authorType: 'PATIENT',
        authorName: dto.authorName,
        body: dto.body,
      },
    });
    return { success: true };
  }

  async getPdf(token: string) {
    const link = await this.findActiveLink(token);
    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id: link.treatmentPlanId },
      select: {
        title: true,
        totalCost: true,
        currency: true,
        doctorRecommendation: true,
        patient: { select: { firstName: true, lastName: true } },
        items: {
          select: { description: true, toothNumber: true, material: true, brand: true, quantity: true, cost: true },
        },
        timelineSteps: { select: { title: true, status: true }, orderBy: { order: 'asc' } },
      },
    });
    if (!plan) throw new NotFoundException('Link not found');

    const clinicSettings = await this.settingsService.get();

    return this.pdfService.generateTreatmentPlanPdf(plan, {
      clinicName: clinicSettings?.clinicName ?? 'Dental Clinic',
      address: clinicSettings?.address,
      city: clinicSettings?.city,
      country: clinicSettings?.country,
    });
  }
}
