import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { UpdateLeadStageDto } from './dto/update-lead-stage.dto';
import { LeadsQueryDto } from './dto/leads-query.dto';
import { TransferLeadsDto } from './dto/transfer-leads.dto';
import { ActivityQueryDto } from './dto/activity-query.dto';
import { CreateLeadTaskDto, UpdateLeadTaskDto } from './dto/lead-task.dto';
import {
  PipelineStage,
  Role,
  JwtPayload,
  TaskDueFilter,
  taskDueRange,
  stuckBefore,
} from '@dental-crm/shared';

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
  stageChangedAt: true,
  assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
  // Open tasks only, soonest first: the card shows the next thing to do, and completed history
  // would bloat every kanban payload for no benefit.
  tasks: {
    where: { completedAt: null },
    orderBy: { dueDate: 'asc' as const },
    select: {
      id: true,
      title: true,
      dueDate: true,
      completedAt: true,
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  campaign: { select: { id: true, name: true, platform: true } },
  patient: { select: { id: true, firstName: true, lastName: true } },
} as const;

// Only for the single-lead view. The intake questionnaire is a page of answers per lead, and the
// kanban renders hundreds of cards at once — putting it in LEAD_SELECT would download every
// patient's medical history to draw a board that never shows it.
const LEAD_DETAIL_SELECT = {
  ...LEAD_SELECT,
  // Held alongside the lead rather than merged into it: staff edit the lead as they learn more,
  // and that must never overwrite what the patient originally said about their own health.
  intakeSubmissions: {
    select: {
      id: true,
      createdAt: true,
      dateOfBirth: true,
      gender: true,
      nationality: true,
      countryOfResidence: true,
      preferredLanguage: true,
      treatmentInterest: true,
      chiefComplaint: true,
      desiredTimeframe: true,
      openToTravel: true,
      allergies: true,
      medications: true,
      medicalConditions: true,
      previousSurgeries: true,
      isSmoker: true,
      drinksAlcohol: true,
      isPregnant: true,
      takesBloodThinners: true,
      heightCm: true,
      weightKg: true,
      additionalNotes: true,
      consentedAt: true,
      attachments: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } },
    },
    orderBy: { createdAt: 'desc' as const },
  },
} as const;

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  // Only Super Admin sees every salesperson's data. Everyone else (Clinic Manager,
  // Sales Consultant, Reception, Dentist) is limited to the leads assigned to them.
  private canSeeAll(user?: JwtPayload): boolean {
    return user?.role === Role.SUPER_ADMIN;
  }

  /**
   * Turns the filter query into a where-clause. Shared by the paginated list and the kanban board
   * so a filter cannot mean one thing in one view and something else in the other — the board used
   * to accept no filters at all, which is how they drifted apart in the first place.
   */
  private buildWhere(query: LeadsQueryDto, currentUser: JwtPayload): Prisma.LeadWhereInput {
    const { search, stage, status, assignedToId, source, taskDue, stuck } = query;
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
    if (source) where.source = source as $Enums.LeadSource;
    where.status = status ? (status as $Enums.LeadStatus) : $Enums.LeadStatus.ACTIVE;

    if (taskDue) {
      where.tasks =
        taskDue === TaskDueFilter.NONE
          ? // "No task" means nothing outstanding — a lead whose only tasks are done still needs
            // picking up, so completed ones must not keep it out of this bucket.
            { none: { completedAt: null } }
          : { some: { completedAt: null, dueDate: taskDueRange(taskDue) ?? undefined } };
    }

    if (stuck) where.stageChangedAt = { lt: stuckBefore() };

    // Access scope: a non-admin can only ever see their own leads, so we pin
    // assignedToId to their own id and ignore any assignedToId they tried to pass.
    if (this.canSeeAll(currentUser)) {
      if (assignedToId) where.assignedToId = assignedToId;
    } else {
      where.assignedToId = currentUser.sub;
    }

    return where;
  }

  async findAll(query: LeadsQueryDto, currentUser: JwtPayload) {
    const { page, limit } = query;
    const skip = (page - 1) * limit;
    const where = this.buildWhere(query, currentUser);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({ where, select: LEAD_SELECT, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.lead.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string, currentUser?: JwtPayload) {
    const lead = await this.prisma.lead.findUnique({ where: { id }, select: LEAD_DETAIL_SELECT });
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
        data: {
          stage: dto.stage as $Enums.PipelineStage,
          status: newStatus,
          lostReason,
          stageChangedAt: new Date(),
        },
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

  async findAllByStage(query: LeadsQueryDto, currentUser: JwtPayload) {
    // The board deliberately ignores the `stage` filter: hiding columns would break the drag
    // targets, and a stage filter on a stage-partitioned view is what the column already is.
    const where = this.buildWhere({ ...query, stage: undefined }, currentUser);

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
  /**
   * Resolves which leads a transfer covers.
   *
   * Explicit ids win. Otherwise the same where-builder the pipeline filters through is reused, so
   * "transfer what I filtered" moves exactly the set the board was showing rather than a second
   * interpretation of the same words.
   */
  private transferWhere(dto: TransferLeadsDto, currentUser: JwtPayload): Prisma.LeadWhereInput {
    if (dto.leadIds && dto.leadIds.length > 0) return { id: { in: dto.leadIds } };

    const hasSelection =
      dto.fromUserId || dto.stage || dto.source || dto.taskDue || dto.stuck || dto.search?.trim();
    // Refused rather than treated as "everything": reassigning an entire pipeline should take a
    // deliberate act, not an empty form.
    if (!hasSelection) {
      throw new BadRequestException(
        'Choose which leads to transfer — pick specific leads, a salesperson, or at least one filter.',
      );
    }

    return this.buildWhere(
      {
        page: 1,
        limit: 0,
        assignedToId: dto.fromUserId,
        stage: dto.stage,
        source: dto.source,
        taskDue: dto.taskDue,
        stuck: dto.stuck,
        search: dto.search,
      } as LeadsQueryDto,
      currentUser,
    );
  }

  /** What a transfer would move, without moving it. Bulk reassignment deserves a look first. */
  async previewTransfer(dto: TransferLeadsDto, currentUser: JwtPayload) {
    const where = this.transferWhere(dto, currentUser);
    const [leads, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          stage: true,
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.lead.count({ where }),
    ]);
    return { leads, total, showing: leads.length };
  }

  async transferLeads(dto: TransferLeadsDto, currentUser: JwtPayload) {
    const { toUserId, note } = dto;

    const toUser = await this.prisma.user.findUnique({
      where: { id: toUserId },
      select: { id: true, firstName: true, lastName: true, isActive: true },
    });
    if (!toUser) throw new NotFoundException('Target salesperson not found');
    // Handing leads to a deactivated account hides them from everyone, since the pipeline scopes
    // a non-admin's board to their own assignments.
    if (!toUser.isActive) {
      throw new BadRequestException('That salesperson is deactivated — reactivate them first.');
    }

    const where = this.transferWhere(dto, currentUser);

    const leads = await this.prisma.lead.findMany({
      // Leads already owned by the target are excluded, so a repeated transfer does not fill the
      // history with moves that changed nothing.
      where: { ...where, NOT: { assignedToId: toUserId } },
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

  // ─────────────────────────── LEAD TASKS ───────────────────────────

  private static readonly TASK_SELECT = {
    id: true,
    title: true,
    dueDate: true,
    completedAt: true,
    createdAt: true,
    assignedTo: { select: { id: true, firstName: true, lastName: true } },
  } as const;

  /** Every task on a lead, open first and soonest-due first, then the completed history. */
  async findTasks(leadId: string, currentUser: JwtPayload) {
    await this.findOne(leadId, currentUser);
    return this.prisma.leadTask.findMany({
      where: { leadId },
      select: LeadsService.TASK_SELECT,
      orderBy: [{ completedAt: 'asc' }, { dueDate: 'asc' }],
    });
  }

  async createTask(leadId: string, dto: CreateLeadTaskDto, currentUser: JwtPayload) {
    // findOne enforces the same access scope as the rest of the module, so a non-admin cannot
    // attach work to a lead they are not allowed to see.
    const lead = await this.findOne(leadId, currentUser);
    return this.prisma.leadTask.create({
      data: {
        leadId,
        title: dto.title,
        dueDate: new Date(dto.dueDate),
        // Falls back to whoever owns the lead, then to the creator, so a task always has someone
        // answerable for it — an unassigned task never surfaces in anybody's day.
        assignedToId: dto.assignedToId ?? lead.assignedTo?.id ?? currentUser.sub,
        createdById: currentUser.sub,
      },
      select: LeadsService.TASK_SELECT,
    });
  }

  private async findTaskForUser(taskId: string, currentUser: JwtPayload) {
    const task = await this.prisma.leadTask.findUnique({
      where: { id: taskId },
      select: { id: true, leadId: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    // Reuse the lead's access check rather than inventing a second rule for tasks.
    await this.findOne(task.leadId, currentUser);
    return task;
  }

  async updateTask(taskId: string, dto: UpdateLeadTaskDto, currentUser: JwtPayload) {
    await this.findTaskForUser(taskId, currentUser);
    return this.prisma.leadTask.update({
      where: { id: taskId },
      data: {
        title: dto.title,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        assignedToId: dto.assignedToId,
        // `completed` is a verb the client sends; the column stores when it happened. Undefined
        // leaves it alone so a rename does not silently reopen a finished task.
        completedAt: dto.completed === undefined ? undefined : dto.completed ? new Date() : null,
      },
      select: LeadsService.TASK_SELECT,
    });
  }

  async removeTask(taskId: string, currentUser: JwtPayload) {
    await this.findTaskForUser(taskId, currentUser);
    await this.prisma.leadTask.delete({ where: { id: taskId } });
    return { success: true };
  }
}
