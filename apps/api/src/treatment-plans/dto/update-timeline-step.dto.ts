import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TimelineStepStatus } from '@dental-crm/shared';

export class UpdateTimelineStepDto {
  @ApiPropertyOptional({ enum: TimelineStepStatus })
  @IsOptional()
  @IsEnum(TimelineStepStatus)
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
