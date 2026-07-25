import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { LeadSource, LeadStatus, PipelineStage, TaskDueFilter } from '@dental-crm/shared';

export class LeadsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit: number = 20;

  @ApiPropertyOptional({ description: 'Search by name, email, or phone' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: PipelineStage })
  @IsEnum(PipelineStage)
  @IsOptional()
  stage?: string;

  @ApiPropertyOptional({ enum: LeadStatus })
  @IsEnum(LeadStatus)
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by assigned user ID' })
  @IsString()
  @IsOptional()
  assignedToId?: string;

  @ApiPropertyOptional({ enum: LeadSource })
  @IsEnum(LeadSource)
  @IsOptional()
  source?: string;

  @ApiPropertyOptional({
    enum: TaskDueFilter,
    description: 'Narrow to leads by when their next open task falls due',
  })
  @IsEnum(TaskDueFilter)
  @IsOptional()
  taskDue?: TaskDueFilter;

  @ApiPropertyOptional({ description: 'Only leads with no stage change in the last two weeks' })
  // Query strings carry booleans as text, so accept the literal 'true'/'1' a URL would produce.
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  @IsOptional()
  stuck?: boolean;
}
