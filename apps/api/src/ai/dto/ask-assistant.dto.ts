import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AskAssistantDto {
  // Capped because the question is billed per token and this endpoint is authenticated but
  // otherwise unrestricted — a pasted essay would be charged for with no benefit.
  @ApiProperty({ maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  question!: string;
}
