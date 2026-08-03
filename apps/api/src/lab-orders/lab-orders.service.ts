import { Injectable, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLabOrderDto, UpdateLabOrderDto } from './dto/lab-order.dto';

const LAB_ORDER_SELECT = {
  id: true,
  treatmentPlanId: true,
  labName: true,
  status: true,
  shade: true,
  material: true,
  toothNumbers: true,
  sentAt: true,
  dueAt: true,
  receivedAt: true,
  trackingRef: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  treatmentPlan: {
    select: {
      id: true,
      title: true,
      patient: { select: { id: true, firstName: true, lastName: true } },
    },
  },
} as const;

/** Orders that have left the clinic but not come back. */
const OPEN_STATUSES: $Enums.LabOrderStatus[] = ['SENT', 'IN_PRODUCTION', 'READY', 'REMAKE'];

@Injectable()
export class LabOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  findForPlan(treatmentPlanId: string) {
    return this.prisma.labOrder.findMany({
      where: { treatmentPlanId },
      select: LAB_ORDER_SELECT,
      // Soonest due first, and orders with no date last: an undated case is not urgent, it is
      // unplanned, and it should not push a dated one down the list.
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
    });
  }

  /**
   * Cases still out at the lab, soonest due first.
   *
   * The question this exists to answer is "what is late, and what is due this week" — which is the
   * only reason to track lab work in a CRM rather than in the lab's own system.
   */
  findOpen() {
    return this.prisma.labOrder.findMany({
      where: { status: { in: OPEN_STATUSES } },
      select: LAB_ORDER_SELECT,
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }],
    });
  }

  async create(treatmentPlanId: string, dto: CreateLabOrderDto, createdById: string) {
    // Fails clearly if the plan is gone, rather than leaving Prisma to raise a foreign-key error
    // that surfaces to the coordinator as a 500.
    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id: treatmentPlanId },
      select: { id: true },
    });
    if (!plan) throw new NotFoundException('Treatment plan not found');

    return this.prisma.labOrder.create({
      data: {
        treatmentPlanId,
        createdById,
        labName: dto.labName,
        shade: dto.shade,
        material: dto.material,
        toothNumbers: dto.toothNumbers ?? [],
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        trackingRef: dto.trackingRef,
        notes: dto.notes,
      },
      select: LAB_ORDER_SELECT,
    });
  }

  async update(id: string, dto: UpdateLabOrderDto) {
    const existing = await this.prisma.labOrder.findUnique({
      where: { id },
      select: { id: true, sentAt: true, receivedAt: true },
    });
    if (!existing) throw new NotFoundException('Lab order not found');

    const data: Prisma.LabOrderUpdateInput = {
      labName: dto.labName,
      shade: dto.shade,
      material: dto.material,
      toothNumbers: dto.toothNumbers,
      dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      trackingRef: dto.trackingRef,
      notes: dto.notes,
      status: dto.status,
    };

    // The two dates that matter are stamped by the status change rather than typed in, because a
    // date somebody has to remember to fill in is a date that ends up wrong. Only stamped once:
    // moving back to SENT after a remake must not rewrite when the case first went out.
    if (dto.status === 'SENT' && !existing.sentAt) data.sentAt = new Date();
    if (dto.status === 'RECEIVED' && !existing.receivedAt) data.receivedAt = new Date();
    // A remake is a case going out again, so the clock on its return restarts.
    if (dto.status === 'REMAKE') data.receivedAt = null;

    return this.prisma.labOrder.update({ where: { id }, data, select: LAB_ORDER_SELECT });
  }

  async remove(id: string) {
    const existing = await this.prisma.labOrder.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Lab order not found');
    await this.prisma.labOrder.delete({ where: { id } });
    return { id };
  }
}
