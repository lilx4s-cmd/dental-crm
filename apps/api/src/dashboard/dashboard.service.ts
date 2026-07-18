import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LeadStatus, PipelineStage } from '@dental-crm/shared';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [
      leadsToday,
      leadsTotal,
      wonLeads,
      totalLeadsEver,
      patientsTotal,
      pipelineValue,
      appointmentsToday,
    ] = await this.prisma.$transaction([
      this.prisma.lead.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.lead.count({ where: { status: LeadStatus.ACTIVE } }),
      this.prisma.lead.count({ where: { status: LeadStatus.WON } }),
      this.prisma.lead.count(),
      this.prisma.patient.count({ where: { isActive: true } }),
      this.prisma.lead.aggregate({
        where: { status: LeadStatus.ACTIVE },
        _sum: { estimatedValue: true },
      }),
      this.prisma.appointment.count({
        where: { startTime: { gte: todayStart, lte: todayEnd }, status: { not: 'CANCELLED' } },
      }),
    ]);

    const conversionRate = totalLeadsEver > 0
      ? Math.round((wonLeads / totalLeadsEver) * 100)
      : 0;

    return {
      leadsToday,
      leadsTotal,
      patientsTotal,
      conversionRate,
      pipelineValueTotal: Number(pipelineValue._sum.estimatedValue ?? 0),
      appointmentsToday,
    };
  }

  async getPipelineGroups() {
    const leads = await this.prisma.lead.findMany({
      where: { status: LeadStatus.ACTIVE },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        source: true,
        stage: true,
        estimatedValue: true,
        currency: true,
        createdAt: true,
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const stages = Object.values(PipelineStage);
    return stages.map((stage) => {
      const stageLeads = leads.filter((l) => l.stage === stage);
      const totalValue = stageLeads.reduce((sum, l) => sum + Number(l.estimatedValue ?? 0), 0);
      return { stage, count: stageLeads.length, totalValue, leads: stageLeads };
    });
  }
}
