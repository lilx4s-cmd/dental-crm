import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

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

export class BulkTagDto extends BulkLeadIdsDto {
  @ApiProperty({ description: 'Tags to add to, or take off, every selected deal', type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @IsUUID('all', { each: true })
  tagIds!: string[];

  /**
   * One endpoint for both directions rather than two.
   *
   * Adding and removing differ only in which way the pairs are computed, and splitting them would
   * duplicate the selection scoping, the cap check and the history write — three things that must
   * behave identically whichever way the tag is moving.
   */
  @ApiPropertyOptional({ description: 'true removes the tags instead of adding them', default: false })
  @IsOptional()
  @IsBoolean()
  remove?: boolean;
}

export class BulkTaskDto extends BulkLeadIdsDto {
  @ApiProperty({ example: 'Chase for flight dates' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  /**
   * Required, matching CreateLeadTaskDto.
   *
   * A task with no due date cannot answer "who do I contact today", which is the only reason the
   * pipeline carries tasks at all — and a bulk action is the easiest place to create forty of them
   * that never surface anywhere.
   */
  @ApiProperty({ example: '2026-08-12T09:00:00.000Z' })
  @IsDateString()
  dueDate!: string;

  /**
   * Who each task falls to. Omitted means the deal's own assignee, which is usually what a bulk
   * reminder means: forty deals owned by four people become forty tasks across those four, not
   * forty tasks for whoever clicked.
   */
  @ApiPropertyOptional({ description: 'Defaults to each deal’s own assignee' })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;
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
