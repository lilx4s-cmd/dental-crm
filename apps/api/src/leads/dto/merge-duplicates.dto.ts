import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class MergeDuplicatesDto {
  @ApiPropertyOptional({
    description: 'Report what would happen without changing anything. Default false — the caller asks for this.',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  dryRun?: boolean;

  @ApiPropertyOptional({
    description: 'Only these numbers. Omitted means every duplicate group the scan found.',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  numbers?: string[];

  @ApiPropertyOptional({
    description: 'Override which deal survives, keyed by number. Defaults to the furthest along.',
  })
  @IsObject()
  @IsOptional()
  survivors?: Record<string, string>;

  @ApiPropertyOptional({
    description:
      'Also merge groups that look like repeat treatment. Off by default: two completed deals on ' +
      'one number is usually a returning patient, and merging those destroys the record of the first.',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  includeRepeatTreatment?: boolean;
}
