import { Injectable, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { UpdateLeadStageDto } from './dto/update-lead-stage.dto';
import { LeadsQueryDto } from './dto/leads-query.dto';
import { LeadStatus, PipelineStage } from '@dental-crm/shared';

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
  createdAt: true,
  updatedAt: true,
  assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
  campaign: { select: { id: true, name: true, platform: true } },
  patient: { select: { id: true, firstName: true, lastName: true } },
} as const;

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: LeadsQueryDto) {
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
    if (assignedToId) where.assignedToId = assignedToId;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({ where, select: LEAD_SELECT, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.lead.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id }, select: LEAD_SELECT });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  async create(dto: CreateLeadDto) {
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
        assignedToId: dto.assignedToId,
        stage: $Enums.PipelineStage.NEW_LEAD,
        status: $Enums.LeadStatus.ACTIVE,
      },
      select: LEAD_SELECT,
    });
  }

  async update(id: string, dto: UpdateLeadDto) {
    await this.findOne(id);
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

  async updateStage(id: string, dto: UpdateLeadStageDto, currentUserId: string) {
    const lead = await this.findOne(id);

    const newStatus =
      dto.stage === PipelineStage.WON
        ? $Enums.LeadStatus.WON
        : dto.stage === PipelineStage.LOST
          ? $Enums.LeadStatus.LOST
          : $Enums.LeadStatus.ACTIVE;

    const [updatedLead] = await this.prisma.$transaction([
      this.prisma.lead.update({
        where: { id },
        data: { stage: dto.stage as $Enums.PipelineStage, status: newStatus },
        select: LEAD_SELECT,
      }),
      this.prisma.leadActivity.create({
        data: {
          leadId: id,
          userId: currentUserId,
          fromStage: lead.stage as $Enums.PipelineStage,
          toStage: dto.stage as $Enums.PipelineStage,
          note: dto.note,
        },
      }),
    ]);

    return updatedLead;
  }

  async getActivities(id: string) {
    await this.findOne(id);
    return this.prisma.leadActivity.findMany({
      where: { leadId: id },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async convertToPatient(id: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Lead not found');

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

      if (lead.assignedToId) {
        await tx.leadActivity.create({
          data: {
            leadId: id,
            userId: lead.assignedToId,
            fromStage: lead.stage,
            toStage: $Enums.PipelineStage.WON,
            note: 'Converted to patient',
          },
        });
      }

      return [newPatient, updated];
    });

    return { patient, lead: updatedLead };
  }

  async findAllByStage() {
    const leads = await this.prisma.lead.findMany({
      where: { status: $Enums.LeadStatus.ACTIVE },
      select: LEAD_SELECT,
      orderBy: { createdAt: 'desc' },
    });

    return Object.values(PipelineStage).map((stage) => ({
      stage,
      leads: leads.filter((l) => l.stage === stage),
    }));
  }
}
