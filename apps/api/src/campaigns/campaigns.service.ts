import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { $Enums } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

const CAMPAIGN_SELECT = {
  id: true,
  name: true,
  platform: true,
  externalId: true,
  adAccountId: true,
  status: true,
  startDate: true,
  endDate: true,
  budget: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { leads: true } },
} as const;

@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.campaign.findMany({
      select: CAMPAIGN_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id }, select: CAMPAIGN_SELECT });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  async create(dto: CreateCampaignDto) {
    const existing = await this.prisma.campaign.findFirst({ where: { name: dto.name } });
    if (existing) throw new ConflictException('A campaign with this name already exists');

    return this.prisma.campaign.create({
      data: {
        name: dto.name,
        platform: dto.platform as $Enums.CampaignPlatform,
        externalId: dto.externalId,
        adAccountId: dto.adAccountId,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        budget: dto.budget,
      },
      select: CAMPAIGN_SELECT,
    });
  }

  async update(id: string, dto: UpdateCampaignDto) {
    await this.findOne(id);
    return this.prisma.campaign.update({
      where: { id },
      data: {
        name: dto.name,
        platform: dto.platform as $Enums.CampaignPlatform | undefined,
        externalId: dto.externalId,
        adAccountId: dto.adAccountId,
        status: dto.status as $Enums.CampaignStatus | undefined,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        budget: dto.budget,
      },
      select: CAMPAIGN_SELECT,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.campaign.delete({ where: { id } });
  }
}
