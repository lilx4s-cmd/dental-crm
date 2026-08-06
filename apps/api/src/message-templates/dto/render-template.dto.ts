import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Who the template is being filled in for.
 *
 * Name fields rather than a lead or patient id, deliberately. The composer already has the person
 * on screen, and taking an id here would mean this endpoint deciding whether the caller may read
 * that record — a second copy of the access rules for no gain. Nothing is looked up from these;
 * they are substituted and returned.
 */
export class RenderTemplateDto {
  @ApiPropertyOptional({ example: 'Ahmed' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Al-Rashid' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;
}
