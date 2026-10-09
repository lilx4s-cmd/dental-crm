import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsIn, Matches, Max, Min } from 'class-validator';

export class PatientsQueryDto {
  @IsOptional()
  @IsIn(['all', 'working', 'finished', 'reservations'])
  view?: 'all' | 'working' | 'finished' | 'reservations';

  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month?: string;

  @IsOptional()
  @IsString()
  staffId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  dueDays?: number;
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

  @ApiPropertyOptional({ description: 'Filter by tag ID' })
  @IsString()
  @IsOptional()
  tagId?: string;
}
