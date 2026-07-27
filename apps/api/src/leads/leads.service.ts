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
import { ImportLeadsDto } from './dto/import-leads.dto';
import {
  PipelineStage,
  Role,
  JwtPayload,
  TaskDueFilter,
  taskDueRange,
  stuckBefore,
  nextAction,
  coerceLeadSource,
  normalisePhone,
  RECYCLE_ANGLE,
  STAGE_LABELS,
  type ImportLeadsResult,
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
        stage: $Enums.PipelineStage.NEW_DEAL,
        status: $Enums.LeadStatus.ACTIVE,
      },
      select: LEAD_SELECT,
    });
  }

  /**
   * Creates many leads from a spreadsheet in one call.
   *
   * Three things matter here, and none of them is speed.
   *
   * A bad row must not cost the good ones. Clinic lists are hand-kept and reliably contain a blank
   * line, a name in the phone column, or a header repeated halfway down; failing the whole import
   * on the first of those means nobody can import anything. Each row is attempted on its own and
   * its reason reported against its line number.
   *
   * Re-importing must not duplicate. The same list gets uploaded again a month later with thirty
   * new names on the end, and 300 duplicate deals is worse than no import at all — each one is a
   * patient somebody may now ring twice. Matching is on phone and email because those identify a
   * person; two patients genuinely share a name.
   *
   * It must not run as one transaction. A single failed row would roll back an import somebody
   * spent an afternoon preparing, and Postgres would hold locks across the whole file meanwhile.
   */
  async importLeads(dto: ImportLeadsDto, currentUser: JwtPayload): Promise<ImportLeadsResult> {
    const assignedToId = dto.assignedToId ?? currentUser.sub;
    const skipDuplicates = dto.skipDuplicates ?? true;
    const result: ImportLeadsResult = { created: 0, skipped: 0, errors: [] };

    // One lookup for the whole file rather than a query per row: an 800-row import would otherwise
    // be 800 extra round trips to Supabase before it created anything.
    const existing = skipDuplicates ? await this.existingContactKeys(dto.leads) : new Set<string>();

    for (const [index, row] of dto.leads.entries()) {
      // One for the header, one to count from one: this is the line number in their file.
      const rowNumber = index + 2;
      try {
        const phone = row.phone ? normalisePhone(row.phone) : undefined;
        const whatsappNumber = row.whatsappNumber ? normalisePhone(row.whatsappNumber) : undefined;
        const email = row.email?.trim().toLowerCase() || undefined;

        if (!phone && !email) {
          result.errors.push({ row: rowNumber, reason: 'No phone or email — nobody could contact this lead' });
          continue;
        }

        const keys = [phone && `p:${phone}`, email && `e:${email}`].filter(Boolean) as string[];
        if (skipDuplicates && keys.some((k) => existing.has(k))) {
          result.skipped += 1;
          continue;
        }

        await this.prisma.lead.create({
          data: {
            firstName: row.firstName.trim(),
            lastName: row.lastName?.trim() || null,
            email,
            phone,
            whatsappNumber,
            source: coerceLeadSource(row.source) as $Enums.LeadSource,
            estimatedValue: row.estimatedValue,
            currency: row.currency?.toUpperCase() || 'USD',
            notes: row.notes?.trim() || null,
            assignedToId,
            stage: $Enums.PipelineStage.NEW_DEAL,
            status: $Enums.LeadStatus.ACTIVE,
          },
          select: { id: true },
        });

        // Rows collide with each other too — the same person listed twice is routine in a merged
        // spreadsheet — so an accepted contact joins the set as we go.
        keys.forEach((k) => existing.add(k));
        result.created += 1;
      } catch (e) {
        result.errors.push({
          row: rowNumber,
          reason: e instanceof Error ? e.message : 'Could not be created',
        });
      }
    }

    return result;
  }

  /** Phone and email keys for every lead already on file that this import might duplicate. */
  private async existingContactKeys(rows: ImportLeadsDto['leads']): Promise<Set<string>> {
    const phones = rows.map((r) => (r.phone ? normalisePhone(r.phone) : '')).filter(Boolean);
    const emails = rows
      .map((r) => r.email?.trim().toLowerCase() ?? '')
      .filter(Boolean);

    if (phones.length === 0 && emails.length === 0) return new Set();

    const matches = await this.prisma.lead.findMany({
      where: {
        OR: [
          ...(phones.length ? [{ phone: { in: phones } }] : []),
          ...(emails.length ? [{ email: { in: emails } }] : []),
        ],
      },
      select: { phone: true, email: true },
    });

    const keys = new Set<string>();
    for (const m of matches) {
      if (m.phone) keys.add(`p:${normalisePhone(m.phone)}`);
      if (m.email) keys.add(`e:${m.email.toLowerCase()}`);
    }
    return keys;
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
      dto.stage === PipelineStage.DONE
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
      // Reaching DONE means the treatment happened, so the patient this deal produced moves from
      // being sold to being looked after. updateMany rather than update because a deal that was
      // never converted has no patient — this is then a no-op instead of an error. The date is
      // only set once, so re-entering DONE does not restart somebody's after-care clock.
      ...(dto.stage === PipelineStage.DONE
        ? [
            this.prisma.patient.updateMany({
              where: { convertedFromLeadId: id, aftercareStartedAt: null },
              data: { aftercareStartedAt: new Date() },
            }),
          ]
        : []),
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
          // This path sets the deal to DONE, so the patient starts in after-care for the same
          // reason the stage-change path does.
          aftercareStartedAt: new Date(),
        },
      });

      const updated = await tx.lead.update({
        where: { id },
        data: { stage: $Enums.PipelineStage.DONE, status: $Enums.LeadStatus.WON },
        select: LEAD_SELECT,
      });

      if (lead.assignedTo?.id) {
        await tx.leadActivity.create({
          data: {
            leadId: id,
            userId: lead.assignedTo.id,
            fromStage: lead.stage as $Enums.PipelineStage,
            toStage: $Enums.PipelineStage.DONE,
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

  /**
   * What this salesperson should do today, and what has gone cold.
   *
   * Both lists come from rules over data the pipeline already holds — nothing here calls a model.
   * "This deal has sat in Offer Sent for six days" is a fact, and deriving it is free and always
   * right; a language model would be slower, cost money per deal, and occasionally be wrong. The
   * model is used later, to write the message, once these rules have decided who needs one.
   */
  async workList(currentUser: JwtPayload) {
    const where: Prisma.LeadWhereInput = { status: $Enums.LeadStatus.ACTIVE };
    // Everyone except Super Admin sees their own work; a shared list nobody owns gets ignored.
    if (!this.canSeeAll(currentUser)) where.assignedToId = currentUser.sub;

    // One pass over the open pipeline. Every stage has a different cadence, so the decision cannot
    // be pushed into SQL without encoding the cadence table twice.
    const leads = await this.prisma.lead.findMany({
      where,
      select: {
        ...LEAD_SELECT,
        patient: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { stageChangedAt: 'asc' },
    });

    const now = new Date();
    const due: Array<Record<string, unknown>> = [];
    const dormant: Array<Record<string, unknown>> = [];

    for (const lead of leads) {
      const action = nextAction(lead.stage, lead.stageChangedAt, now);
      if (!action.action) continue;

      // An open task already says what to do and when, so the cadence must not talk over it — that
      // would show two contradictory instructions for the same deal on the same morning.
      const hasOpenTask = lead.tasks.length > 0;

      if (action.dormant) {
        dormant.push({ lead, action, recycleAngle: RECYCLE_ANGLE[lead.stage] ?? null });
      } else if (!hasOpenTask && (action.urgency === 'overdue' || action.urgency === 'due')) {
        due.push({ lead, action });
      }
    }

    // Worst first: the deal ignored longest is the one most likely to be lost outright.
    due.sort((a, b) => (b.action as { overdueDays: number }).overdueDays - (a.action as { overdueDays: number }).overdueDays);
    dormant.sort((a, b) => (b.action as { overdueDays: number }).overdueDays - (a.action as { overdueDays: number }).overdueDays);

    return {
      due,
      dormant,
      counts: { due: due.length, dormant: dormant.length, openPipeline: leads.length },
    };
  }

  /**
   * A plain-text picture of this user's workload, for the assistant to answer from.
   *
   * Built from workList and a scoped stage count — the same access rules as every screen, so the
   * assistant cannot describe a deal its reader could not open. Deliberately compact: it is sent
   * on every question, so length is cost.
   *
   * Names are included because "call Amina back" is the whole point, but nothing clinical is —
   * no medical history, no treatment detail. Sending health records to a third-party model on a
   * casual question is a different decision from generating one summary somebody asked for.
   */
  async assistantSnapshot(currentUser: JwtPayload): Promise<string> {
    const where: Prisma.LeadWhereInput = { status: $Enums.LeadStatus.ACTIVE };
    if (!this.canSeeAll(currentUser)) where.assignedToId = currentUser.sub;

    const [work, byStage] = await Promise.all([
      this.workList(currentUser),
      this.prisma.lead.groupBy({ by: ['stage'], where, _count: { _all: true } }),
    ]);

    const name = (l: { firstName: string; lastName: string | null }) =>
      `${l.firstName} ${l.lastName ?? ''}`.trim();

    const lines: string[] = [];
    lines.push(`Today is ${new Date().toISOString().slice(0, 10)}.`);
    lines.push(
      this.canSeeAll(currentUser)
        ? 'This user can see the whole clinic pipeline.'
        : 'This user can only see deals assigned to them.',
    );
    lines.push('');
    lines.push(`Open deals by stage (${work.counts.openPipeline} total):`);
    for (const row of byStage.sort((a, b) => b._count._all - a._count._all)) {
      lines.push(`  ${STAGE_LABELS[row.stage] ?? row.stage}: ${row._count._all}`);
    }

    lines.push('');
    lines.push(`Deals needing contact now (${work.counts.due}):`);
    // Capped: the whole snapshot is re-sent with every question, so an unbounded list would make
    // each question cost more than the last as the pipeline grows.
    for (const item of work.due.slice(0, 25)) {
      const lead = item.lead as { firstName: string; lastName: string | null; stage: string };
      const action = item.action as { action: string; overdueDays: number; urgency: string };
      lines.push(
        `  ${name(lead)} — ${STAGE_LABELS[lead.stage] ?? lead.stage} — ${action.action}` +
          (action.overdueDays > 0 ? ` (${action.overdueDays} days late)` : ' (due today)'),
      );
    }
    if (work.due.length > 25) lines.push(`  ...and ${work.due.length - 25} more.`);
    if (work.due.length === 0) lines.push('  None.');

    lines.push('');
    lines.push(`Deals gone cold, worth re-approaching (${work.counts.dormant}):`);
    for (const item of work.dormant.slice(0, 15)) {
      const lead = item.lead as { firstName: string; lastName: string | null; stage: string };
      const action = item.action as { overdueDays: number };
      lines.push(
        `  ${name(lead)} — ${STAGE_LABELS[lead.stage] ?? lead.stage} — silent ${action.overdueDays} days`,
      );
    }
    if (work.dormant.length > 15) lines.push(`  ...and ${work.dormant.length - 15} more.`);
    if (work.dormant.length === 0) lines.push('  None.');

    return lines.join('\n');
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
