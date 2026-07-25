import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { LeadSource, PipelineStage, TaskDueFilter } from '@dental-crm/shared';

/**
 * Which leads to move.
 *
 * The filter fields deliberately mirror LeadsQueryDto and are resolved through the same
 * where-builder the pipeline uses, so "transfer what I filtered" moves exactly the set the board
 * was showing. A transfer with no selection at all is refused rather than treated as "everything" —
 * one mis-click should not reassign the entire pipeline.
 */
export class TransferLeadsDto {
  @ApiProperty({ description: 'User the leads will be reassigned to' })
  @IsUUID()
  toUserId!: string;

  @ApiPropertyOptional({ description: 'Move every lead currently assigned to this user' })
  @IsOptional()
  @IsUUID()
  fromUserId?: string;

  @ApiPropertyOptional({ description: 'Move only these specific leads', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  leadIds?: string[];

  @ApiPropertyOptional({ enum: PipelineStage, description: 'Move only leads in this stage' })
  @IsOptional()
  @IsEnum(PipelineStage)
  stage?: string;

  @ApiPropertyOptional({ enum: LeadSource })
  @IsOptional()
  @IsEnum(LeadSource)
  source?: string;

  @ApiPropertyOptional({ enum: TaskDueFilter })
  @IsOptional()
  @IsEnum(TaskDueFilter)
  taskDue?: TaskDueFilter;

  @ApiPropertyOptional({ description: 'Only leads with no stage change in the last two weeks' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  stuck?: boolean;

  @ApiPropertyOptional({ description: 'Name, email or phone' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Optional note stored in each lead history entry' })
  @IsOptional()
  @IsString()
  note?: string;
}
