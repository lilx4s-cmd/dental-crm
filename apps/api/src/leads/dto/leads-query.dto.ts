import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
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

  /**
   * Narrow to deals carrying every one of these tags.
   *
   * AND rather than OR, deliberately. "Implants" and "Saudi Arabia" together names a real segment;
   * either-or returns two unrelated lists stapled together, and there would be no way to ask for
   * the first. Selecting a single tag behaves identically under both readings.
   */
  @ApiPropertyOptional({ description: 'Only deals carrying all of these tags', type: [String] })
  // A repeated query parameter arrives as an array, a single one as a bare string.
  @Transform(({ value }) => (value === undefined ? undefined : Array.isArray(value) ? value : [value]))
  @IsArray()
  @IsUUID('all', { each: true })
  @IsOptional()
  tagIds?: string[];

  @ApiPropertyOptional({ description: 'Only leads with no stage change in the last two weeks' })
  // Query strings carry booleans as text, so accept the literal 'true'/'1' a URL would produce.
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  @IsOptional()
  stuck?: boolean;
}
