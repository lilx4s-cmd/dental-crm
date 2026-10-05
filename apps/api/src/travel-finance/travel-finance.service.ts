import { createHash, randomUUID } from 'node:crypto';
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, Role } from '@prisma/client';
import {
  JwtPayload,
  type Consultation,
  canSeeAllLeads,
  canSupervise,
  hasPermission,
} from '@dental-crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from '../files/files.service';
import { ConfigService } from '@nestjs/config';
import { GoogleCalendarService } from './google-calendar.service';
import {
  bookingSchema,
  flightInstant,
  missingArrangements,
  catalogSchema,
  snapshotSchema,
  calculateCase,
  compensationSchema,
  currency,
  decimal,
} from './policy';
import { z } from 'zod';
import { monthlyFinance } from './monthly-finance';
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const parse = <S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> => {
  const p = schema.safeParse(input);
  if (!p.success) throw new BadRequestException(p.error.issues.map((i) => i.message));
  return p.data;
};
const admin = (u: JwtPayload) =>
  [Role.SUPER_ADMIN, Role.CLINIC_MANAGER].includes(u.role as 'SUPER_ADMIN' | 'CLINIC_MANAGER') &&
  hasPermission(u, 'finance.write', true);
const D = Prisma.Decimal;
@Injectable()
export class TravelFinanceService {
  private running = false;
  constructor(
    private db: PrismaService,
    private files: FilesService,
    private google: GoogleCalendarService,
    private config: ConfigService,
  ) {}
  private scope(u: JwtPayload): Prisma.LeadWhereInput {
    return canSeeAllLeads(u)
      ? {}
      : canSupervise(u)
        ? { OR: [{ assignedToId: u.sub }, { supervisorId: u.sub }] }
        : { assignedToId: u.sub };
  }
  private async caseAccess(patientId: string, leadId: string, u: JwtPayload) {
    const lead = await this.db.lead.findFirst({
      where: { id: leadId, mergedIntoId: null, ...this.scope(u) },
      select: {
        id: true,
        assignedToId: true,
        patient: { select: { id: true } },
        firstName: true,
        lastName: true,
      },
    });
    if (!lead || lead.patient?.id !== patientId)
      throw new NotFoundException(
        'Patient/deal not found or not permitted. Convert the existing deal to its patient first.',
      );
    return lead;
  }
  private requireAdmin(
    u: JwtPayload,
    permission: 'finance.read' | 'finance.write' = 'finance.write',
  ) {
    if (
      ![Role.SUPER_ADMIN, Role.CLINIC_MANAGER].includes(
        u.role as 'SUPER_ADMIN' | 'CLINIC_MANAGER',
      ) ||
      !hasPermission(u, permission, true)
    )
      throw new ForbiddenException('Internal finances require authorized clinic management');
  }
  async caseContext(leadId: string, u: JwtPayload) {
    const lead = await this.db.lead.findFirst({
      where: { id: leadId, mergedIntoId: null, ...this.scope(u) },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        patient: {
          select: {
            id: true,
            treatmentPlans: {
              select: { id: true, title: true, approvalStatus: true, stay: true },
              take: 20,
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    });
    if (!lead) throw new NotFoundException('Deal not available');
    return {
      ...lead,
      bookings: await this.db.travelBooking.findMany({
        where: { leadId },
        select: { id: true, visit: true, status: true },
      }),
    };
  }
  async estimateFromPlan(
    patientId: string,
    leadId: string,
    planId: string,
    plan: Consultation,
    editorId: string,
  ) {
    const catalog = await this.db.costCatalogVersion.findMany({
      where: { effectiveAt: { lte: new Date() } },
      orderBy: [{ key: 'asc' }, { version: 'desc' }],
      take: 1000,
    });
    const latest = new Map<string, (typeof catalog)[number]>();
    for (const c of catalog) if (!latest.has(c.key)) latest.set(c.key, c);
    const categories: Record<string, string> = {
      implant: 'IMPLANT',
      crown: 'CROWN',
      implantCrown: 'CROWN',
      veneer: 'VENEER',
      extraction: 'EXTRACTION',
      graft: 'GRAFT',
      sinus: 'SINUS',
      temporary: 'TEMPORARY',
      bridge: 'CROWN',
    };
    const owner = await this.db.lead.findUnique({
      where: { id: leadId },
      select: { assignedToId: true },
    });
    for (const visit of plan.visits) {
      const lines: Array<
        Parameters<typeof calculateCase>[0]['lines'][number] & {
          name: string;
          catalogId: string | null;
          discount: string;
        }
      > = [];
      for (const item of plan.lines.filter((l) => l.visit === visit.number)) {
        const found = [...latest.values()].find((entry) => {
          const c = entry.details as z.infer<typeof catalogSchema>;
          return (
            entry.active &&
            c.category === categories[item.type] &&
            c.currency === plan.currency &&
            (!c.material || c.material.toLowerCase() === (item.material ?? '').toLowerCase()) &&
            (!c.brand || c.brand.toLowerCase() === (item.brand ?? '').toLowerCase())
          );
        });
        const cost = found ? (found.details as z.infer<typeof catalogSchema>).cost : null;
        lines.push({
          name: item.description ?? item.type,
          category: categories[item.type] ?? 'OTHER',
          catalogId: found?.id ?? null,
          currency: plan.currency,
          quantity: String(item.quantity),
          sellingPrice: item.unitPrice === null ? null : new D(item.unitPrice).toFixed(2),
          cost,
          actualCost: null,
          included: false,
          discount: new D(item.discount).toFixed(2),
        });
      }
      if (visit.nights)
        lines.push({
          name: 'Hotel nights',
          category: 'HOTEL',
          catalogId: null,
          currency: plan.currency,
          quantity: String(visit.nights),
          sellingPrice: new D(visit.hotelRate).toFixed(2),
          cost: null,
          actualCost: null,
          included: visit.hotelIncluded,
          discount: '0.00',
        });
      if (visit.transfer !== 'excluded')
        lines.push({
          name: 'Transfers',
          category: 'TRANSFER',
          catalogId: null,
          currency: plan.currency,
          quantity: '1',
          sellingPrice: new D(visit.transferPrice).toFixed(2),
          cost: null,
          actualCost: null,
          included: visit.transfer === 'included',
          discount: '0.00',
        });
      const totals = calculateCase({
        currency: plan.currency,
        mode: 'ITEMIZED',
        packagePrice: null,
        commission: null,
        exchangeRates: [],
        lines,
      });
      if (totals.revenue !== null) {
        const discounts = lines.reduce((sum, l) => sum.add(l.discount), new D(0));
        totals.revenue = new D(totals.revenue).minus(discounts).toFixed(2);
      }
      await this.db.$transaction(async (tx) => {
        const old = await tx.caseCostSnapshot.findFirst({
          where: { patientId, leadId, visit: visit.number },
          orderBy: { version: 'desc' },
        });
        await tx.caseCostSnapshot.create({
          data: {
            patientId,
            leadId,
            visit: visit.number,
            version: (old?.version ?? 0) + 1,
            state: 'ESTIMATE',
            details: json({
              patientId,
              leadId,
              treatmentPlanId: planId,
              assignedToId: owner?.assignedToId,
              visit: visit.number,
              reportMonth: new Date().toISOString().slice(0, 7),
              mode: 'ITEMIZED',
              currency: plan.currency,
              packagePrice: null,
              commission: null,
              exchangeRates: [],
              lines,
              totals,
              source: 'Treatment proposal',
              reason:
                'Automatic estimate from the existing treatment proposal; unknown provider costs remain missing',
            }),
            createdById: editorId,
          },
        });
      });
    }
  }
  async saveBooking(input: unknown, u: JwtPayload) {
    const v = parse(bookingSchema, input);
    await this.caseAccess(v.patientId, v.leadId, u);
    if (
      v.treatmentPlanId &&
      !(await this.db.treatmentPlan.findFirst({
        where: { id: v.treatmentPlanId, patientId: v.patientId },
        select: { id: true },
      }))
    )
      throw new BadRequestException('Treatment plan belongs to another patient');
    const key = { patientId: v.patientId, leadId: v.leadId, visit: v.visit };
    return this.db.$transaction(async (tx) => {
      const old = await tx.travelBooking.findUnique({ where: { patientId_leadId_visit: key } });
      if (old && v.revision !== old.revision)
        throw new ConflictException('Booking changed. Reload before saving.');
      const arrivalAt = v.arrival ? flightInstant(v.arrival) : null,
        departureAt = v.departure ? flightInstant(v.departure) : null;
      const details = { ...v };
      delete details.revision;
      const booking = old
        ? await tx.travelBooking.update({
            where: { id: old.id, revision: v.revision },
            data: {
              status: v.status,
              details: json(details),
              arrivalAt,
              departureAt,
              revision: { increment: 1 },
              calendarCycle:
                old.status === 'CANCELLED' && v.status !== 'CANCELLED'
                  ? { increment: 1 }
                  : undefined,
            },
          })
        : await tx.travelBooking.create({
            data: {
              ...key,
              status: v.status,
              details: json(details),
              arrivalAt,
              departureAt,
              createdById: u.sub,
            },
          });
      await tx.calendarSync.upsert({
        where: { bookingId: booking.id },
        create: { bookingId: booking.id, revision: booking.revision },
        update: {
          revision: booking.revision,
          state: 'PENDING',
          attempts: 0,
          nextAt: new Date(),
          error: null,
        },
      });
      return booking;
    });
  }
  async booking(id: string, u: JwtPayload) {
    const b = await this.db.travelBooking.findUnique({
      where: { id },
      include: {
        attachments: {
          include: {
            file: { select: { id: true, fileName: true, mimeType: true, scanStatus: true } },
          },
        },
        sync: { select: { state: true, error: true, attempts: true, updatedAt: true } },
      },
    });
    if (!b) throw new NotFoundException('Booking not found');
    await this.caseAccess(b.patientId, b.leadId, u);
    return { ...b, missing: missingArrangements(bookingSchema.parse(b.details)) };
  }
  async attach(id: string, fileId: string, u: JwtPayload) {
    const booking = await this.booking(id, u);
    await this.files.getDownloadUrl(fileId, u);
    const f = await this.db.file.findUniqueOrThrow({
      where: { id: fileId },
      select: {
        ownerType: true,
        ownerId: true,
        mimeType: true,
        messageAttachments: {
          select: {
            message: { select: { conversation: { select: { leadId: true, patientId: true } } } },
          },
        },
      },
    });
    const direct =
      (f.ownerType === 'LEAD' && f.ownerId === booking.leadId) ||
      (f.ownerType === 'PATIENT' && f.ownerId === booking.patientId);
    const chat = f.messageAttachments.some(
      (a) =>
        a.message.conversation.leadId === booking.leadId ||
        a.message.conversation.patientId === booking.patientId,
    );
    if (!direct && !chat)
      throw new BadRequestException(
        'Attachment must belong to this patient/deal or a linked conversation',
      );
    if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(f.mimeType))
      throw new BadRequestException('Upload a PDF or supported ticket image');
    return this.db.travelAttachment.upsert({
      where: { bookingId_fileId: { bookingId: id, fileId } },
      create: { bookingId: id, fileId, attachedById: u.sub },
      update: {},
    });
  }
  private month(month: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException('Use month YYYY-MM');
    const [year, m] = month.split('-').map(Number);
    return {
      start: new Date(`${month}-01T00:00:00+03:00`),
      end: new Date(Date.UTC(year, m, 1) - 3 * 3600000),
    };
  }
  async monthly(q: Record<string, string | undefined>, u: JwtPayload) {
    const { start, end } = this.month(
      q.month ??
        new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' }).slice(0, 7),
    );
    if (q.visit && !['1', '2'].includes(q.visit))
      throw new BadRequestException('Visit must be 1 or 2');
    if (q.status && !['DRAFT', 'CONFIRMED', 'ARRIVED', 'COMPLETED', 'CANCELLED'].includes(q.status))
      throw new BadRequestException('Unknown booking status');
    const page = Math.max(1, Math.min(10000, Math.floor(Number(q.page) || 1)));
    const where: Prisma.TravelBookingWhereInput = {
      lead: this.scope(u),
      arrivalAt: { gte: start, lt: end },
      ...(q.visit ? { visit: Number(q.visit) } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.staffId && canSeeAllLeads(u)
        ? { lead: { ...this.scope(u), assignedToId: q.staffId } }
        : {}),
    };
    const countWhere = { ...where };
    delete countWhere.status;
    const [data, total, counts, uniquePatients] = await Promise.all([
      this.db.travelBooking.findMany({
        where,
        skip: (page - 1) * 30,
        take: 30,
        orderBy: { arrivalAt: 'asc' },
        select: {
          id: true,
          patientId: true,
          leadId: true,
          visit: true,
          status: true,
          details: true,
          arrivalAt: true,
          departureAt: true,
          revision: true,
          sync: { select: { state: true, error: true } },
          attachments: { select: { fileId: true } },
          lead: {
            select: {
              firstName: true,
              lastName: true,
              assignedToId: true,
              assignedTo: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
      this.db.travelBooking.count({ where }),
      this.db.travelBooking.groupBy({ by: ['status'], where: countWhere, _count: true }),
      this.db.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`SELECT COUNT(DISTINCT b."patientId")::bigint AS count FROM travel_bookings b JOIN leads l ON l.id=b."leadId" WHERE b."arrivalAt">=${start} AND b."arrivalAt"<${end} AND b.status IN ('CONFIRMED','ARRIVED','COMPLETED') ${canSeeAllLeads(u) ? Prisma.empty : canSupervise(u) ? Prisma.sql`AND (l."assignedToId"=${u.sub} OR l."supervisorId"=${u.sub})` : Prisma.sql`AND l."assignedToId"=${u.sub}`} ${q.staffId && canSeeAllLeads(u) ? Prisma.sql`AND l."assignedToId"=${q.staffId}` : Prisma.empty} ${q.visit ? Prisma.sql`AND b.visit=${Number(q.visit)}` : Prisma.empty}`,
      ),
    ]);
    return {
      data: data.map((b) => ({
        ...b,
        missing: missingArrangements(bookingSchema.parse(b.details)),
      })),
      page,
      total,
      counts,
      uniqueBookedPatients: Number(uniquePatients[0]?.count ?? 0),
      countDefinition:
        'Summary counts use the selected month, salesperson and visit; the status filter changes the list only. Confirmed visits are CONFIRMED, ARRIVED and COMPLETED. One patient/deal/visit counts once, regardless of attachments. Cancelled visits are separate.',
      staffOptions: canSeeAllLeads(u)
        ? await this.db.user.findMany({
            where: { isActive: true },
            select: { id: true, firstName: true, lastName: true },
          })
        : [],
      operationalTimezone: 'Europe/Istanbul',
    };
  }
  async retry(id: string, u: JwtPayload) {
    await this.booking(id, u);
    return this.google.retry(id);
  }
  async catalog(u: JwtPayload) {
    const versions = await this.db.costCatalogVersion.findMany({
      where: { effectiveAt: { lte: new Date() } },
      orderBy: [{ key: 'asc' }, { version: 'desc' }],
      take: 1000,
    });
    const latest = [
      ...new Map(
        versions
          .slice()
          .reverse()
          .map((v) => [v.key, v]),
      ).values(),
    ].filter((v) => v.active);
    return latest.map((v) => {
      const details = v.details as Record<string, unknown>;
      if (admin(u)) return v;
      const safe = Object.fromEntries(
        Object.entries(details).filter(([key]) => !['cost', 'reason'].includes(key)),
      );
      return { ...v, details: safe };
    });
  }
  async catalogHistory(u: JwtPayload) {
    this.requireAdmin(u, 'finance.read');
    return this.db.costCatalogVersion.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  }
  async setCatalog(input: unknown, u: JwtPayload) {
    this.requireAdmin(u);
    const v = parse(catalogSchema, input);
    return this.db.$transaction(async (tx) => {
      const old = await tx.costCatalogVersion.findFirst({
        where: { key: v.key },
        orderBy: { version: 'desc' },
      });
      const row = await tx.costCatalogVersion.create({
        data: {
          key: v.key,
          version: (old?.version ?? 0) + 1,
          details: json(v),
          effectiveAt: new Date(v.effectiveAt),
          active: v.active,
          createdById: u.sub,
        },
      });
      await tx.financialChange.create({
        data: {
          entityType: 'CATALOG',
          entityId: row.id,
          reason: v.reason,
          previous: old?.details ?? {},
          next: json(v),
          editorId: u.sub,
        },
      });
      return row;
    });
  }
  async saveCosts(input: unknown, u: JwtPayload) {
    this.requireAdmin(u);
    const v = parse(snapshotSchema, input);
    const assignedCase = await this.caseAccess(v.patientId, v.leadId, u);
    if (new Set(v.exchangeRates.map((r) => r.from + ':' + r.to)).size !== v.exchangeRates.length)
      throw new BadRequestException('Use one recorded exchange rate per currency pair');
    const lines: Array<
      Parameters<typeof calculateCase>[0]['lines'][number] & {
        catalogId: string;
        name: string;
        catalogVersion: number;
        unit: string;
        provider: string;
        exception: unknown;
      }
    > = [];
    for (const item of v.lines) {
      const catalog = await this.db.costCatalogVersion.findUnique({
        where: { id: item.catalogId },
      });
      if (!catalog || !catalog.active || catalog.effectiveAt > new Date())
        throw new BadRequestException('Choose an active effective catalog version');
      const c = catalog.details as z.infer<typeof catalogSchema>;
      lines.push({
        ...item,
        name: c.name,
        category: c.category,
        currency: c.currency,
        sellingPrice: item.exception ? item.exception.sellingPrice : c.sellingPrice,
        cost: item.exception ? item.exception.cost : c.cost,
        catalogVersion: catalog.version,
        unit: c.unit,
        provider: c.provider,
      });
    }
    const totals = calculateCase({ ...v, lines });
    return this.db.$transaction(async (tx) => {
      const old = await tx.caseCostSnapshot.findFirst({
        where: { patientId: v.patientId, leadId: v.leadId, visit: v.visit },
        orderBy: { version: 'desc' },
      });
      const row = await tx.caseCostSnapshot.create({
        data: {
          patientId: v.patientId,
          leadId: v.leadId,
          visit: v.visit,
          version: (old?.version ?? 0) + 1,
          state: v.state,
          details: json({ ...v, lines, totals, assignedToId: assignedCase.assignedToId }),
          createdById: u.sub,
        },
      });
      await tx.financialChange.create({
        data: {
          entityType: 'CASE_COST',
          entityId: row.id,
          reason: v.reason,
          previous: old?.details ?? {},
          next: json(row.details),
          editorId: u.sub,
        },
      });
      return row;
    });
  }
  async costs(leadId: string, u: JwtPayload) {
    this.requireAdmin(u, 'finance.read');
    const lead = await this.db.lead.findFirst({
      where: { id: leadId, ...this.scope(u) },
      select: { patient: { select: { id: true } } },
    });
    if (!lead?.patient) throw new NotFoundException('Converted case not found');
    return this.db.caseCostSnapshot.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  async caseSummary(leadId: string, u: JwtPayload) {
    const snapshots = await this.costs(leadId, u);
    const latest = new Map<number, (typeof snapshots)[number]>();
    for (const snapshot of snapshots)
      if (!latest.has(snapshot.visit)) latest.set(snapshot.visit, snapshot);
    const visits = [...latest.values()].map((s) => ({
      visit: s.visit,
      state: s.state,
      ...(s.details as unknown as { totals: ReturnType<typeof calculateCase> }).totals,
    }));
    const commissions = await this.db.commissionEntry.findMany({
      where: { leadId, state: { not: 'REVERSED' } },
      take: 200,
    });
    const currencies = [...new Set(visits.map((v) => v.currency))];
    const fullCase = currencies.map((currency) => {
      const rows = visits.filter((v) => v.currency === currency);
      const missing = rows.flatMap((v) =>
        v.missing.filter(
          (m) => !m.startsWith('Actual cost') && m !== 'Commission policy/calculation',
        ),
      );
      const entries = commissions.filter((c) => c.currency === currency);
      const commission = entries.length
        ? entries.reduce((sum, c) => sum.add(c.amount), new D(0))
        : rows.every((v) => v.commission !== null)
          ? rows.reduce((sum, v) => sum.add(v.commission!), new D(0))
          : null;
      if (
        !commission ||
        entries.some((c) => c.state === 'ADJUSTED') ||
        commissions.some((c) => c.currency !== currency)
      )
        missing.push('Commission policy, currency allocation or adjustment review required');
      const sum = (key: 'revenue' | 'estimatedCost' | 'actualCost') =>
        rows.some((v) => v[key] === null)
          ? null
          : rows.reduce((total, v) => total.add(v[key]!), new D(0));
      const revenue = sum('revenue'),
        estimatedCost = sum('estimatedCost'),
        actualCost = sum('actualCost');
      return {
        currency,
        revenue: revenue?.toFixed(2) ?? null,
        estimatedCost: estimatedCost?.toFixed(2) ?? null,
        actualCost: actualCost?.toFixed(2) ?? null,
        commission: commission?.toFixed(2) ?? null,
        expectedContribution:
          !missing.length && revenue && estimatedCost && commission
            ? revenue.minus(estimatedCost).minus(commission).toFixed(2)
            : null,
        actualContribution:
          !missing.length && revenue && actualCost && commission
            ? revenue.minus(actualCost).minus(commission).toFixed(2)
            : null,
        missing: [...new Set(missing)],
        visits: rows.map((v) => v.visit),
      };
    });
    return {
      visits,
      fullCase,
      truncated: snapshots.length === 100 || commissions.length === 200,
      definition:
        'Each latest visit snapshot is counted once. Case commission comes from the commission ledger when available; amounts remain grouped by currency.',
    };
  }
  async compensation(u: JwtPayload) {
    this.requireAdmin(u, 'finance.read');
    return {
      rules: await this.db.compensationRule.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
      staff: await this.db.user.findMany({
        where: { isActive: true },
        select: { id: true, firstName: true, lastName: true, role: true },
      }),
    };
  }
  async rule(input: unknown, u: JwtPayload) {
    this.requireAdmin(u);
    if ((input as { staffId?: string } | null)?.staffId === 'ALL_ACTIVE') {
      const staff = await this.db.user.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      const rules = [];
      // Every employee receives an immutable version; future cases reuse that version.
      for (const employee of staff)
        rules.push(await this.singleRule({ ...(input as object), staffId: employee.id }, u));
      return { rules, appliedTo: staff.length };
    }
    return this.singleRule(input, u);
  }
  private async singleRule(input: unknown, u: JwtPayload) {
    const v = parse(compensationSchema, input);
    if (!(await this.db.user.findUnique({ where: { id: v.staffId }, select: { id: true } })))
      throw new BadRequestException('Unknown employee');
    if (v.tiers.some((t, i) => i > 0 && new D(t.threshold).lte(v.tiers[i - 1].threshold)))
      throw new BadRequestException('Tier thresholds must increase');
    return this.db.$transaction(async (tx) => {
      const old = await tx.compensationRule.findFirst({
        where: { staffId: v.staffId },
        orderBy: { version: 'desc' },
      });
      const rule = await tx.compensationRule.create({
        data: {
          staffId: v.staffId,
          version: (old?.version ?? 0) + 1,
          effectiveAt: new Date(v.effectiveAt),
          details: json(v),
          createdById: u.sub,
        },
      });
      await tx.financialChange.create({
        data: {
          entityType: 'COMPENSATION',
          entityId: rule.id,
          reason: v.reason,
          previous: old?.details ?? {},
          next: json(v),
          editorId: u.sub,
        },
      });
      return rule;
    });
  }
  async salary(month: string, u: JwtPayload) {
    this.requireAdmin(u);
    const { start, end } = this.month(month);
    const rules = await this.db.compensationRule.findMany({
      where: { effectiveAt: { lt: end } },
      orderBy: { effectiveAt: 'desc' },
      take: 1000,
    });
    const seen = new Set<string>();
    for (const rule of rules) {
      if (seen.has(rule.staffId)) continue;
      const r = rule.details as z.infer<typeof compensationSchema>;
      if (r.salaryAccrual === 'MONTH_START' && rule.effectiveAt > start) continue;
      seen.add(rule.staffId);
      await this.db.businessExpense.upsert({
        where: { dedupeKey: `salary:${rule.staffId}:${month}` },
        create: {
          month,
          kind: 'SALARY',
          staffId: rule.staffId,
          amount: r.salary,
          currency: r.currency,
          dedupeKey: `salary:${rule.staffId}:${month}`,
          details: json({
            ruleId: rule.id,
            version: rule.version,
            effectiveAt: rule.effectiveAt,
            monthPolicy: r.salaryAccrual,
          }),
          createdById: u.sub,
        },
        update: {},
      });
    }
    return { recorded: true, month, start };
  }
  async earnings(month: string, u: JwtPayload, staffId?: string) {
    const { start, end } = this.month(month);
    const id = admin(u) && staffId ? staffId : u.sub;
    const [commissions, salaries] = await Promise.all([
      this.db.commissionEntry.findMany({
        where: {
          staffId: id,
          OR: [
            { earnedAt: { gte: start, lt: end } },
            { paidAt: { gte: start, lt: end } },
            { earnedAt: null, createdAt: { gte: start, lt: end } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.db.businessExpense.findMany({ where: { staffId: id, month, kind: 'SALARY' }, take: 10 }),
    ]);
    return { commissions, salaries };
  }
  async commissionAction(id: string, input: unknown, u: JwtPayload) {
    this.requireAdmin(u);
    const v = parse(
      z.object({
        state: z.enum(['APPROVED', 'PAID', 'REVERSED', 'ADJUSTED']),
        reason: z.string().trim().min(3).max(1000),
        amount: decimal.optional(),
      }),
      input,
    );
    const old = await this.db.commissionEntry.findUniqueOrThrow({ where: { id } });
    if (v.state === 'PAID' && old.state !== 'APPROVED')
      throw new BadRequestException('Approve before recording payment');
    if (v.state === 'APPROVED' && !['EARNED', 'ADJUSTED'].includes(old.state))
      throw new BadRequestException('Only earned or reviewed adjustments may be approved');
    if (old.state === 'PAID')
      throw new BadRequestException(
        'Paid commission is immutable. Record a separate signed adjustment to preserve the payment history.',
      );
    if (v.amount && v.state !== 'ADJUSTED')
      throw new BadRequestException('An amount change requires an explicit audited adjustment');
    if (v.state === 'ADJUSTED' && !v.amount)
      throw new BadRequestException('Enter the adjusted amount');
    return this.db.$transaction(async (tx) => {
      const next = await tx.commissionEntry.update({
        where: { id },
        data: {
          state: v.state,
          ...(v.state === 'APPROVED' && !old.earnedAt ? { earnedAt: new Date() } : {}),
          ...(v.amount ? { amount: v.amount } : {}),
          ...(v.state === 'APPROVED' ? { approvedAt: new Date() } : {}),
          ...(v.state === 'PAID' ? { paidAt: new Date() } : {}),
          calculation: json({
            ...(old.calculation as object),
            adjustment: {
              reason: v.reason,
              editor: u.sub,
              at: new Date().toISOString(),
              previousAmount: old.amount.toString(),
              previousState: old.state,
            },
          }),
        },
      });
      await tx.financialChange.create({
        data: {
          entityType: 'COMMISSION',
          entityId: id,
          reason: v.reason,
          previous: json(old),
          next: json(next),
          editorId: u.sub,
        },
      });
      return next;
    });
  }
  async expense(input: unknown, u: JwtPayload) {
    this.requireAdmin(u);
    const v = parse(
      z.object({
        id: z.string().uuid().optional(),
        month: z.string(),
        kind: z.enum(['FIXED', 'VARIABLE', 'OTHER']),
        amount: decimal,
        currency,
        status: z.enum(['PAID', 'UNPAID']),
        description: z.string().trim().min(3).max(1000),
        reason: z.string().trim().min(3).max(1000),
      }),
      input,
    );
    this.month(v.month);
    const dedupeKey = v.id ?? randomUUID();
    const row = await this.db.businessExpense.upsert({
      where: { dedupeKey },
      create: {
        month: v.month,
        kind: v.kind,
        amount: v.amount,
        currency: v.currency,
        status: v.status,
        details: json(v),
        dedupeKey,
        createdById: u.sub,
      },
      update: {},
    });
    return row;
  }
  async expenses(month: string, u: JwtPayload, page = 1) {
    this.requireAdmin(u);
    this.month(month);
    const [data, total] = await Promise.all([
      this.db.businessExpense.findMany({
        where: { month },
        orderBy: { createdAt: 'desc' },
        take: 30,
        skip: (page - 1) * 30,
      }),
      this.db.businessExpense.count({ where: { month } }),
    ]);
    return { data, total, page };
  }
  async expenseStatus(id: string, input: unknown, u: JwtPayload) {
    this.requireAdmin(u);
    const v = parse(
      z.object({ status: z.enum(['PAID', 'UNPAID']), reason: z.string().trim().min(3).max(1000) }),
      input,
    );
    return this.db.$transaction(async (tx) => {
      const old = await tx.businessExpense.findUniqueOrThrow({ where: { id } });
      const row = await tx.businessExpense.update({
        where: { id },
        data: {
          status: v.status,
          details: json({
            ...(old.details as object),
            paymentStatusChangedAt: new Date().toISOString(),
            paymentStatusEditor: u.sub,
          }),
        },
      });
      await tx.financialChange.create({
        data: {
          entityType: 'BUSINESS_EXPENSE',
          entityId: id,
          previous: json(old),
          next: json(row),
          reason: v.reason,
          editorId: u.sub,
        },
      });
      return row;
    });
  }
  async commissionAdjustment(id: string, input: unknown, u: JwtPayload) {
    this.requireAdmin(u);
    const v = parse(
      z.object({
        requestId: z.string().uuid(),
        amount: z
          .string()
          .regex(/^-?\d{1,12}(\.\d{1,2})?$/)
          .refine((n) => !new D(n).isZero()),
        reason: z.string().trim().min(3).max(1000),
      }),
      input,
    );
    const original = await this.db.commissionEntry.findUniqueOrThrow({ where: { id } });
    if (!['APPROVED', 'PAID'].includes(original.state))
      throw new BadRequestException('Separate adjustments apply to approved or paid entries');
    return this.db.$transaction(async (tx) => {
      const key = `${original.dedupeKey}:adjust:manual:${v.requestId}`;
      const existing = await tx.commissionEntry.findUnique({ where: { dedupeKey: key } });
      if (existing) {
        const data = existing.calculation as { adjustsEntryId?: string; reason?: string };
        if (
          data.adjustsEntryId !== id ||
          !existing.amount.equals(v.amount) ||
          data.reason !== v.reason
        )
          throw new ConflictException('Adjustment request already used with different details');
        return existing;
      }
      const row = await tx.commissionEntry.create({
        data: {
          staffId: original.staffId,
          patientId: original.patientId,
          leadId: original.leadId,
          ruleId: original.ruleId,
          dedupeKey: key,
          amount: v.amount,
          currency: original.currency,
          state: 'ADJUSTED',
          calculation: json({
            adjustsEntryId: id,
            adjustment: true,
            reason: v.reason,
            editor: u.sub,
            previousState: original.state,
            previousAmount: original.amount.toString(),
          }),
        },
      });
      await tx.financialChange.create({
        data: {
          entityType: 'COMMISSION_ADJUSTMENT',
          entityId: row.id,
          reason: v.reason,
          previous: json(original),
          next: json(row),
          editorId: u.sub,
        },
      });
      return row;
    });
  }
  async commissions(month: string, u: JwtPayload, page = 1) {
    this.requireAdmin(u);
    const { start, end } = this.month(month);
    const where = {
      OR: [
        { createdAt: { gte: start, lt: end } },
        { earnedAt: { gte: start, lt: end } },
        { paidAt: { gte: start, lt: end } },
      ],
    };
    const [data, total] = await Promise.all([
      this.db.commissionEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 30,
        skip: (page - 1) * 30,
      }),
      this.db.commissionEntry.count({ where }),
    ]);
    return { data, total, page };
  }
  async sharedCommission(input: unknown, u: JwtPayload) {
    this.requireAdmin(u);
    const v = parse(
      z.object({
        patientId: z.string().uuid(),
        leadId: z.string().uuid(),
        visit: z.number().int().min(0).max(2),
        currency,
        allocations: z
          .array(z.object({ staffId: z.string().uuid(), amount: decimal }))
          .min(1)
          .max(20),
        reason: z.string().trim().min(3).max(1000),
      }),
      input,
    );
    await this.caseAccess(v.patientId, v.leadId, u);
    if (new Set(v.allocations.map((a) => a.staffId)).size !== v.allocations.length)
      throw new BadRequestException('Each employee may appear once in a shared allocation');
    const rules = await Promise.all(
      v.allocations.map((a) =>
        this.db.compensationRule.findFirst({
          where: { staffId: a.staffId, effectiveAt: { lte: new Date() } },
          orderBy: { effectiveAt: 'desc' },
        }),
      ),
    );
    for (const rule of rules) {
      const policy = rule?.details as z.infer<typeof compensationSchema> | undefined;
      if (
        !policy ||
        policy.attribution !== 'MANUAL_SHARED' ||
        policy.currency !== v.currency ||
        (policy.scope === 'PER_CASE' ? v.visit !== 0 : v.visit === 0)
      )
        throw new BadRequestException(
          'Every allocation requires an effective shared-attribution policy with matching currency and case/visit scope',
        );
    }
    return this.db.$transaction(async (tx) => {
      const rows = [];
      for (const [i, allocation] of v.allocations.entries()) {
        const dedupeKey = `commission:${v.leadId}:${v.visit}:share:${allocation.staffId}`;
        const old = await tx.commissionEntry.findUnique({ where: { dedupeKey } });
        if (old && ['APPROVED', 'PAID'].includes(old.state))
          throw new BadRequestException(
            'Approved shared allocations require separate signed adjustments',
          );
        const row = await tx.commissionEntry.upsert({
          where: { dedupeKey },
          create: {
            ...allocation,
            patientId: v.patientId,
            leadId: v.leadId,
            ruleId: rules[i]!.id,
            currency: v.currency,
            dedupeKey,
            state: 'ADJUSTED',
            calculation: json({
              policy: rules[i]!.details,
              adjustment: true,
              sharedAllocation: true,
              visit: v.visit,
              reason: v.reason,
              editor: u.sub,
            }),
          },
          update: {
            amount: allocation.amount,
            state: 'ADJUSTED',
            calculation: json({
              policy: rules[i]!.details,
              adjustment: true,
              sharedAllocation: true,
              visit: v.visit,
              reason: v.reason,
              editor: u.sub,
            }),
          },
        });
        await tx.financialChange.create({
          data: {
            entityType: 'SHARED_COMMISSION',
            entityId: row.id,
            previous: old ? json(old) : {},
            next: json(row),
            reason: v.reason,
            editorId: u.sub,
          },
        });
        rows.push(row);
      }
      return rows;
    });
  }
  async audit(u: JwtPayload) {
    this.requireAdmin(u, 'finance.read');
    return this.db.financialChange.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }
  @Cron('15 * * * * *') async syncCommissions() {
    if (
      this.running ||
      !(
        this.config.get('NODE_ENV') === 'production' ||
        this.config.get('TRAVEL_WORKER_ENABLED') === 'true'
      )
    )
      return;
    this.running = true;
    try {
      const work = await this.db.caseCalculationWork.findMany({
        where: {
          nextAt: { lte: new Date() },
          processedRevision: { lt: this.db.caseCalculationWork.fields.revision },
        },
        orderBy: { nextAt: 'asc' },
        take: 20,
      });
      for (const item of work) {
        try {
          await this.reconcileCommissions([item.leadId]);
          await this.db.caseCalculationWork.update({
            where: { leadId: item.leadId },
            data: { processedRevision: item.revision, error: null },
          });
        } catch (e) {
          await this.db.caseCalculationWork.update({
            where: { leadId: item.leadId },
            data: {
              error: (e as Error).message.slice(0, 500),
              nextAt: new Date(Date.now() + 60000),
            },
          });
        }
      }
    } finally {
      this.running = false;
    }
  }
  async reconcileCommissions(leadIds: string[] = []) {
    if (!leadIds.length) return;
    const snapshots = await this.db.caseCostSnapshot.findMany({
      where: { state: 'CONFIRMED', leadId: { in: leadIds } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const cases = new Map<string, typeof snapshots>();
    for (const s of snapshots) {
      const list = cases.get(s.leadId) ?? [];
      if (!list.some((v) => v.visit === s.visit)) list.push(s);
      cases.set(s.leadId, list);
    }
    for (const [leadId, versions] of cases) {
      const lead = await this.db.lead.findUnique({
        where: { id: leadId },
        select: { assignedToId: true, createdAt: true, stage: true },
      });
      if (!lead?.assignedToId) continue;
      const prior = await this.db.commissionEntry.findFirst({
        where: { leadId, NOT: { dedupeKey: { contains: ':adjust:' } } },
        orderBy: { createdAt: 'asc' },
      });
      const originals = await this.db.caseCostSnapshot.findFirst({
        where: { leadId, state: 'CONFIRMED' },
        orderBy: { createdAt: 'asc' },
      });
      const frozenPrior = prior && prior.state !== 'ESTIMATED' ? prior : null;
      let rule = frozenPrior
        ? await this.db.compensationRule.findUnique({ where: { id: frozenPrior.ruleId } })
        : await this.db.compensationRule.findFirst({
            where: {
              staffId: lead.assignedToId,
              effectiveAt: { lte: originals?.createdAt ?? new Date() },
            },
            orderBy: { effectiveAt: 'desc' },
          });
      if (!rule) continue;
      let policy =
        (frozenPrior?.calculation as { policy?: z.infer<typeof compensationSchema> } | undefined)
          ?.policy ?? (rule.details as z.infer<typeof compensationSchema>);
      if (policy.attribution === 'MANUAL_SHARED') continue;
      if (policy.attribution === 'ORIGINAL_SALESPERSON') {
        const originalStaff =
          prior?.staffId ??
          (originals?.details as { assignedToId?: string } | undefined)?.assignedToId;
        if (!originalStaff) continue;
        if (!prior && originalStaff !== lead.assignedToId) {
          const originalRule = await this.db.compensationRule.findFirst({
            where: { staffId: originalStaff, effectiveAt: { lte: originals!.createdAt } },
            orderBy: { effectiveAt: 'desc' },
          });
          if (!originalRule) continue;
          rule = originalRule;
          policy = rule.details as z.infer<typeof compensationSchema>;
        }
        lead.assignedToId = originalStaff;
      } else if (prior && prior.state !== 'ESTIMATED') lead.assignedToId = prior.staffId;
      const groups = policy.scope === 'PER_VISIT' ? versions.map((v) => [v]) : [versions];
      for (const group of groups) {
        const visit = policy.scope === 'PER_VISIT' ? group[0].visit : 0;
        const key = `commission:${leadId}:${visit}`;
        const old = await this.db.commissionEntry.findUnique({ where: { dedupeKey: key } });
        if (old && old.state !== 'ESTIMATED') {
          policy =
            (old.calculation as { policy?: z.infer<typeof compensationSchema> }).policy ?? policy;
          const frozen = await this.db.compensationRule.findUnique({ where: { id: old.ruleId } });
          if (frozen) rule = frozen;
        }
        if (old && (old.calculation as { adjustment?: unknown }).adjustment) continue;
        const bookings = await this.db.travelBooking.findMany({
          where: { leadId, ...(visit ? { visit } : {}) },
          select: { status: true, visit: true, updatedAt: true },
        });
        const cancelled = bookings.length > 0 && bookings.every((b) => b.status === 'CANCELLED');
        const payments = await this.db.payment.findMany({
          where: {
            invoice: { patientId: group[0].patientId, status: { not: 'CANCELLED' } },
            ...(visit ? { visitNumber: visit } : {}),
          },
          select: { amount: true, currency: true, status: true, id: true },
        });
        const refunded = payments.filter((p) => p.status === 'REFUNDED');
        let basis = new D(0),
          missing = false;
        for (const snap of group) {
          const data = snap.details as unknown as z.infer<typeof snapshotSchema> & {
            lines: {
              category: string;
              currency: string;
              quantity: string;
              sellingPrice: string | null;
              included: boolean;
            }[];
            totals: {
              revenue: string | null;
              estimatedCost: string | null;
              expectedContribution: string | null;
            };
          };
          if (data.currency !== policy.currency) {
            missing = true;
            break;
          }
          if (policy.basis === 'AGREED_REVENUE') {
            if (data.totals.revenue === null) {
              missing = true;
              break;
            }
            basis = basis.add(data.totals.revenue);
            if (data.mode === 'PACKAGE' && policy.excludedCategories.some((c) => c !== 'TAX')) {
              missing = true;
              break;
            }
            for (const line of data.lines) {
              if (
                !line.included &&
                policy.excludedCategories.includes(line.category as 'HOTEL') &&
                line.sellingPrice
              ) {
                if (line.currency !== policy.currency) {
                  missing = true;
                  break;
                }
                basis = basis.minus(new D(line.sellingPrice).mul(line.quantity));
              }
            }
          } else if (policy.basis === 'DEFINED_PROFIT') {
            if (
              data.totals.revenue === null ||
              data.totals.estimatedCost === null ||
              policy.excludedCategories.some((c) => c !== 'TAX')
            ) {
              missing = true;
              break;
            }
            basis = basis.add(new D(data.totals.revenue!).minus(data.totals.estimatedCost!));
          }
        }
        if (policy.basis === 'COLLECTED_REVENUE') {
          if (policy.excludedCategories.some((c) => c !== 'TAX')) {
            missing = true;
          } else
            for (const p of payments.filter((p) => p.status === 'COMPLETED')) {
              if (p.currency !== policy.currency) {
                missing = true;
                break;
              }
              basis = basis.add(p.amount);
            }
        }
        if (missing) continue;
        const paid = payments.some((p) => p.status === 'COMPLETED' && p.amount.gt(0));
        const earned =
          policy.trigger === 'BOOKING'
            ? bookings.some((b) => ['CONFIRMED', 'ARRIVED', 'COMPLETED'].includes(b.status))
            : policy.trigger === 'ARRIVAL'
              ? bookings.some((b) => ['ARRIVED', 'COMPLETED'].includes(b.status))
              : policy.trigger === 'COMPLETED_TREATMENT'
                ? visit
                  ? bookings.some((b) => b.status === 'COMPLETED')
                  : lead.stage === 'DONE'
                : paid;
        let percentage = policy.percentage;
        for (const tier of policy.tiers)
          if (basis.gte(tier.threshold)) percentage = tier.percentage;
        let amount = new D(policy.fixed)
          .add(D.max(0, basis).mul(percentage).div(100))
          .toDecimalPlaces(2, D.ROUND_HALF_UP);
        let state = earned ? 'EARNED' : 'ESTIMATED';
        if (cancelled && policy.cancellation === 'KEEP_EARNED' && old && old.state !== 'ESTIMATED')
          state = old.state;
        if (cancelled && policy.cancellation === 'REVERSE') state = 'REVERSED';
        if (cancelled && policy.cancellation === 'MANUAL_REVIEW') state = 'ADJUSTED';
        if (refunded.length) {
          if (policy.refund === 'REVERSE') state = 'REVERSED';
          else if (policy.refund === 'MANUAL_REVIEW') state = 'ADJUSTED';
          else {
            if (
              refunded.some((p) => p.currency !== policy.currency) ||
              policy.basis !== 'AGREED_REVENUE' ||
              basis.lte(0)
            ) {
              state = 'ADJUSTED';
            } else {
              const refund = refunded.reduce((sum, p) => sum.add(p.amount), new D(0));
              amount = amount
                .mul(D.max(0, basis.minus(refund)))
                .div(basis)
                .toDecimalPlaces(2, D.ROUND_HALF_UP);
              state = 'ADJUSTED';
            }
          }
        }
        const calculation = json({
          policy,
          ruleId: rule.id,
          ruleVersion: rule.version,
          basis: basis.toFixed(2),
          percentage,
          snapshotIds: group.map((s) => s.id),
          paymentIds: payments.map((p) => p.id),
          attribution: old?.staffId ?? lead.assignedToId,
          reviewRequired: state === 'ADJUSTED',
          notes:
            'Inclusion/exclusion or shared-attribution combinations without a defined allocation remain uncalculated.',
        });
        if (old && ['APPROVED', 'PAID'].includes(old.state)) {
          const adjustments = await this.db.commissionEntry.findMany({
            where: { leadId, dedupeKey: { startsWith: key + ':adjust:' } },
            select: { amount: true, calculation: true },
          });
          // A protected administrator exception must not be silently undone by the next sweep.
          if (
            adjustments.some(
              (a) => (a.calculation as { adjustment?: boolean } | undefined)?.adjustment,
            )
          )
            continue;
          const recorded = adjustments.reduce((sum, a) => sum.add(a.amount), new D(old.amount));
          const target = state === 'REVERSED' ? new D(0) : amount;
          const delta = target.minus(recorded).toDecimalPlaces(2, D.ROUND_HALF_UP);
          if (!delta.isZero()) {
            const eventKey = createHash('sha256')
              .update(
                JSON.stringify({
                  payments: payments.map((p) => [p.id, p.status, p.amount.toString()]).sort(),
                  bookings: bookings.map((b) => [b.visit, b.status]).sort(),
                  target: target.toFixed(2),
                }),
              )
              .digest('hex');
            await this.db.commissionEntry.upsert({
              where: { dedupeKey: key + ':adjust:' + eventKey },
              create: {
                staffId: old.staffId,
                patientId: old.patientId,
                leadId,
                ruleId: old.ruleId,
                dedupeKey: key + ':adjust:' + eventKey,
                amount: delta,
                currency: old.currency,
                state: state === 'ADJUSTED' ? 'ADJUSTED' : 'EARNED',
                earnedAt: state === 'ADJUSTED' ? null : new Date(),
                calculation: json({
                  ...(calculation as object),
                  adjustsEntryId: old.id,
                  previousPaidAmount: old.amount.toString(),
                  reason: cancelled
                    ? 'Cancellation'
                    : refunded.length
                      ? 'Refund'
                      : 'Additional eligible collection',
                }),
              },
              update: {},
            });
          }
          continue;
        }
        if (old && (old.amount.toString() !== amount.toString() || old.state !== state)) {
          await this.db.financialChange.create({
            data: {
              entityType: 'COMMISSION_AUTO',
              entityId: old.id,
              reason: cancelled
                ? 'Configured cancellation policy'
                : refunded.length
                  ? 'Configured refund policy'
                  : 'Configured eligibility or collection update',
              previous: json(old),
              next: json({ amount: amount.toFixed(2), state, calculation }),
              editorId: rule.createdById,
            },
          });
        }
        await this.db.commissionEntry.upsert({
          where: { dedupeKey: key },
          create: {
            staffId: lead.assignedToId,
            patientId: group[0].patientId,
            leadId,
            ruleId: rule.id,
            dedupeKey: key,
            amount,
            currency: policy.currency,
            state,
            earnedAt: state === 'EARNED' ? new Date() : null,
            calculation,
          },
          update: {
            amount,
            state,
            calculation,
            ...(state === 'EARNED' && !old?.earnedAt ? { earnedAt: new Date() } : {}),
            ...(old?.state === 'ESTIMATED' ? { staffId: lead.assignedToId, ruleId: rule.id } : {}),
          },
        });
      }
    }
  }
  async overview(month: string, u: JwtPayload) {
    this.requireAdmin(u, 'finance.read');
    const { start, end } = this.month(month);
    const [
      payments,
      invoices,
      expenses,
      commissions,
      bookingCounts,
      snapshots,
      earnedCommissions,
      paidCommissions,
      patientCounts,
    ] = await Promise.all([
      this.db.payment.groupBy({
        by: ['currency', 'status'],
        where: { paidAt: { gte: start, lt: end } },
        _sum: { amount: true },
      }),
      this.db.invoice.findMany({
        where: { status: { not: 'CANCELLED' }, createdAt: { gte: start, lt: end } },
        select: {
          currency: true,
          patientId: true,
          total: true,
          payments: { where: { status: 'COMPLETED' }, select: { amount: true, currency: true } },
        },
      }),
      this.db.businessExpense.groupBy({
        by: ['currency', 'kind', 'status'],
        where: { month },
        _sum: { amount: true },
      }),
      this.db.commissionEntry.groupBy({
        by: ['currency', 'state'],
        where: { createdAt: { gte: start, lt: end } },
        _sum: { amount: true },
      }),
      this.db.travelBooking.groupBy({
        by: ['status'],
        where: { arrivalAt: { gte: start, lt: end } },
        _count: true,
      }),
      this.db.caseCostSnapshot.findMany({
        where: { state: 'CONFIRMED', details: { path: ['reportMonth'], equals: month } },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      }),
      this.db.commissionEntry.groupBy({
        by: ['currency'],
        where: {
          earnedAt: { gte: start, lt: end },
          state: { in: ['EARNED', 'APPROVED', 'PAID'] },
        },
        _sum: { amount: true },
      }),
      this.db.commissionEntry.groupBy({
        by: ['currency'],
        where: {
          paidAt: { gte: start, lt: end },
        },
        _sum: { amount: true },
      }),
      this.db.$queryRaw<{ booked: bigint; arrived: bigint }[]>(Prisma.sql`SELECT
          COUNT(DISTINCT "patientId") FILTER (WHERE status IN ('CONFIRMED','ARRIVED','COMPLETED'))::bigint AS booked,
          COUNT(DISTINCT "patientId") FILTER (WHERE status IN ('ARRIVED','COMPLETED'))::bigint AS arrived
          FROM travel_bookings WHERE "arrivalAt">=${start} AND "arrivalAt"<${end}`),
    ]);
    const latest = new Map<string, (typeof snapshots)[number]>();
    for (const s of snapshots)
      if (!latest.has(s.leadId + ':' + s.visit)) latest.set(s.leadId + ':' + s.visit, s);
    const cases = [...latest.values()].map((s) => ({
      leadId: s.leadId,
      patientId: s.patientId,
      visit: s.visit,
      ...(s.details as unknown as { totals: ReturnType<typeof calculateCase> }).totals,
    }));
    const outstanding: Record<string, string> = {};
    const mixedPayments: string[] = [];
    const costPatients = new Set(cases.map((c) => c.patientId));
    const missingCaseCosts = invoices.filter((i) => !costPatients.has(i.patientId)).length;
    for (const i of invoices) {
      if (i.payments.some((p) => p.currency !== i.currency)) {
        mixedPayments.push(
          'Invoice with payments in a different currency; reconciliation rate required',
        );
        continue;
      }
      const paid = i.payments.reduce((sum, p) => sum.add(p.amount), new D(0));
      outstanding[i.currency] = new D(outstanding[i.currency] ?? 0)
        .add(D.max(0, i.total.minus(paid)))
        .toFixed(2);
    }
    return {
      month,
      payments,
      invoicesQuoted: invoices.reduce(
        (result, i) => ({
          ...result,
          [i.currency]: new D(result[i.currency] ?? 0).add(i.total).toFixed(2),
        }),
        {} as Record<string, string>,
      ),
      outstanding,
      expenses,
      commissions,
      bookingCounts,
      bookedPatients: Number(patientCounts[0]?.booked ?? 0),
      arrivedPatients: Number(patientCounts[0]?.arrived ?? 0),
      cases,
      earnedCommissions,
      paidCommissions,
      missingCaseCosts,
      operatingTotals: monthlyFinance(
        cases,
        expenses,
        earnedCommissions,
        snapshots.length === 1000,
      ).map((row) =>
        missingCaseCosts
          ? {
              ...row,
              monthlyOperatingProfit: null,
              missing: [
                ...row.missing,
                'Monthly invoices have no confirmed cost recognition record',
              ],
            }
          : row,
      ),
      mixedPayments,
      limits:
        snapshots.length === 1000
          ? 'Cost report limit reached; export/pagination required for complete totals'
          : null,
      definition:
        'Quoted invoices and collected payments are separate. Values remain grouped by original currency. Case contribution uses frozen visit costs; salary is a separate monthly expense. Operating profit requires complete actual costs and defined FX rates.',
    };
  }
}
