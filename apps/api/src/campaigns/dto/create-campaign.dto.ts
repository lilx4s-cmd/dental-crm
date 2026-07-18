import { IsString, IsNotEmpty, IsEnum, IsOptional, IsNumber, IsDateString } from 'class-validator';

const CAMPAIGN_PLATFORMS = ['FACEBOOK', 'INSTAGRAM', 'GOOGLE', 'TIKTOK', 'OTHER'] as const;

export class CreateCampaignDto {
  @IsString() @IsNotEmpty() name: string;
  @IsEnum(CAMPAIGN_PLATFORMS) platform: string;
  @IsOptional() @IsString() externalId?: string;
  @IsOptional() @IsString() adAccountId?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsNumber() budget?: number;
}
