import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateLeadTaskDto {
  @ApiProperty({ example: 'Call back about the x-rays' })
  @IsString()
  @IsNotEmpty()
  title: string;

  // Required, not optional: a task with no due date cannot answer "who do I contact today", which
  // is the only reason the pipeline carries tasks at all.
  @ApiProperty({ example: '2026-07-28T09:00:00.000Z' })
  @IsDateString()
  dueDate: string;

  @ApiPropertyOptional({ description: 'Defaults to the lead’s assignee when omitted' })
  @IsString()
  @IsOptional()
  assignedToId?: string;
}

export class UpdateLeadTaskDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  assignedToId?: string;

  @ApiPropertyOptional({ description: 'Ticking this stamps completedAt; unticking clears it' })
  @IsBoolean()
  @IsOptional()
  completed?: boolean;
}
