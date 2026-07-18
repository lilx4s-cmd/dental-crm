import { IsString, IsOptional, IsEnum, IsDateString } from 'class-validator';

const APPOINTMENT_STATUSES = ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED'] as const;

export class UpdateAppointmentDto {
  @IsOptional() @IsString() dentistId?: string;
  @IsOptional() @IsString() resourceId?: string;
  @IsOptional() @IsDateString() startTime?: string;
  @IsOptional() @IsDateString() endTime?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() cancelReason?: string;
  @IsOptional() @IsEnum(APPOINTMENT_STATUSES) status?: string;
}
