import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

export class TransferLeadsDto {
  @ApiProperty({ description: 'User the leads will be reassigned to' })
  @IsUUID()
  toUserId!: string;

  @ApiPropertyOptional({ description: 'Move every lead currently assigned to this user' })
  @IsOptional()
  @IsUUID()
  fromUserId?: string;

  @ApiPropertyOptional({ description: 'Move only these specific leads', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  leadIds?: string[];

  @ApiPropertyOptional({ description: 'Optional note stored in each lead history entry' })
  @IsOptional()
  @IsString()
  note?: string;
}
