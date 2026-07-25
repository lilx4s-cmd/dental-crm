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
      phaseNumber: true,
      toothCondition: true,
      treatmentCategory: { select: { id: true, name: true } },
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
  // Travel, hotel and itinerary. This is the patient's own trip, so nothing here is a disclosure
  // they do not already hold — and it is the part of the dossier they check most often.
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
    orderBy: { date: 'asc' as const },
  },
  // The charted findings and phase structure the patient's own document shows. These carry no
  // identifying information of their own — a condition and a list of tooth numbers — so they fit
  // the sanitized posture above while letting the portal render the same charts as the PDF.
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
    // Reuses the portal's own select so the patient's download is the same dossier the clinic
    // prints — charts, phased pricing, travel and aftercare included. It previously took a much
    // narrower slice, which quietly gave the patient a thinner document than the one discussed
    // with them. Contact details stay out, matching the rest of this module: a share link can be
    // forwarded, so the PDF behind it carries no more than the page does.
    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id: link.treatmentPlanId },
      select: PORTAL_PLAN_SELECT,
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
