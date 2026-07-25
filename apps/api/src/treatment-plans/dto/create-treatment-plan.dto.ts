import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsNumber, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { $Enums } from '@prisma/client';

export class CreateTreatmentPlanItemDto {
  @IsOptional() @IsString() treatmentCategoryId?: string;
  @IsOptional() @IsString() toothNumber?: string;
  @IsString() @IsNotEmpty() description: string;
  @IsNumber() @Min(1) quantity: number;
  // `cost` is the authoritative line total (flows into TreatmentPlan.totalCost + InvoiceItem).
  // The frontend computes cost = unitPrice * quantity - discount and submits it; unitPrice/discount
  // are additive input-convenience fields that get persisted for reference/editing.
  @IsNumber() @Min(0) cost: number;
  @IsOptional() @IsString() material?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsNumber() @Min(0) unitPrice?: number;
  @IsOptional() @IsNumber() @Min(0) discount?: number;
  @IsOptional() @IsString() clinicalNotes?: string;
  @IsOptional() @IsInt() @Min(1) phaseNumber?: number;
  @IsOptional() @IsEnum($Enums.ToothCondition) toothCondition?: $Enums.ToothCondition;
}

export class CreateTreatmentPlanDiagnosisDto {
  @IsEnum($Enums.ToothCondition) condition: $Enums.ToothCondition;
  @IsArray() @IsString({ each: true }) toothNumbers: string[];
  @IsOptional() @IsString() notes?: string;
}

export class CreateTreatmentPlanPhaseDto {
  @IsInt() @Min(1) phaseNumber: number;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() @Min(0) discountAmount?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) discountPercent?: number;
  @IsOptional() @IsInt() @Min(0) healingPeriodMonths?: number;
}

export class CreateTreatmentPlanDto {
  @IsString() @IsNotEmpty() patientId: string;
  @IsString() @IsNotEmpty() title: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() assignedDentistId?: string;
  @IsOptional() @IsString() assignedCoordinatorId?: string;
  @IsOptional() @IsString() doctorRecommendation?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CreateTreatmentPlanItemDto)
  items?: CreateTreatmentPlanItemDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CreateTreatmentPlanDiagnosisDto)
  diagnoses?: CreateTreatmentPlanDiagnosisDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CreateTreatmentPlanPhaseDto)
  phases?: CreateTreatmentPlanPhaseDto[];
}
