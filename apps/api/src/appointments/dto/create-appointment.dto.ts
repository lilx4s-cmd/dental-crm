import { IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString } from 'class-validator';

const APPOINTMENT_TYPES = ['CONSULTATION', 'TREATMENT', 'FOLLOW_UP', 'CLEANING', 'EMERGENCY', 'OTHER'] as const;

export class CreateAppointmentDto {
  @IsString() @IsNotEmpty() patientId: string;
  @IsOptional() @IsString() dentistId?: string;
  @IsOptional() @IsString() resourceId?: string;
  @IsEnum(APPOINTMENT_TYPES) type: string;
  @IsDateString() startTime: string;
  @IsDateString() endTime: string;
  @IsOptional() @IsString() notes?: string;
}
