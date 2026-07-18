import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsHexColor, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateTagDto {
  @ApiProperty({ example: 'VIP' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional({ example: '#3B82F6' })
  @IsHexColor()
  @IsOptional()
  color?: string;
}
