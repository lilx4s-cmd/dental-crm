import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LEAD_IMPORT_MAX_ROWS } from '@dental-crm/shared';

/**
 * One row of an imported spreadsheet.
 *
 * Looser than CreateLeadDto on purpose: `source` is free text the service maps onto the enum, and
 * a surname is optional because plenty of enquiries arrive as a single name. The strictness that
 * matters — a name must exist, an email must be an email — is kept, so a malformed row is rejected
 * individually rather than taking the file down with it.
 */
export class ImportedLeadDto {
  @ApiProperty({ example: 'Marie' })
  @IsString()
  @MinLength(1)
  firstName: string;

  @ApiPropertyOptional({ example: 'Dubois' })
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiPropertyOptional({ example: '905551112233' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  whatsappNumber?: string;

  @ApiPropertyOptional({ example: 'marie@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: 'Free text; mapped onto LeadSource, falling back to OTHER' })
  @IsString()
  @IsOptional()
  source?: string;

  @ApiPropertyOptional({ example: 2500 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @IsOptional()
  estimatedValue?: number;

  @ApiPropertyOptional({ example: 'EUR' })
  @IsString()
  @Length(3, 3)
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}

export class ImportLeadsDto {
  @ApiProperty({ type: [ImportedLeadDto] })
  @IsArray()
  @ArrayMinSize(1)
  // Past a couple of thousand rows a spreadsheet is a migration, and migrations are scripted
  // against the database rather than pushed through a request that has to finish before a timeout.
  @ArrayMaxSize(LEAD_IMPORT_MAX_ROWS)
  @ValidateNested({ each: true })
  @Type(() => ImportedLeadDto)
  leads: ImportedLeadDto[];

  @ApiPropertyOptional({ description: 'Assign every imported lead to this user. Defaults to the importer.' })
  @IsUUID()
  @IsOptional()
  assignedToId?: string;

  @ApiPropertyOptional({ default: true, description: 'Skip rows whose phone or email already exists' })
  @IsBoolean()
  @IsOptional()
  skipDuplicates?: boolean;
}
