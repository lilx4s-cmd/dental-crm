import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  IsEnum,
  IsInt,
  IsDateString,
  Min,
  Max,
} from 'class-validator';
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

export class TreatmentPlanStayDto {
  @IsOptional() @IsDateString() arrivalDate?: string;
  @IsOptional() @IsString() arrivalFlight?: string;
  @IsOptional() @IsDateString() departureDate?: string;
  @IsOptional() @IsString() departureFlight?: string;
  @IsOptional() @IsString() hotelName?: string;
  @IsOptional() @IsString() hotelAddress?: string;
  @IsOptional() @IsString() roomType?: string;
  @IsOptional() @IsInt() @Min(0) nights?: number;
  @IsOptional() @IsInt() @Min(0) companions?: number;
  @IsOptional() @IsDateString() checkInDate?: string;
  @IsOptional() @IsDateString() checkOutDate?: string;
  @IsOptional() @IsString() airportTransfer?: string;
  @IsOptional() @IsString() clinicTransfer?: string;
  @IsOptional() @IsString() notes?: string;
}

export class TreatmentPlanScheduleItemDto {
  @IsDateString() date: string;
  @IsOptional() @IsString() time?: string;
  @IsString() @IsNotEmpty() title: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() notes?: string;
}

/**
 * The whole itinerary in one call. Stay and schedule are replaced together rather than patched
 * field by field because that is how a coordinator edits them — they open the itinerary, correct
 * the flight and drop a day, and save. Sending the full picture also means removing a schedule
 * entry needs no separate delete route.
 */
export class UpdateItineraryDto {
  @IsOptional() @ValidateNested() @Type(() => TreatmentPlanStayDto)
  stay?: TreatmentPlanStayDto;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => TreatmentPlanScheduleItemDto)
  scheduleItems?: TreatmentPlanScheduleItemDto[];
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

  @IsOptional() @ValidateNested() @Type(() => TreatmentPlanStayDto)
  stay?: TreatmentPlanStayDto;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => TreatmentPlanScheduleItemDto)
  scheduleItems?: TreatmentPlanScheduleItemDto[];
  // What the quoted price covers, and how it is paid. A caller that has not reached that step
  // omits them entirely and the service fills them from the clinic's defaults — which is most of
  // the difference between a two-minute proposal and a twenty-minute one.
  @IsOptional() @IsArray() @IsString({ each: true })
  packageIncludes?: string[];

  @IsOptional() @IsNumber() @Min(0) depositAmount?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) cardFeePercent?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) cashDiscountPercent?: number;
  @IsOptional() @IsString() flightRefundNote?: string;
  @IsOptional() @IsString() paymentTerms?: string;
  @IsOptional() @IsString() language?: string;
}
