import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PipelineStage } from '@dental-crm/shared';

export class UpdateLeadStageDto {
  @ApiProperty({ enum: PipelineStage })
  @IsEnum(PipelineStage)
  stage: string;

  @ApiPropertyOptional({ example: 'Called and confirmed interest' })
  @IsString()
  @IsOptional()
  note?: string;

  @ApiPropertyOptional({ example: 'Lost / No enough budget' })
  @IsString()
  @IsOptional()
  lostReason?: string;
}
