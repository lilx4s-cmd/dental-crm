import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { $Enums } from '@prisma/client';
import { subMonths, startOfMonth, endOfMonth, format } from 'date-fns';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Monthly revenue (completed payments) for the last N months */
  async getMonthlyRevenue(months = 12) {
    const rows: { month: string; revenue: number }[] = [];

    for (let i = months - 1; i >= 0; i--) {
      const ref = subMonths(new Date(), i);
      const from = startOfMonth(ref);
      const to = endOfMonth(ref);

      const agg = await this.prisma.payment.aggregate({
        where: {
          status: $Enums.PaymentStatus.COMPLETED,
          paidAt: { gte: from, lte: to },
        },
        _sum: { amount: true },
      });

      rows.push({
        month: format(ref, 'MMM yy'),
        revenue: Number(agg._sum.amount ?? 0),
      });
    }

    return rows;
  }

  /** Appointment counts grouped by status */
  async getAppointmentStats() {
    const statuses = Object.values($Enums.AppointmentStatus);
    const results = await Promise.all(
      statuses.map(async (status) => ({
        status,
        count: await this.prisma.appointment.count({ where: { status } }),
      })),
    );
    return results.filter((r) => r.count > 0);
  }

  /** New patients per month for last N months */
  async getPatientGrowth(months = 12) {
    const rows: { month: string; newPatients: number; total: number }[] = [];
    let running = 0;

    // Count patients created before the window
    const windowStart = startOfMonth(subMonths(new Date(), months - 1));
    const before = await this.prisma.patient.count({
      where: { createdAt: { lt: windowStart }, isActive: true },
    });
    running = before;

    for (let i = months - 1; i >= 0; i--) {
      const ref = subMonths(new Date(), i);
      const from = startOfMonth(ref);
      const to = endOfMonth(ref);

      const newPatients = await this.prisma.patient.count({
        where: { createdAt: { gte: from, lte: to }, isActive: true },
      });

      running += newPatients;
      rows.push({ month: format(ref, 'MMM yy'), newPatients, total: running });
    }

    return rows;
  }

  /** Lead pipeline funnel — active + historical counts per stage */
  async getLeadFunnel() {
    const stages = Object.values($Enums.PipelineStage);
    const results = await Promise.all(
      stages.map(async (stage) => ({
        stage,
        count: await this.prisma.lead.count({ where: { stage } }),
      })),
    );

    // Also include won/lost summary
    const [won, lost, total] = await Promise.all([
      this.prisma.lead.count({ where: { status: $Enums.LeadStatus.WON } }),
      this.prisma.lead.count({ where: { status: $Enums.LeadStatus.LOST } }),
      this.prisma.lead.count(),
    ]);

    return {
      stages: results,
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
      totalAppointments,
      completedAppointments,
      cancelledAppointments,
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
      this.prisma.appointment.count(),
      this.prisma.appointment.count({ where: { status: $Enums.AppointmentStatus.COMPLETED } }),
      this.prisma.appointment.count({ where: { status: $Enums.AppointmentStatus.CANCELLED } }),
    ]);

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
