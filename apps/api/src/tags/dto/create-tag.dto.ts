import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TagCategory, TagColor, TAG_NAME_MAX } from '@dental-crm/shared';

export class CreateTagDto {
  @ApiProperty({ example: 'VIP', maxLength: TAG_NAME_MAX })
  @IsString()
  @MinLength(1)
  // Bounded because the name renders as a pill on a card about 260px wide. A tag longer than this
  // is a note, and there is a field for those.
  @MaxLength(TAG_NAME_MAX)
  name!: string;

  @ApiPropertyOptional({ enum: TagColor, default: TagColor.SLATE })
  @IsOptional()
  @IsEnum(TagColor)
  color?: TagColor;

  @ApiPropertyOptional({ enum: TagCategory, default: TagCategory.GENERAL })
  @IsOptional()
  @IsEnum(TagCategory)
  category?: TagCategory;
}
