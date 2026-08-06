import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateMessageTemplateDto {
  @ApiProperty({ example: 'Price list — implants' })
  @IsString()
  @MinLength(1)
  // What staff pick it by in the composer, not what the patient reads. Short enough to scan in a
  // dropdown of twenty.
  @MaxLength(80)
  title!: string;

  @ApiProperty({ example: 'Hello {{name}}, here is our implant pricing…' })
  @IsString()
  @MinLength(1)
  /**
   * WhatsApp's own limit for a text message body is 4096 characters. Matching it here means a
   * template can never be composed that the transport would then refuse — the failure would
   * otherwise land at send time, on a message someone had already written.
   */
  @MaxLength(4096)
  body!: string;

  @ApiPropertyOptional({ example: 'Pricing' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string;
}

export class UpdateMessageTemplateDto extends PartialType(CreateMessageTemplateDto) {
  @ApiPropertyOptional({ description: 'Hides it from the composer without deleting it' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
