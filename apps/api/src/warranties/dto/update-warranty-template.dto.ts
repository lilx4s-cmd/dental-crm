import { IsString, IsOptional, IsNumber, Min, IsBoolean } from 'class-validator';

export class UpdateWarrantyTemplateDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() treatmentCategoryId?: string;
  @IsOptional() @IsNumber() @Min(1) durationMonths?: number;
  @IsOptional() @IsString() termsAndConditions?: string;
  @IsOptional() @IsString() maintenanceRequirements?: string;
  @IsOptional() @IsString() exclusions?: string;
  @IsOptional() @IsBoolean() annualCheckupRequired?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
