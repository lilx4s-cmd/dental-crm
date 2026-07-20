import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

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
}
