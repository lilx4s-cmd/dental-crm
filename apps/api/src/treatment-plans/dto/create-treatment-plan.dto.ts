import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTreatmentPlanItemDto {
  @IsOptional() @IsString() treatmentCategoryId?: string;
  @IsOptional() @IsString() toothNumber?: string;
  @IsString() @IsNotEmpty() description: string;
  @IsNumber() @Min(1) quantity: number;
  @IsNumber() @Min(0) cost: number;
}

export class CreateTreatmentPlanDto {
  @IsString() @IsNotEmpty() patientId: string;
  @IsString() @IsNotEmpty() title: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CreateTreatmentPlanItemDto)
  items?: CreateTreatmentPlanItemDto[];
}
