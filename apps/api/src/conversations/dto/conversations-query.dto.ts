import { IsOptional, IsString, IsBoolean, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class ConversationsQueryDto {
  @IsOptional() @IsString() channel?: string;
  @IsOptional() @IsString() assignedToId?: string;
  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean() isArchived?: boolean;

  /**
   * Name, phone number, or something said in the thread.
   *
   * One box rather than three, because nobody opening an inbox knows in advance which of those
   * they remember. Message bodies are included even though it is the most expensive of the three:
   * "the one where they mentioned the hotel" is how people actually describe a thread they are
   * looking for.
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  /** Only threads with something waiting for a reply. */
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  unreadOnly?: boolean;

  /** Only threads nobody has taken. The gap an inbox shared by four people actually has. */
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  unassignedOnly?: boolean;
}
