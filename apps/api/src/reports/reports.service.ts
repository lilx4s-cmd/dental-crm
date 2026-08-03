import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { $Enums, Prisma } from '@prisma/client';
import { subMonths, startOfMonth, format } from 'date-fns';

/**
 * A merged duplicate is not a lead any more.
 *
 * Duplicate cleanup folds a deal into a survivor and leaves the row in place, carrying its history.
 * The board and every list already filter these out, but the reports did not — so 242 folded
 * duplicates were still counted in every stage of the funnel and in the denominator of the
 * conversion rate. A cleanup that improves the pipeline must not make the numbers describing it
 * worse.
 */
const LIVE_LEAD = { mergedIntoId: null } satisfies Prisma.LeadWhereInput;

/** Guards the month window used to build raw date_trunc queries. */
function safeMonths(months: number): number {
  if (!Number.isFinite(months)) return 12;
  return Math.min(60, Math.max(1, Math.trunc(months)));
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Monthly revenue from completed payments.
   *
   * One grouped query. This was a `for` loop issuing an aggregate per month and awaiting each in
   * turn — twelve sequential round-trips to Supabase to draw one chart, and the latency was the
   * sum of them rather than the slowest.
   *
   * Raw SQL because the grouping key is a derived month, which Prisma's groupBy cannot express.
   * The only interpolation is the window start, passed as a bound parameter.
   */
  async getMonthlyRevenue(months = 12) {
    const window = safeMonths(months);
    const windowStart = startOfMonth(subMonths(new Date(), window - 1));

    const rows = await this.prisma.$queryRaw<{ month: Date; revenue: Prisma.Decimal | null }[]>`
      SELECT date_trunc('month', "paidAt") AS month, SUM(amount) AS revenue
      FROM payments
      WHERE status = ${$Enums.PaymentStatus.COMPLETED}::"PaymentStatus"
        AND "paidAt" >= ${windowStart}
      GROUP BY 1
      ORDER BY 1
    `;

    // Months with no payments are absent from a grouped result and must still appear on the chart,
    // otherwise a quiet month silently shortens the axis instead of showing a trough.
    const byMonth = new Map(rows.map((r) => [format(new Date(r.month), 'yyyy-MM'), Number(r.revenue ?? 0)]));
    return Array.from({ length: window }, (_, i) => {
      const ref = subMonths(new Date(), window - 1 - i);
      return { month: format(ref, 'MMM yy'), revenue: byMonth.get(format(ref, 'yyyy-MM')) ?? 0 };
    });
  }

  /** Appointment counts by status. One grouped query, previously one count per enum value. */
  async getAppointmentStats() {
    const grouped = await this.prisma.appointment.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    return grouped
      .map((g) => ({ status: g.status, count: g._count._all }))
      .filter((r) => r.count > 0);
  }

  /**
   * New patients per month, with a running total.
   *
   * Same shape as revenue: one grouped query plus a baseline count, where this was thirteen
   * sequential ones.
   */
  async getPatientGrowth(months = 12) {
    const window = safeMonths(months);
    const windowStart = startOfMonth(subMonths(new Date(), window - 1));

    const [before, rows] = await Promise.all([
      this.prisma.patient.count({ where: { createdAt: { lt: windowStart }, isActive: true } }),
      this.prisma.$queryRaw<{ month: Date; added: bigint }[]>`
        SELECT date_trunc('month', "createdAt") AS month, COUNT(*) AS added
        FROM patients
        WHERE "isActive" = true AND "createdAt" >= ${windowStart}
        GROUP BY 1
        ORDER BY 1
      `,
    ]);

    const byMonth = new Map(rows.map((r) => [format(new Date(r.month), 'yyyy-MM'), Number(r.added)]));
    let running = before;
    return Array.from({ length: window }, (_, i) => {
      const ref = subMonths(new Date(), window - 1 - i);
      const newPatients = byMonth.get(format(ref, 'yyyy-MM')) ?? 0;
      running += newPatients;
      return { month: format(ref, 'MMM yy'), newPatients, total: running };
    });
  }

  /**
   * The pipeline funnel.
   *
   * Two queries rather than twelve, and both now exclude merged duplicates — which were inflating
   * every stage and, worse, the denominator of the conversion rate that management reads.
   */
  async getLeadFunnel() {
    const [grouped, statuses] = await Promise.all([
      this.prisma.lead.groupBy({ by: ['stage'], where: LIVE_LEAD, _count: { _all: true } }),
      this.prisma.lead.groupBy({ by: ['status'], where: LIVE_LEAD, _count: { _all: true } }),
    ]);

    const counts = new Map(grouped.map((g) => [g.stage, g._count._all]));
    // Every stage is listed even at zero: a funnel with stages missing reads as a shorter pipeline
    // rather than an empty step.
    const stages = Object.values($Enums.PipelineStage).map((stage) => ({
      stage,
      count: counts.get(stage) ?? 0,
    }));

    const byStatus = new Map(statuses.map((s) => [s.status, s._count._all]));
    const won = byStatus.get($Enums.LeadStatus.WON) ?? 0;
    const lost = byStatus.get($Enums.LeadStatus.LOST) ?? 0;
    const total = Array.from(byStatus.values()).reduce((sum, n) => sum + n, 0);

    return {
      stages,
      summary: { won, lost, total, conversionRate: total > 0 ? Math.round((won / total) * 100) : 0 },
    };
  }

  /** Top-level KPI snapshot */
  async getKpiSnapshot() {
    const now = new Date();
    const monthStart = startOfMonth(now);

    const [
      totalPatients,
      newPatientsThisMonth,
      totalRevenue,
      revenueThisMonth,
      totalInvoices,
      overdueInvoices,
      appointmentCounts,
    ] = await Promise.all([
      this.prisma.patient.count({ where: { isActive: true } }),
      this.prisma.patient.count({ where: { isActive: true, createdAt: { gte: monthStart } } }),
      this.prisma.payment.aggregate({
        where: { status: $Enums.PaymentStatus.COMPLETED },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: { status: $Enums.PaymentStatus.COMPLETED, paidAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
      this.prisma.invoice.count(),
      this.prisma.invoice.count({ where: { status: $Enums.InvoiceStatus.OVERDUE } }),
      // One grouped query in place of three separate counts over the same table.
      this.prisma.appointment.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

    const byStatus = new Map(appointmentCounts.map((g) => [g.status, g._count._all]));
    const totalAppointments = Array.from(byStatus.values()).reduce((sum, n) => sum + n, 0);
    const completedAppointments = byStatus.get($Enums.AppointmentStatus.COMPLETED) ?? 0;
    const cancelledAppointments = byStatus.get($Enums.AppointmentStatus.CANCELLED) ?? 0;

    return {
      totalPatients,
      newPatientsThisMonth,
      totalRevenue: Number(totalRevenue._sum.amount ?? 0),
      revenueThisMonth: Number(revenueThisMonth._sum.amount ?? 0),
      totalInvoices,
      overdueInvoices,
      totalAppointments,
      completedAppointments,
      cancelledAppointments,
      completionRate: totalAppointments > 0
        ? Math.round((completedAppointments / totalAppointments) * 100)
        : 0,
    };
  }
}
