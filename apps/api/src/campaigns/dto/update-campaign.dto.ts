import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateCampaignDto } from './create-campaign.dto';

const CAMPAIGN_STATUSES = ['ACTIVE', 'PAUSED', 'ENDED'] as const;

export class UpdateCampaignDto extends PartialType(CreateCampaignDto) {
  @IsOptional() @IsEnum(CAMPAIGN_STATUSES) status?: string;
}
