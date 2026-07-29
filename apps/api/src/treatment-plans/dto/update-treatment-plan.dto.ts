import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
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

  // Package and payment are patched from their own step in the editor, so each is independently
  // optional: saving the package must not blank the terms somebody set a moment earlier.
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  packageIncludes?: string[];

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) depositAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(100) cardFeePercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(100) cashDiscountPercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() flightRefundNote?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() paymentTerms?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() language?: string;
}
