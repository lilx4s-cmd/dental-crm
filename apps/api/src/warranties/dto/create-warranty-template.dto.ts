import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, IsBoolean } from 'class-validator';

export class CreateWarrantyTemplateDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() treatmentCategoryId?: string;
  @IsNumber() @Min(1) durationMonths: number;
  @IsString() @IsNotEmpty() termsAndConditions: string;
  @IsOptional() @IsString() maintenanceRequirements?: string;
  @IsOptional() @IsString() exclusions?: string;
  @IsOptional() @IsBoolean() annualCheckupRequired?: boolean;
}
