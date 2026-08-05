import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * The set a bulk action applies to.
 *
 * Ids only — never a filter. Every other bulk path in this file is destructive or close to it, and
 * "apply to everything matching my current filter" is how someone archives four hundred deals
 * believing they had six selected. The transfer endpoint accepts filters because it is reversible
 * and its dialog shows a preview first; these do not.
 *
 * The 500 cap is the largest column on the board with room to spare. It exists so a crafted request
 * cannot ask the database to rewrite the entire pipeline in one statement.
 */
export class BulkLeadIdsDto {
  @ApiProperty({ description: 'Which deals the action applies to', type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  leadIds!: string[];
}

export class BulkArchiveDto extends BulkLeadIdsDto {
  @ApiPropertyOptional({
    description: 'true archives, false restores. Defaults to archiving.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

export class BulkNoteDto extends BulkLeadIdsDto {
  @ApiProperty({ description: 'Written to each deal’s history, attributed to the caller' })
  @IsString()
  @MinLength(1)
  // Long enough for a real handover note, short enough that the history stays readable. A wall of
  // text belongs on the deal itself, where it can be edited.
  @MaxLength(2000)
  note!: string;
}

export class BulkDeleteDto extends BulkLeadIdsDto {
  /**
   * Deliberately not defaulted to true.
   *
   * Deletion is the one action here with nothing behind it — archiving is reversible, a note can be
   * ignored, an export changes nothing. Requiring the caller to say so explicitly means a replayed
   * or malformed request cannot destroy records by omission.
   */
  @ApiProperty({ description: 'Must be true. Deletion cannot be undone.' })
  @IsBoolean()
  confirm!: boolean;
}
