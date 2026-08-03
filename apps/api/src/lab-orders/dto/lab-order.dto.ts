import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { $Enums } from '@prisma/client';

export class CreateLabOrderDto {
  @ApiProperty({ example: 'Anadolu Dental Lab' })
  @IsString()
  @IsNotEmpty()
  labName: string;

  @ApiPropertyOptional({ example: 'A2' })
  @IsString()
  @IsOptional()
  shade?: string;

  @ApiPropertyOptional({ example: 'Zirconia' })
  @IsString()
  @IsOptional()
  material?: string;

  @ApiPropertyOptional({ type: [String], description: 'FDI tooth numbers this dispatch covers' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  toothNumbers?: string[];

  @ApiPropertyOptional({ description: 'When the case must be back for the patient appointment' })
  @IsDateString()
  @IsOptional()
  dueAt?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  trackingRef?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateLabOrderDto {
  @ApiPropertyOptional({ enum: $Enums.LabOrderStatus })
  @IsEnum($Enums.LabOrderStatus)
  @IsOptional()
  status?: $Enums.LabOrderStatus;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  labName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  shade?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  material?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  toothNumbers?: string[];

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  dueAt?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  trackingRef?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}
