import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Gender } from '@dental-crm/shared';

export class CreatePatientDto {
  @ApiProperty({ example: 'John' })
  @IsString()
  @MinLength(1)
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @MinLength(1)
  lastName: string;

  @ApiPropertyOptional({ example: 'john@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: '+905551234567' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  whatsappNumber?: string;

  @ApiPropertyOptional({ example: '1985-06-15' })
  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsEnum(Gender)
  @IsOptional()
  gender?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  country?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  nationalId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  /**
   * The medical history a clinician plans treatment from.
   *
   * All optional, and all meaning "nobody has said" when absent — never "no". The patient record
   * carried these columns since the schema was written and the API accepted only `allergies`, so
   * four of the five questions the checklist asks could not be answered through the app at all.
   *
   * Write "None" rather than leaving one blank. That is the difference between a question asked
   * and a question skipped, and it is the whole reason these are strings and not booleans.
   */
  @ApiPropertyOptional({ example: 'Penicillin, latex' })
  @IsString()
  @IsOptional()
  allergies?: string;

  @ApiPropertyOptional({ example: 'Metformin 500mg twice daily' })
  @IsString()
  @IsOptional()
  medications?: string;

  @ApiPropertyOptional({ example: 'Type 2 diabetes, hypertension' })
  @IsString()
  @IsOptional()
  medicalConditions?: string;

  @ApiPropertyOptional({ example: 'Wisdom teeth removed 2019' })
  @IsString()
  @IsOptional()
  previousSurgeries?: string;

  /**
   * Tri-state by way of being optional: true, false, or absent. Absent is "not asked", which is
   * why these are nullable booleans rather than defaulting to false — a default would record an
   * answer nobody gave, on the question most likely to be noticed in the chair.
   */
  @ApiPropertyOptional({ description: 'Absent means not asked, which is not the same as false' })
  @IsBoolean()
  @IsOptional()
  takesBloodThinners?: boolean;

  @ApiPropertyOptional({ description: 'Absent means not asked' })
  @IsBoolean()
  @IsOptional()
  isPregnant?: boolean;

  @ApiPropertyOptional({ description: 'Absent means not asked' })
  @IsBoolean()
  @IsOptional()
  isSmoker?: boolean;

  @ApiPropertyOptional({ example: 'Class II malocclusion' })
  @IsString()
  @IsOptional()
  diagnosis?: string;

  @ApiPropertyOptional({ example: 'Allianz — Policy #123456' })
  @IsString()
  @IsOptional()
  insuranceInfo?: string;
}
