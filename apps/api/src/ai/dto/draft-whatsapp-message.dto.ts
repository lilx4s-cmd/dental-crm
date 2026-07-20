import { IsOptional, IsString } from 'class-validator';

export class DraftWhatsAppMessageDto {
  @IsOptional()
  @IsString()
  patientId?: string;

  @IsOptional()
  @IsString()
  treatmentPlanId?: string;

  @IsOptional()
  @IsString()
  context?: string;
}
