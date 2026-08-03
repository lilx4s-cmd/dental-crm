import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeadStatus, PipelineStage } from '@dental-crm/shared';

/**
 * A merged duplicate is not a lead any more.
 *
 * Duplicate cleanup folds a deal into a survivor and keeps the row for its history. The board and
 * every list filter these out; the dashboard did not, so folded duplicates were counted in the
 * lead totals and — worse — in the denominator of the conversion rate. Cleaning the pipeline was
 * making the number that describes it look worse.
 */
const LIVE_LEAD = { mergedIntoId: null } satisfies Prisma.LeadWhereInput;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Interactive transaction rather than the array form: the array form erases groupBy's result
    // type, and these six figures are read together so they should describe one instant.
    const { leadsToday, leadStatusCounts, patientsTotal, pipelineValue, appointmentsToday } =
      await this.prisma.$transaction(async (tx) => {
        const [leadsToday, leadStatusCounts, patientsTotal, pipelineValue, appointmentsToday] =
          await Promise.all([
            tx.lead.count({ where: { ...LIVE_LEAD, createdAt: { gte: todayStart } } }),
            // One grouped query where three counts stood: active, won, and the all-time total
            // that divides into the conversion rate.
            tx.lead.groupBy({ by: ['status'], where: LIVE_LEAD, _count: { _all: true } }),
            tx.patient.count({ where: { isActive: true } }),
            tx.lead.aggregate({
              where: { ...LIVE_LEAD, status: LeadStatus.ACTIVE },
              _sum: { estimatedValue: true },
            }),
            tx.appointment.count({
              where: { startTime: { gte: todayStart, lte: todayEnd }, status: { not: 'CANCELLED' } },
            }),
          ]);
        return { leadsToday, leadStatusCounts, patientsTotal, pipelineValue, appointmentsToday };
      });

    const byStatus = new Map(leadStatusCounts.map((g) => [g.status, g._count._all]));
    const leadsTotal = byStatus.get(LeadStatus.ACTIVE) ?? 0;
    const wonLeads = byStatus.get(LeadStatus.WON) ?? 0;
    const totalLeadsEver = Array.from(byStatus.values()).reduce((sum, n) => sum + n, 0);

    const conversionRate = totalLeadsEver > 0 ? Math.round((wonLeads / totalLeadsEver) * 100) : 0;

    return {
      leadsToday,
      leadsTotal,
      patientsTotal,
      conversionRate,
      // Sums every currency into one figure. Left as-is for now because the dashboard has one slot
      // for it; the honest fix is a per-currency breakdown, which belongs with the reporting phase.
      pipelineValueTotal: Number(pipelineValue._sum.estimatedValue ?? 0),
      appointmentsToday,
    };
  }

  /**
   * Counts and pipeline value per stage.
   *
   * Grouped in the database. This used to load every active lead — with a joined assignee — and
   * then walk the whole array once per stage in JavaScript, which is fourteen passes over the
   * pipeline to produce fourteen numbers.
   */
  async getPipelineGroups() {
    const grouped = await this.prisma.lead.groupBy({
      by: ['stage'],
      where: { ...LIVE_LEAD, status: LeadStatus.ACTIVE },
      _count: { _all: true },
      _sum: { estimatedValue: true },
    });

    const byStage = new Map(grouped.map((g) => [g.stage, g]));
    // Every stage is returned even at zero, so the chart keeps a stable axis instead of losing a
    // bar whenever a stage empties.
    return Object.values(PipelineStage).map((stage) => {
      const row = byStage.get(stage);
      return {
        stage,
        count: row?._count._all ?? 0,
        totalValue: Number(row?._sum.estimatedValue ?? 0),
      };
    });
  }
}
