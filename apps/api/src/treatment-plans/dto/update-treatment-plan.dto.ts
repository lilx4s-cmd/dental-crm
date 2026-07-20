import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TreatmentStatus, PatientApprovalStatus } from '@dental-crm/shared';

// Replaces the previous loose `@Body('status') status: string` handling with a
// validated PATCH body, mirroring how the leads module validates enum transitions
// (see update-lead-stage.dto.ts). Every field is optional so callers can patch
// status, approval, assignment, or narrative fields independently.
export class UpdateTreatmentPlanDto {
  @ApiPropertyOptional({ enum: TreatmentStatus })
  @IsOptional()
  @IsEnum(TreatmentStatus)
  status?: string;

  @ApiPropertyOptional({ enum: PatientApprovalStatus })
  @IsOptional()
  @IsEnum(PatientApprovalStatus)
  approvalStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedDentistId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedCoordinatorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  doctorRecommendation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
