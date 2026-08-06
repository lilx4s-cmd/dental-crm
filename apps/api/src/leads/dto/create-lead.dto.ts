import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEmail, IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MinLength, Length } from 'class-validator';
import { LeadSource } from '@dental-crm/shared';

export class CreateLeadDto {
  @ApiProperty({ example: 'Jane' })
  @IsString()
  @MinLength(1)
  firstName: string;

  @ApiProperty({ example: 'Smith' })
  @IsString()
  @MinLength(1)
  lastName: string;

  @ApiPropertyOptional({ example: 'jane@example.com' })
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

  /**
   * ISO 3166-1 alpha-2. Not merely descriptive: a leading zero on a phone number is a national
   * trunk prefix and cannot be resolved without it, so this decides whether 055 512 3456 is read
   * as Saudi or Turkish.
   */
  @ApiPropertyOptional({ example: 'SA', description: 'ISO 3166-1 alpha-2 country code' })
  @IsString()
  @Length(2, 2)
  @IsOptional()
  country?: string;

  /**
   * ISO 639-1. Which language to talk to this patient in.
   *
   * Null means nobody has said, which is not the same as English — defaulting would send an
   * English treatment plan to somebody who cannot read it.
   */
  @ApiPropertyOptional({ example: 'ar', description: 'ISO 639-1 language code' })
  @IsString()
  @Length(2, 3)
  @IsOptional()
  preferredLanguage?: string;

  @ApiProperty({ enum: LeadSource })
  @IsEnum(LeadSource)
  source: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  campaignId?: string;

  @ApiPropertyOptional({ example: 2500 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @IsOptional()
  estimatedValue?: number;

  @ApiPropertyOptional({ default: 'USD' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  assignedToId?: string;
}
