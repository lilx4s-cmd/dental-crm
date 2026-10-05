import { IsString, IsOptional, IsNumber, Min, IsBoolean, IsDateString } from 'class-validator';

export class IssueWarrantyDto {
  @IsOptional() @IsBoolean() lifetime?: boolean;
  @IsOptional() @IsString() warrantyTemplateId?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsNumber() @Min(1) durationMonths?: number;
  @IsOptional() @IsString() termsAndConditions?: string;
  @IsOptional() @IsString() maintenanceRequirements?: string;
  @IsOptional() @IsString() exclusions?: string;
  @IsOptional() @IsBoolean() annualCheckupRequired?: boolean;
}
