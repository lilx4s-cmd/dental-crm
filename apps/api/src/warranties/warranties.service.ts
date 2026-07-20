import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWarrantyTemplateDto } from './dto/create-warranty-template.dto';
import { UpdateWarrantyTemplateDto } from './dto/update-warranty-template.dto';
import { IssueWarrantyDto } from './dto/issue-warranty.dto';

const WARRANTY_SELECT = {
  id: true,
  treatmentPlanItemId: true,
  warrantyTemplateId: true,
  startDate: true,
  durationMonths: true,
  status: true,
  termsAndConditions: true,
  maintenanceRequirements: true,
  exclusions: true,
  annualCheckupRequired: true,
  certificateFileId: true,
  createdAt: true,
  updatedAt: true,
  warrantyTemplate: { select: { id: true, name: true } },
  treatmentPlanItem: {
    select: {
      id: true,
      description: true,
      toothNumber: true,
      treatmentPlanId: true,
    },
  },
} as const;

@Injectable()
export class WarrantiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findTemplates(isActive?: string) {
    return this.prisma.warrantyTemplate.findMany({
      where: isActive === undefined ? undefined : { isActive: isActive === 'true' },
      orderBy: { name: 'asc' },
    });
  }

  async createTemplate(dto: CreateWarrantyTemplateDto) {
    return this.prisma.warrantyTemplate.create({
      data: {
        name: dto.name,
        treatmentCategoryId: dto.treatmentCategoryId,
        durationMonths: dto.durationMonths,
        termsAndConditions: dto.termsAndConditions,
        maintenanceRequirements: dto.maintenanceRequirements,
        exclusions: dto.exclusions,
        annualCheckupRequired: dto.annualCheckupRequired ?? false,
      },
    });
  }

  async updateTemplate(id: string, dto: UpdateWarrantyTemplateDto) {
    const existing = await this.prisma.warrantyTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Warranty template not found');
    return this.prisma.warrantyTemplate.update({
      where: { id },
      data: {
        name: dto.name,
        treatmentCategoryId: dto.treatmentCategoryId,
        durationMonths: dto.durationMonths,
        termsAndConditions: dto.termsAndConditions,
        maintenanceRequirements: dto.maintenanceRequirements,
        exclusions: dto.exclusions,
        annualCheckupRequired: dto.annualCheckupRequired,
        isActive: dto.isActive,
      },
    });
  }

  async findByPatient(patientId: string) {
    return this.prisma.warranty.findMany({
      where: { treatmentPlanItem: { treatmentPlan: { patientId } } },
      select: WARRANTY_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const warranty = await this.prisma.warranty.findUnique({ where: { id }, select: WARRANTY_SELECT });
    if (!warranty) throw new NotFoundException('Warranty not found');
    return warranty;
  }

  // Issues a brand-new Warranty row for a treatment plan item. If a template is given, its
  // snapshot fields seed the new row (any explicit body fields override — body wins). With no
  // template, durationMonths + termsAndConditions must come from the body directly since there's
  // no fallback source for them.
  async issue(treatmentPlanItemId: string, dto: IssueWarrantyDto) {
    const item = await this.prisma.treatmentPlanItem.findUnique({ where: { id: treatmentPlanItemId } });
    if (!item) throw new NotFoundException('Treatment plan item not found');

    let template = null as Awaited<ReturnType<typeof this.prisma.warrantyTemplate.findUnique>> | null;
    if (dto.warrantyTemplateId) {
      template = await this.prisma.warrantyTemplate.findUnique({ where: { id: dto.warrantyTemplateId } });
      if (!template) throw new NotFoundException('Warranty template not found');
    }

    const durationMonths = dto.durationMonths ?? template?.durationMonths;
    const termsAndConditions = dto.termsAndConditions ?? template?.termsAndConditions;

    if (durationMonths === undefined || durationMonths === null) {
      throw new BadRequestException('durationMonths is required when no warrantyTemplateId is given');
    }
    if (!termsAndConditions) {
      throw new BadRequestException('termsAndConditions is required when no warrantyTemplateId is given');
    }

    const maintenanceRequirements = dto.maintenanceRequirements ?? template?.maintenanceRequirements ?? undefined;
    const exclusions = dto.exclusions ?? template?.exclusions ?? undefined;
    const annualCheckupRequired = dto.annualCheckupRequired ?? template?.annualCheckupRequired ?? false;

    const warranty = await this.prisma.warranty.create({
      data: {
        treatmentPlanItemId,
        warrantyTemplateId: dto.warrantyTemplateId,
        startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
        durationMonths,
        termsAndConditions,
        maintenanceRequirements,
        exclusions,
        annualCheckupRequired,
        certificateFileId: null,
      },
      select: WARRANTY_SELECT,
    });
    return warranty;
  }
}
