import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
import { BulkArchiveDto, BulkDeleteDto, BulkLeadIdsDto, BulkNoteDto, BulkTagDto } from './dto/bulk.dto';
import { TagsService } from '../tags/tags.service';
import { toCsv } from './lead-csv';
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
  phoneMatchKey,
  toE164Digits,
  stageDef,
  stageProgress,
  RECYCLE_ANGLE,
  STAGE_LABELS,
  MAX_TAGS_PER_RECORD,
  type ImportLeadsResult,
  type DuplicateGroup,
  type MergeDuplicatesResult,
} from '@dental-crm/shared';
import { MergeDuplicatesDto } from './dto/merge-duplicates.dto';

const LEAD_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  whatsappNumber: true,
  // Written since the country migration and used to parse every phone number, but never selected —
  // so `lead.country` was undefined on every card and in the deal sheet, while the web type
  // declared it. The flag on a card is the first thing a coordinator reads.
  country: true,
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
  // On every card. Tags are the axis the board cannot show any other way — stage is the column,
  // owner is the avatar, and "wants implants, speaks Arabic, waiting on family" has nowhere else
  // to live. Ordered by category so a card truncating its tags drops the least useful one.
  tags: {
    select: { tag: { select: { id: true, name: true, color: true, category: true } } },
    orderBy: { assignedAt: 'asc' as const },
  },
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
  constructor(
    private readonly prisma: PrismaService,
    // Only for `currentOrganizationId`. Tagging is the first thing in the pipeline that has to know
    // which clinic it belongs to, and resolving that in two places is how the two come to disagree.
    private readonly tags: TagsService,
  ) {}

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
    const { search, stage, status, assignedToId, source, taskDue, stuck, tagIds } = query;
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

    // One `some` per tag, so the conditions compose as AND. A single `some: { tagId: { in: [...] } }`
    // would read as OR — it asks for a deal with any one of these tags — which is a different
    // question and a much larger answer.
    if (tagIds?.length) where.AND = tagIds.map((tagId) => ({ tags: { some: { tagId } } }));

    // A deal folded into another is off the board. The row survives for its history, but showing
    // it would put the duplicate straight back in front of whoever just merged it away.
    where.mergedIntoId = null;

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

  /**
   * The deal a number is already on, or null.
   *
   * Deliberately unscoped by assignee. A receptionist who cannot see a colleague's deals still has
   * to be told the number is taken, or the duplicate they are about to create is exactly the one
   * this check exists to stop. Only the name and stage come back — enough to say "this is already
   * in the pipeline, go there" without opening the record.
   *
   * Closed deals do not block: a patient who was treated last year and enquires again is a new
   * deal, and refusing that would be a worse bug than the one being fixed.
   */
  private async openDealOnNumber(numbers: (string | undefined)[], excludeLeadId?: string) {
    const candidates = numbers.filter((n): n is string => !!n && n.length >= 7);
    if (candidates.length === 0) return null;

    // Matched on the trailing digits rather than the whole string. Stored numbers are not
    // canonical and never were — the old normaliser kept the trunk zero on "0555 111 22 33" and
    // dropped it on "+90 555 111 22 33", so an exact `in` comparison missed the same person
    // entered both ways. `endsWith` is the one comparison that works across both formats without
    // rewriting a thousand rows first.
    const suffixes = candidates
      .map((n) => phoneMatchKey(n))
      .filter((n): n is string => !!n);

    return this.prisma.lead.findFirst({
      where: {
        id: excludeLeadId ? { not: excludeLeadId } : undefined,
        status: $Enums.LeadStatus.ACTIVE,
        mergedIntoId: null,
        OR: suffixes.flatMap((suffix) => [
          { phone: { endsWith: suffix } },
          { whatsappNumber: { endsWith: suffix } },
        ]),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        stage: true,
        assignedTo: { select: { firstName: true, lastName: true } },
      },
    });
  }

  /** The 409 body, shaped so the dialog can offer to open the deal rather than just refusing. */
  private duplicateNumberError(existing: NonNullable<Awaited<ReturnType<LeadsService['openDealOnNumber']>>>) {
    const name = `${existing.firstName} ${existing.lastName ?? ''}`.trim();
    const owner = existing.assignedTo
      ? `${existing.assignedTo.firstName} ${existing.assignedTo.lastName}`
      : 'nobody';
    return new ConflictException({
      message: `That number is already on an open deal — ${name}, at ${STAGE_LABELS[existing.stage] ?? existing.stage}, assigned to ${owner}.`,
      code: 'DUPLICATE_NUMBER',
      existingLeadId: existing.id,
      existingLeadName: name,
      existingStage: existing.stage,
    });
  }

  async create(dto: CreateLeadDto, currentUser?: JwtPayload) {
    // Normalised on the way in, so the stored value matches how inbound WhatsApp arrives and so
    // the duplicate check above compares like with like. Without this "+90 555 111 22 33" and
    // "905551112233" are two different strings and no check can see they are one patient.
    // Stored in E.164 against the lead's own country, so a Gulf number is not silently filed as
    // a Turkish one. Falls back to digits-only when no country is given, which is the honest
    // result for a local-format number nobody has told us the origin of.
    const phone = dto.phone ? (toE164Digits(dto.phone, dto.country) ?? undefined) : undefined;
    const whatsappNumber = dto.whatsappNumber
      ? (toE164Digits(dto.whatsappNumber, dto.country) ?? undefined)
      : undefined;

    const existing = await this.openDealOnNumber([phone, whatsappNumber]);
    if (existing) throw this.duplicateNumberError(existing);

    return this.prisma.lead.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone,
        whatsappNumber,
        country: dto.country?.trim().toUpperCase(),
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

  // ─── Duplicate numbers ──────────────────────────────────────────────────────
  //
  // A quarter of the live pipeline was the same person entered more than once. The cleanup keeps
  // one deal per number and folds the rest into it, rather than deleting anything: the losing rows
  // hold notes and stage history somebody wrote, and after a delete there would be no way to tell
  // a duplicate had ever existed.

  /**
   * Deals that share a phone or WhatsApp number, grouped by number.
   *
   * Grouped in memory rather than by SQL because the numbers on file are not normalised — the
   * Bitrix import brought in "+90 555…", "0090555…" and "905 551…" for one patient — so grouping
   * has to happen after normalisation, not on the raw column.
   */
  async findDuplicateGroups(): Promise<DuplicateGroup[]> {
    const leads = await this.prisma.lead.findMany({
      where: { mergedIntoId: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        whatsappNumber: true,
        // Needed to key a stored local-format number correctly — see phoneMatchKey.
        country: true,
        email: true,
        stage: true,
        status: true,
        estimatedValue: true,
        currency: true,
        notes: true,
        createdAt: true,
        stageChangedAt: true,
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        patient: { select: { id: true } },
        _count: { select: { tasks: true, activities: true, conversations: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const byNumber = new Map<string, typeof leads>();
    for (const lead of leads) {
      // One deal contributes at most once per distinct number it carries, so a lead whose phone
      // and WhatsApp are the same number does not look like a duplicate of itself.
      const numbers = new Set(
        [lead.phone, lead.whatsappNumber]
          .map((n) => (n ? (phoneMatchKey(n, lead.country) ?? '') : ''))
          // Under seven digits is an extension or a typo, not a number that identifies anyone.
          .filter((n) => n.length >= 7),
      );
      for (const n of numbers) {
        if (!byNumber.has(n)) byNumber.set(n, []);
        byNumber.get(n)!.push(lead);
      }
    }

    const groups: DuplicateGroup[] = [];
    for (const [number, members] of byNumber) {
      if (members.length < 2) continue;

      const ranked = [...members].sort(
        (a, b) =>
          stageProgress(b.stage) - stageProgress(a.stage) ||
          b.stageChangedAt.getTime() - a.stageChangedAt.getTime() ||
          b.createdAt.getTime() - a.createdAt.getTime(),
      );

      // More than one completed treatment on a number is a returning patient, not a mistake —
      // implants last year, crowns this year. Those are two real deals and merging them would
      // destroy the clinic's record of the first. Flagged so bulk merge leaves them alone.
      const completed = members.filter((m) => stageDef(m.stage)?.terminal === 'won').length;
      // A deal that became a patient is not junk either, whatever stage it sits at.
      const linkedToPatient = members.filter((m) => m.patient).length;

      groups.push({
        number,
        repeatTreatment: completed > 1 || linkedToPatient > 1,
        suggestedSurvivorId: ranked[0].id,
        leads: ranked.map((l) => ({
          id: l.id,
          firstName: l.firstName,
          lastName: l.lastName,
          phone: l.phone,
          email: l.email,
          stage: l.stage,
          status: l.status,
          estimatedValue: l.estimatedValue ? Number(l.estimatedValue) : null,
          currency: l.currency,
          createdAt: l.createdAt.toISOString(),
          assignedTo: l.assignedTo,
          hasPatient: !!l.patient,
          counts: l._count,
        })),
      });
    }

    // Worst first: the number on seven deals is the one somebody wants to see.
    return groups.sort((a, b) => b.leads.length - a.leads.length);
  }

  /**
   * Folds every other deal on a number into one survivor.
   *
   * `dryRun` reports exactly what would move without touching anything. The destructive version of
   * this runs over live patient records and cannot be undone by pressing back, so the preview is
   * not a nicety — it is how somebody checks the survivor is the right deal before committing.
   *
   * Deals linked to a patient are never absorbed. That deal produced a treatment; whatever it looks
   * like on the board, it is not a stray enquiry to be tidied away.
   */
  async mergeDuplicates(dto: MergeDuplicatesDto, currentUser: JwtPayload): Promise<MergeDuplicatesResult> {
    const groups = await this.findDuplicateGroups();
    const wanted = dto.numbers?.length ? new Set(dto.numbers) : null;

    const result: MergeDuplicatesResult = { merged: 0, groups: 0, skipped: [], dryRun: !!dto.dryRun };

    for (const group of groups) {
      if (wanted && !wanted.has(group.number)) continue;

      if (group.repeatTreatment && !dto.includeRepeatTreatment) {
        result.skipped.push({ number: group.number, reason: 'Looks like repeat treatment, not a duplicate' });
        continue;
      }

      const survivorId = dto.survivors?.[group.number] ?? group.suggestedSurvivorId;
      const survivor = group.leads.find((l) => l.id === survivorId);
      if (!survivor) {
        result.skipped.push({ number: group.number, reason: 'The chosen deal is not on this number' });
        continue;
      }

      const losers = group.leads.filter((l) => l.id !== survivorId && !l.hasPatient);
      const protectedCount = group.leads.length - losers.length - 1;
      if (protectedCount > 0) {
        result.skipped.push({
          number: group.number,
          reason: `${protectedCount} deal(s) left alone — already linked to a patient`,
        });
      }
      if (losers.length === 0) continue;

      if (!dto.dryRun) {
        await this.absorbLeads(survivorId, losers.map((l) => l.id), currentUser);
      }

      result.groups += 1;
      result.merged += losers.length;
    }

    return result;
  }

  /**
   * Moves everything hanging off the losing deals onto the survivor, then marks them merged.
   *
   * One transaction per group rather than one for the whole run: a failure on the twentieth number
   * should not roll back the nineteen that worked, and holding locks over a thousand-row table
   * while several hundred rows move is how a board goes unresponsive mid-morning.
   */
  private async absorbLeads(survivorId: string, loserIds: string[], currentUser: JwtPayload) {
    await this.prisma.$transaction(async (tx) => {
      const losers = await tx.lead.findMany({
        where: { id: { in: loserIds } },
        select: { id: true, firstName: true, lastName: true, stage: true, notes: true, estimatedValue: true },
      });
      const survivor = await tx.lead.findUniqueOrThrow({
        where: { id: survivorId },
        select: { notes: true, estimatedValue: true },
      });

      // Everything a person wrote or a patient sent moves across. Conversations especially: a
      // thread left on a merged deal is a patient's messages disappearing from the inbox.
      await tx.leadTask.updateMany({ where: { leadId: { in: loserIds } }, data: { leadId: survivorId } });
      await tx.leadActivity.updateMany({ where: { leadId: { in: loserIds } }, data: { leadId: survivorId } });
      await tx.conversation.updateMany({ where: { leadId: { in: loserIds } }, data: { leadId: survivorId } });
      await tx.callLog.updateMany({ where: { leadId: { in: loserIds } }, data: { leadId: survivorId } });
      await tx.intakeSubmission.updateMany({ where: { leadId: { in: loserIds } }, data: { leadId: survivorId } });

      const carriedNotes = losers
        .map((l) => l.notes?.trim())
        .filter((n): n is string => !!n);

      // An estimate on the survivor wins; one is only inherited when the survivor has none, so a
      // merge never quietly reprices a deal somebody has already quoted.
      const inheritedValue =
        survivor.estimatedValue ?? losers.find((l) => l.estimatedValue != null)?.estimatedValue ?? null;

      await tx.lead.update({
        where: { id: survivorId },
        data: {
          estimatedValue: inheritedValue,
          notes: [survivor.notes?.trim(), ...carriedNotes].filter(Boolean).join('\n\n---\n') || null,
        },
      });

      await tx.lead.updateMany({
        where: { id: { in: loserIds } },
        data: {
          mergedIntoId: survivorId,
          mergedAt: new Date(),
          status: $Enums.LeadStatus.ARCHIVED,
        },
      });

      // The survivor's history says where the extra deals went, so this is answerable months later
      // without anybody having to know the merge ever ran.
      await tx.leadActivity.create({
        data: {
          leadId: survivorId,
          userId: currentUser.sub,
          note: `Merged ${losers.length} duplicate deal(s) on the same number into this one: ${losers
            .map((l) => `${l.firstName} ${l.lastName ?? ''}`.trim() || l.id)
            .join(', ')}`,
        },
      });
    });
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

    // Editing a number is the other way a duplicate appears — someone corrects a typo and lands on
    // a number already in the pipeline. Same normalisation and same check as create, minus this
    // deal itself, which would otherwise always be its own clash.
    const country = dto.country ?? (await this.prisma.lead.findUnique({
      where: { id },
      select: { country: true },
    }))?.country;

    const phone =
      dto.phone !== undefined ? (dto.phone ? (toE164Digits(dto.phone, country) ?? null) : null) : undefined;
    const whatsappNumber =
      dto.whatsappNumber !== undefined
        ? (dto.whatsappNumber ? (toE164Digits(dto.whatsappNumber, country) ?? null) : null)
        : undefined;

    if (phone || whatsappNumber) {
      const existing = await this.openDealOnNumber([phone ?? undefined, whatsappNumber ?? undefined], id);
      if (existing) throw this.duplicateNumberError(existing);
    }

    return this.prisma.lead.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: phone ?? undefined,
        whatsappNumber: whatsappNumber ?? undefined,
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

    const newStatus = statusForStage(dto.stage as $Enums.PipelineStage);

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

    // The enquiry form asks for a full medical history — medications, conditions, previous
    // surgeries, smoking, alcohol, pregnancy, blood thinners — and conversion used to copy a name,
    // an email and a phone number. Everything clinical stayed on the lead, so a dentist opening
    // the patient record saw no mention of the blood thinners that patient had declared.
    //
    // Submissions are ordered newest first, so the most recent answers win where somebody filled
    // the form twice.
    const intake = lead.intakeSubmissions?.[0];

    const [patient, updatedLead] = await this.prisma.$transaction(async (tx) => {
      const newPatient = await tx.patient.create({
        data: {
          firstName: lead.firstName,
          lastName: lead.lastName ?? '',
          email: lead.email ?? undefined,
          phone: lead.phone ?? undefined,
          whatsappNumber: lead.whatsappNumber ?? undefined,
          // `?? undefined` throughout: an unanswered question must stay unanswered on the record.
          // Defaulting a blank to false would turn "we never asked" into "the patient said no",
          // which on blood thinners is the difference between a question and a hazard.
          dateOfBirth: intake?.dateOfBirth ?? undefined,
          gender: intake?.gender ?? undefined,
          nationality: intake?.nationality ?? undefined,
          country: intake?.countryOfResidence ?? undefined,
          allergies: intake?.allergies ?? undefined,
          medications: intake?.medications ?? undefined,
          medicalConditions: intake?.medicalConditions ?? undefined,
          previousSurgeries: intake?.previousSurgeries ?? undefined,
          isSmoker: intake?.isSmoker ?? undefined,
          drinksAlcohol: intake?.drinksAlcohol ?? undefined,
          isPregnant: intake?.isPregnant ?? undefined,
          takesBloodThinners: intake?.takesBloodThinners ?? undefined,
          heightCm: intake?.heightCm ?? undefined,
          weightKg: intake?.weightKg ?? undefined,
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

  // ---------------------------------------------------------------------------------------------
  // Bulk actions on a board selection.
  //
  // All four share one rule, enforced in `resolveSelection` rather than in each method: the ids
  // arrive from a client and are treated as a request, not as permission. A sales consultant who
  // edits the request body still only reaches their own deals, because the selection is re-read
  // through the same scope every other pipeline query uses. Ids the caller cannot act on are
  // dropped silently rather than raising — telling someone *which* of their guessed ids was real
  // answers the question they were asking.
  // ---------------------------------------------------------------------------------------------

  /**
   * The subset of `leadIds` this caller may act on, with the fields every bulk action needs.
   *
   * Merged duplicates are excluded. They are off every board, so an id referring to one came from
   * somewhere other than a selection, and folding a merged row back into a bulk edit would
   * resurrect the duplicate its merge was meant to retire.
   */
  private async resolveSelection(leadIds: string[], currentUser: JwtPayload) {
    const unique = [...new Set(leadIds)];
    return this.prisma.lead.findMany({
      where: {
        id: { in: unique },
        mergedIntoId: null,
        ...(this.canSeeAll(currentUser) ? {} : { assignedToId: currentUser.sub }),
      },
      select: { id: true, stage: true, status: true },
    });
  }

  /**
   * Archive or restore a selection.
   *
   * Archiving sets `status` to ARCHIVED, which is what takes a deal off the board — the default
   * where-clause filters to ACTIVE. Restoring cannot simply write ACTIVE back, because `status`
   * carries the outcome as well as the visibility: a won deal that was archived at the end of the
   * season would come back as an open one, quietly removing it from every conversion figure. So a
   * restore re-derives the outcome from the stage, the same rule `updateStage` applies.
   */
  async bulkArchive(dto: BulkArchiveDto, currentUser: JwtPayload) {
    const archiving = dto.archived !== false;
    const leads = await this.resolveSelection(dto.leadIds, currentUser);
    // Deals already in the requested state are skipped, so repeating the action does not fill the
    // history with entries recording that nothing happened.
    const changing = leads.filter((l) =>
      archiving ? l.status !== $Enums.LeadStatus.ARCHIVED : l.status === $Enums.LeadStatus.ARCHIVED,
    );
    if (changing.length === 0) {
      return { archived: archiving, changed: 0, requested: dto.leadIds.length };
    }

    const note = archiving ? 'Archived' : 'Restored from the archive';

    // Archiving is one statement; restoring is one per outcome, because the status each deal
    // returns to depends on where it sits. Empty groups are dropped rather than issued as
    // updateMany calls that match nothing.
    const restores = [$Enums.LeadStatus.WON, $Enums.LeadStatus.LOST, $Enums.LeadStatus.ACTIVE]
      .map((status) => ({
        status,
        ids: changing.filter((l) => statusForStage(l.stage) === status).map((l) => l.id),
      }))
      .filter((group) => group.ids.length > 0)
      .map((group) =>
        this.prisma.lead.updateMany({ where: { id: { in: group.ids } }, data: { status: group.status } }),
      );

    await this.prisma.$transaction([
      ...(archiving
        ? [
            this.prisma.lead.updateMany({
              where: { id: { in: changing.map((l) => l.id) } },
              data: { status: $Enums.LeadStatus.ARCHIVED },
            }),
          ]
        : restores),
      this.prisma.leadActivity.createMany({
        data: changing.map((l) => ({
          leadId: l.id,
          userId: currentUser.sub,
          fromStage: l.stage,
          toStage: l.stage,
          note,
        })),
      }),
    ]);

    return { archived: archiving, changed: changing.length, requested: dto.leadIds.length };
  }

  /**
   * Write the same note against every deal in a selection.
   *
   * Stored as a LeadActivity rather than appended to `Lead.notes`: the note is something a person
   * did at a time, and the history is where anyone looks for that. Appending to the free-text field
   * would also mean forty read-modify-writes racing each other against whatever someone is typing.
   *
   * `fromStage` and `toStage` are set to the deal's current stage, matching the reassignment
   * entries — the columns are non-null on a stage change and meaningless otherwise, and leaving
   * them null makes the row read as a stage change to nowhere in the activity feed.
   */
  async bulkNote(dto: BulkNoteDto, currentUser: JwtPayload) {
    const note = dto.note.trim();
    if (!note) throw new BadRequestException('Write something before adding it to the deals.');

    const leads = await this.resolveSelection(dto.leadIds, currentUser);
    if (leads.length === 0) return { noted: 0, requested: dto.leadIds.length };

    await this.prisma.leadActivity.createMany({
      data: leads.map((l) => ({
        leadId: l.id,
        userId: currentUser.sub,
        fromStage: l.stage,
        toStage: l.stage,
        note,
      })),
    });

    return { noted: leads.length, requested: dto.leadIds.length };
  }

  /**
   * A selection as a spreadsheet.
   *
   * Built here rather than in the browser for two reasons. The board holds a trimmed projection of
   * each deal, so a client-side export would silently omit the columns nobody put on a card — the
   * ones a spreadsheet is opened for. And an export of names, phone numbers and countries is a
   * disclosure of personal data under KVKK and GDPR; done on the server it lands in the audit trail
   * with a name against it, which is the difference between a record and an assumption.
   */
  async bulkExport(dto: BulkLeadIdsDto, currentUser: JwtPayload) {
    const leads = await this.prisma.lead.findMany({
      where: {
        id: { in: [...new Set(dto.leadIds)] },
        mergedIntoId: null,
        ...(this.canSeeAll(currentUser) ? {} : { assignedToId: currentUser.sub }),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        firstName: true, lastName: true, phone: true, whatsappNumber: true, email: true,
        country: true, source: true, stage: true, status: true, estimatedValue: true,
        currency: true, lostReason: true, notes: true, stageChangedAt: true, createdAt: true,
        utmSource: true, utmMedium: true, utmCampaign: true,
        campaign: { select: { name: true } },
        assignedTo: { select: { firstName: true, lastName: true } },
      },
    });

    const csv = toCsv(
      [
        'First name', 'Last name', 'Phone', 'WhatsApp', 'Email', 'Country', 'Source', 'Campaign',
        'UTM source', 'UTM medium', 'UTM campaign', 'Stage', 'Status', 'Estimated value',
        'Currency', 'Owner', 'Lost reason', 'Notes', 'Stage changed', 'Created',
      ],
      leads.map((l) => [
        l.firstName, l.lastName, l.phone, l.whatsappNumber, l.email, l.country, l.source,
        l.campaign?.name, l.utmSource, l.utmMedium, l.utmCampaign,
        // The label people read on the board, not the enum they never see.
        STAGE_LABELS[l.stage] ?? l.stage,
        l.status,
        // String(), not Number(): a Prisma Decimal converts exactly to a string and only
        // approximately to a float, and this column is money.
        l.estimatedValue?.toString(), l.currency,
        l.assignedTo ? `${l.assignedTo.firstName} ${l.assignedTo.lastName ?? ''}`.trim() : null,
        l.lostReason, l.notes, l.stageChangedAt, l.createdAt,
      ]),
    );

    return { csv, count: leads.length };
  }

  /**
   * Delete a selection outright.
   *
   * Super Admin only, and the only bulk action here that cannot be undone.
   *
   * Deals that became patients are refused rather than skipped. `Patient.leadId` is nullable with
   * SetNull, so the delete would succeed and take the link with it — the patient record survives
   * while the enquiry that produced it, and the attribution and marketing spend behind it, does
   * not. That is the kind of loss nobody notices until the quarter is being reported. Archiving is
   * the answer for a converted deal, and the error says so.
   */
  async bulkDelete(dto: BulkDeleteDto, currentUser: JwtPayload) {
    if (!dto.confirm) throw new BadRequestException('Deletion must be confirmed.');
    // Checked here as well as on the route. The query below is deliberately unscoped, because a
    // Super Admin deletes across the whole pipeline — so if this method were ever reached from
    // somewhere without the decorator, that missing scope would be the vulnerability rather than
    // a gap. Every other bulk action gets this for free from `resolveSelection`.
    if (!this.canSeeAll(currentUser)) {
      throw new ForbiddenException('Only a Super Admin can delete deals.');
    }

    const leads = await this.prisma.lead.findMany({
      where: { id: { in: [...new Set(dto.leadIds)] } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        patient: { select: { id: true } },
        mergedFrom: { select: { id: true } },
      },
    });
    if (leads.length === 0) return { deleted: 0, requested: dto.leadIds.length };

    const converted = leads.filter((l) => l.patient);
    if (converted.length > 0) {
      const names = converted.slice(0, 3).map((l) => `${l.firstName} ${l.lastName ?? ''}`.trim());
      throw new BadRequestException(
        `${converted.length === 1 ? 'This deal has' : `${converted.length} of these deals have`} ` +
          `become a patient (${names.join(', ')}${converted.length > 3 ? '…' : ''}). ` +
          'Archive them instead — deleting would cut the patient record off from where it came from.',
      );
    }

    // A deal others were merged into is the survivor of a cleanup; deleting it strips the pointer
    // from every duplicate folded into it, and their history stops leading anywhere.
    const survivors = leads.filter((l) => l.mergedFrom.length > 0);
    if (survivors.length > 0) {
      throw new BadRequestException(
        `${survivors.length === 1 ? 'One deal is' : `${survivors.length} deals are`} the surviving ` +
          'record of a duplicate merge. Deleting them would orphan the deals folded into them.',
      );
    }

    // Activities and tasks cascade; conversations and call logs detach by SetNull, so the message
    // history survives without a deal attached. Intake submissions likewise — a declaration
    // someone made about their own health is not ours to destroy along with a sales record.
    const { count } = await this.prisma.lead.deleteMany({
      where: { id: { in: leads.map((l) => l.id) } },
    });
    return { deleted: count, requested: dto.leadIds.length };
  }

  // ---------------------------------------------------------------------------------------------
  // Tags.
  //
  // Every change goes through `applyTags`, whether it came from one deal or a selection of forty,
  // so a single path decides what is written and what is recorded. Tagging is idempotent: adding a
  // tag a deal already has is a no-op rather than an error, because the caller is a checkbox and
  // the honest response to "make sure this is on" is "it is".
  // ---------------------------------------------------------------------------------------------

  /**
   * Adds or removes tags across a set of deals.
   *
   * Writes the join and the history in one transaction. A `LeadTag` row without its history entry
   * is the failure worth preventing — the tag is visible on the card and nothing says who put it
   * there, which is precisely the question tags create.
   */
  private async applyTags(
    leadIds: string[],
    tagIds: string[],
    action: $Enums.TagAction,
    currentUser: JwtPayload,
  ) {
    const organizationId = await this.tags.currentOrganizationId();

    const [leads, tags] = await Promise.all([
      this.resolveSelection(leadIds, currentUser),
      // Scoped to the organisation, so a tag id from anywhere else simply is not found rather than
      // being attached across a boundary.
      this.prisma.tag.findMany({
        where: { id: { in: [...new Set(tagIds)] }, organizationId },
        select: { id: true, name: true },
      }),
    ]);
    if (leads.length === 0 || tags.length === 0) return { changed: 0, leads: leads.length };

    const leadIdList = leads.map((l) => l.id);
    const tagIdList = tags.map((t) => t.id);

    // What is already true. Adding only writes the pairs that are missing and removing only the
    // pairs that exist, so the history records changes rather than clicks.
    const existing = await this.prisma.leadTag.findMany({
      where: { leadId: { in: leadIdList }, tagId: { in: tagIdList } },
      select: { leadId: true, tagId: true },
    });
    const has = new Set(existing.map((e) => `${e.leadId}:${e.tagId}`));

    const pairs = leadIdList.flatMap((leadId) =>
      tags
        .filter((t) => (action === 'ADDED' ? !has.has(`${leadId}:${t.id}`) : has.has(`${leadId}:${t.id}`)))
        .map((t) => ({ leadId, tagId: t.id, tagName: t.name })),
    );
    if (pairs.length === 0) return { changed: 0, leads: leads.length };

    if (action === 'ADDED') {
      // The cap is per deal and counts what is already there, so a bulk tag cannot push a deal
      // past it. A record carrying twenty tags filters into every list, which is the same as
      // carrying none.
      const counts = await this.prisma.leadTag.groupBy({
        by: ['leadId'],
        where: { leadId: { in: leadIdList } },
        _count: { _all: true },
      });
      const current = new Map(counts.map((c) => [c.leadId, c._count._all]));
      const over = leadIdList.filter(
        (id) => (current.get(id) ?? 0) + pairs.filter((p) => p.leadId === id).length > MAX_TAGS_PER_RECORD,
      );
      if (over.length > 0) {
        throw new BadRequestException(
          `${over.length === 1 ? 'A deal' : `${over.length} deals`} would end up with more than ` +
            `${MAX_TAGS_PER_RECORD} tags. Remove some first — past that point a tag stops narrowing anything.`,
        );
      }
    }

    await this.prisma.$transaction([
      action === 'ADDED'
        ? this.prisma.leadTag.createMany({
            data: pairs.map((p) => ({ leadId: p.leadId, tagId: p.tagId, assignedById: currentUser.sub })),
            // Belt and braces against two people tagging the same deal in the same instant: the
            // pre-read above cannot see a row written after it.
            skipDuplicates: true,
          })
        : this.prisma.leadTag.deleteMany({
            where: { leadId: { in: leadIdList }, tagId: { in: tagIdList } },
          }),
      this.prisma.leadTagHistory.createMany({
        data: pairs.map((p) => ({
          organizationId,
          leadId: p.leadId,
          tagId: p.tagId,
          tagName: p.tagName,
          action,
          userId: currentUser.sub,
        })),
      }),
    ]);

    return { changed: pairs.length, leads: leads.length };
  }

  async addTag(leadId: string, tagId: string, currentUser: JwtPayload) {
    // findOne enforces the same access check the rest of the deal view uses, and 404s rather than
    // silently doing nothing when the deal is not the caller's.
    await this.findOne(leadId, currentUser);
    await this.applyTags([leadId], [tagId], $Enums.TagAction.ADDED, currentUser);
    return this.findOne(leadId, currentUser);
  }

  async removeTag(leadId: string, tagId: string, currentUser: JwtPayload) {
    await this.findOne(leadId, currentUser);
    await this.applyTags([leadId], [tagId], $Enums.TagAction.REMOVED, currentUser);
    return this.findOne(leadId, currentUser);
  }

  async bulkTag(dto: BulkTagDto, currentUser: JwtPayload) {
    const action = dto.remove ? $Enums.TagAction.REMOVED : $Enums.TagAction.ADDED;
    const result = await this.applyTags(dto.leadIds, dto.tagIds, action, currentUser);
    return { ...result, action, requested: dto.leadIds.length };
  }

  /**
   * When each tag went on or came off this deal.
   *
   * Read from the history rather than the join, so removals appear. A tag that was on a deal for
   * three weeks and came off the day before it was lost is the interesting one, and the join
   * cannot show it.
   */
  async getTagHistory(leadId: string, currentUser: JwtPayload) {
    await this.findOne(leadId, currentUser);
    return this.prisma.leadTagHistory.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        tagName: true,
        action: true,
        createdAt: true,
        tag: { select: { id: true, color: true, category: true } },
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }
}

/**
 * The outcome a deal's stage implies. Shared by restoring from the archive and by `updateStage`, so
 * the two cannot come to disagree about what a deal sitting in DONE is.
 */
function statusForStage(stage: $Enums.PipelineStage): $Enums.LeadStatus {
  if (stage === $Enums.PipelineStage.DONE) return $Enums.LeadStatus.WON;
  if (stage === $Enums.PipelineStage.LOST) return $Enums.LeadStatus.LOST;
  return $Enums.LeadStatus.ACTIVE;
}
