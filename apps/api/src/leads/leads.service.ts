import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { UpdateLeadStageDto } from './dto/update-lead-stage.dto';
import { LeadsQueryDto } from './dto/leads-query.dto';
import { TransferLeadsDto } from './dto/transfer-leads.dto';
import { ActivityQueryDto } from './dto/activity-query.dto';
import { PipelineStage, Role, JwtPayload } from '@dental-crm/shared';

const LEAD_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  whatsappNumber: true,
  source: true,
  stage: true,
  status: true,
  estimatedValue: true,
  currency: true,
  lostReason: true,
  notes: true,
  bitrixDealId: true,
  createdAt: true,
  updatedAt: true,
  assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
  campaign: { select: { id: true, name: true, platform: true } },
  patient: { select: { id: true, firstName: true, lastName: true } },
} as const;

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  // Only Super Admin sees every salesperson's data. Everyone else (Clinic Manager,
  // Sales Consultant, Reception, Dentist) is limited to the leads assigned to them.
  private canSeeAll(user?: JwtPayload): boolean {
    return user?.role === Role.SUPER_ADMIN;
  }

  async findAll(query: LeadsQueryDto, currentUser: JwtPayload) {
    const { page, limit, search, stage, status, assignedToId } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.LeadWhereInput = {};

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }
    if (stage) where.stage = stage as $Enums.PipelineStage;
    where.status = status ? (status as $Enums.LeadStatus) : $Enums.LeadStatus.ACTIVE;

    // Access scope: a non-admin can only ever see their own leads, so we pin
    // assignedToId to their own id and ignore any assignedToId they tried to pass.
    if (this.canSeeAll(currentUser)) {
      if (assignedToId) where.assignedToId = assignedToId;
    } else {
      where.assignedToId = currentUser.sub;
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({ where, select: LEAD_SELECT, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.lead.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string, currentUser?: JwtPayload) {
    const lead = await this.prisma.lead.findUnique({ where: { id }, select: LEAD_SELECT });
    if (!lead) throw new NotFoundException('Lead not found');
    // Hide existence of leads a non-admin isn't assigned to (same 404, no info leak).
    if (currentUser && !this.canSeeAll(currentUser) && lead.assignedTo?.id !== currentUser.sub) {
      throw new NotFoundException('Lead not found');
    }
    return lead;
  }

  async create(dto: CreateLeadDto, currentUser?: JwtPayload) {
    return this.prisma.lead.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        whatsappNumber: dto.whatsappNumber,
        source: dto.source as $Enums.LeadSource,
        campaignId: dto.campaignId,
        estimatedValue: dto.estimatedValue,
        currency: dto.currency ?? 'USD',
        notes: dto.notes,
        // Falls back to whoever is creating the lead so it never silently lands
        // unassigned — a non-admin's pipeline view is scoped to assignedToId, so
        // an unassigned lead used to vanish from every salesperson's board.
        assignedToId: dto.assignedToId ?? currentUser?.sub,
        stage: $Enums.PipelineStage.NEW_LEAD,
        status: $Enums.LeadStatus.ACTIVE,
      },
      select: LEAD_SELECT,
    });
  }

  async update(id: string, dto: UpdateLeadDto, currentUser?: JwtPayload) {
    await this.findOne(id, currentUser);
    return this.prisma.lead.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        whatsappNumber: dto.whatsappNumber,
        source: dto.source as $Enums.LeadSource | undefined,
        campaignId: dto.campaignId,
        estimatedValue: dto.estimatedValue,
        currency: dto.currency,
        notes: dto.notes,
        assignedToId: dto.assignedToId,
      },
      select: LEAD_SELECT,
    });
  }

  async updateStage(id: string, dto: UpdateLeadStageDto, currentUser: JwtPayload) {
    const lead = await this.findOne(id, currentUser);

    const newStatus =
      dto.stage === PipelineStage.WON
        ? $Enums.LeadStatus.WON
        : dto.stage === PipelineStage.LOST
          ? $Enums.LeadStatus.LOST
          : $Enums.LeadStatus.ACTIVE;

    // Lost reason only ever applies while a lead is actually in the LOST stage:
    // persist it when moving in (falling back to whatever was already there, so
    // re-confirming a move doesn't blank it out), clear it the moment the lead
    // moves anywhere else so a reopened deal doesn't carry a stale reason.
    const lostReason = dto.stage === PipelineStage.LOST ? (dto.lostReason ?? lead.lostReason) : null;

    const [updatedLead] = await this.prisma.$transaction([
      this.prisma.lead.update({
        where: { id },
        data: { stage: dto.stage as $Enums.PipelineStage, status: newStatus, lostReason },
        select: LEAD_SELECT,
      }),
      this.prisma.leadActivity.create({
        data: {
          leadId: id,
          userId: currentUser.sub,
          fromStage: lead.stage as $Enums.PipelineStage,
          toStage: dto.stage as $Enums.PipelineStage,
          note:
            dto.stage === PipelineStage.LOST && dto.lostReason
              ? `${dto.lostReason}${dto.note ? ` — ${dto.note}` : ''}`
              : dto.note,
        },
      }),
    ]);

    return updatedLead;
  }

  async getActivities(id: string, currentUser?: JwtPayload) {
    await this.findOne(id, currentUser);
    return this.prisma.leadActivity.findMany({
      where: { leadId: id },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async convertToPatient(id: string, currentUser?: JwtPayload) {
    const lead = await this.findOne(id, currentUser);

    const [patient, updatedLead] = await this.prisma.$transaction(async (tx) => {
      const newPatient = await tx.patient.create({
        data: {
          firstName: lead.firstName,
          lastName: lead.lastName ?? '',
          email: lead.email ?? undefined,
          phone: lead.phone ?? undefined,
          whatsappNumber: lead.whatsappNumber ?? undefined,
          convertedFromLeadId: lead.id,
        },
      });

      const updated = await tx.lead.update({
        where: { id },
        data: { stage: $Enums.PipelineStage.WON, status: $Enums.LeadStatus.WON },
        select: LEAD_SELECT,
      });

      if (lead.assignedTo?.id) {
        await tx.leadActivity.create({
          data: {
            leadId: id,
            userId: lead.assignedTo.id,
            fromStage: lead.stage as $Enums.PipelineStage,
            toStage: $Enums.PipelineStage.WON,
            note: 'Converted to patient',
          },
        });
      }

      return [newPatient, updated];
    });

    return { patient, lead: updatedLead };
  }

  async findAllByStage(currentUser: JwtPayload) {
    const where: Prisma.LeadWhereInput = { status: $Enums.LeadStatus.ACTIVE };
    if (!this.canSeeAll(currentUser)) where.assignedToId = currentUser.sub;

    const leads = await this.prisma.lead.findMany({
      where,
      select: LEAD_SELECT,
      orderBy: { createdAt: 'desc' },
    });

    return Object.values(PipelineStage).map((stage) => ({
      stage,
      leads: leads.filter((l) => l.stage === stage),
    }));
  }

  // Bulk-reassign leads from one salesperson to another. Two modes:
  //  - leadIds: move exactly those leads (takes precedence if provided)
  //  - fromUserId: move that person's ACTIVE pipeline only. WON/LOST/ARCHIVED
  //    leads are left alone so historical deal attribution (and any commission
  //    reporting built on top of it) isn't rewritten by a routine reassignment.
  //    Use leadIds if a closed lead genuinely needs to move.
  // Each moved lead gets a LeadActivity row so the reassignment shows up in the
  // sales history feed. fromStage/toStage are set to the lead's current stage
  // (no stage change happened) — the note carries the reassignment detail.
  async transferLeads(dto: TransferLeadsDto, currentUser: JwtPayload) {
    const { toUserId, fromUserId, leadIds, note } = dto;

    const toUser = await this.prisma.user.findUnique({
      where: { id: toUserId },
      select: { id: true, firstName: true, lastName: true, isActive: true },
    });
    if (!toUser) throw new NotFoundException('Target salesperson not found');

    const where: Prisma.LeadWhereInput = {};
    if (leadIds && leadIds.length > 0) {
      where.id = { in: leadIds };
    } else if (fromUserId) {
      where.assignedToId = fromUserId;
      where.status = $Enums.LeadStatus.ACTIVE;
    } else {
      throw new BadRequestException('Provide either leadIds or fromUserId');
    }

    const leads = await this.prisma.lead.findMany({
      where,
      select: { id: true, stage: true },
    });
    if (leads.length === 0) return { transferred: 0, toUserId };

    const toName = `${toUser.firstName} ${toUser.lastName ?? ''}`.trim();
    const movingIds = leads.map((l) => l.id);
    const reassignNote = note?.trim() || `Reassigned to ${toName}`;

    await this.prisma.$transaction([
      this.prisma.lead.updateMany({
        where: { id: { in: movingIds } },
        data: { assignedToId: toUserId },
      }),
      this.prisma.leadActivity.createMany({
        data: leads.map((l) => ({
          leadId: l.id,
          userId: currentUser.sub,
          fromStage: l.stage,
          toStage: l.stage,
          note: reassignNote,
        })),
      }),
    ]);

    return { transferred: leads.length, toUserId };
  }

  // Sales oversight feed: every stage change / reassignment, newest first.
  // Super Admin sees all activity (optionally filtered to one salesperson);
  // everyone else is pinned to their own actions.
  async getActivityFeed(query: ActivityQueryDto, currentUser: JwtPayload) {
    const { page, limit, userId } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.LeadActivityWhereInput = {};
    if (!this.canSeeAll(currentUser)) {
      where.userId = currentUser.sub;
    } else if (userId) {
      where.userId = userId;
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.leadActivity.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          lead: { select: { id: true, firstName: true, lastName: true, stage: true, status: true } },
        },
      }),
      this.prisma.leadActivity.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}
