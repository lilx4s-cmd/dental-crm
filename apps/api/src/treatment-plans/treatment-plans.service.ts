import { Injectable, NotFoundException } from '@nestjs/common';
import { $Enums } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTreatmentPlanDto } from './dto/create-treatment-plan.dto';

const PLAN_SELECT = {
  id: true,
  title: true,
  status: true,
  totalCost: true,
  currency: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  patient: { select: { id: true, firstName: true, lastName: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  items: {
    select: {
      id: true,
      description: true,
      toothNumber: true,
      quantity: true,
      cost: true,
      status: true,
      treatmentCategory: { select: { id: true, name: true } },
    },
  },
} as const;

@Injectable()
export class TreatmentPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async findByPatient(patientId: string) {
    return this.prisma.treatmentPlan.findMany({
      where: { patientId },
      select: PLAN_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const plan = await this.prisma.treatmentPlan.findUnique({ where: { id }, select: PLAN_SELECT });
    if (!plan) throw new NotFoundException('Treatment plan not found');
    return plan;
  }

  async create(dto: CreateTreatmentPlanDto, createdById: string) {
    const itemsTotal = (dto.items ?? []).reduce((sum, i) => sum + i.cost * i.quantity, 0);

    return this.prisma.treatmentPlan.create({
      data: {
        patientId: dto.patientId,
        createdById,
        title: dto.title,
        notes: dto.notes,
        currency: dto.currency ?? 'USD',
        totalCost: itemsTotal,
        items: dto.items?.length
          ? {
              create: dto.items.map((item) => ({
                treatmentCategoryId: item.treatmentCategoryId,
                toothNumber: item.toothNumber,
                description: item.description,
                quantity: item.quantity,
                cost: item.cost,
              })),
            }
          : undefined,
      },
      select: PLAN_SELECT,
    });
  }

  async updateStatus(id: string, status: string) {
    await this.findOne(id);
    return this.prisma.treatmentPlan.update({
      where: { id },
      data: { status: status as $Enums.TreatmentStatus },
      select: PLAN_SELECT,
    });
  }

  async findCategories() {
    return this.prisma.treatmentCategory.findMany({ orderBy: { name: 'asc' } });
  }

  async createCategory(name: string, description?: string) {
    return this.prisma.treatmentCategory.create({ data: { name, description } });
  }
}
