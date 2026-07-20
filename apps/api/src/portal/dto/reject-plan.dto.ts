import { IsString, IsOptional } from 'class-validator';

export class RejectPlanDto {
  @IsOptional() @IsString() reason?: string;
}
