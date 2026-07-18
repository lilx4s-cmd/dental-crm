import { IsOptional, IsString, IsEnum, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export class ConversationsQueryDto {
  @IsOptional() @IsString() channel?: string;
  @IsOptional() @IsString() assignedToId?: string;
  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean() isArchived?: boolean;
}
