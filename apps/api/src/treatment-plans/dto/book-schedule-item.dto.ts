import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { $Enums } from '@prisma/client';

/**
 * Booking an itinerary line into the diary.
 *
 * Times are given explicitly rather than derived from the line. A schedule item's `time` is free
 * text — "Morning" is a legitimate value while the exact slot is undecided — so parsing it would
 * reserve a chair at an hour nobody chose.
 */
export class BookScheduleItemDto {
  @ApiProperty({ example: '2026-09-16T09:00:00.000Z' })
  @IsDateString()
  startTime: string;

  @ApiProperty({ example: '2026-09-16T13:00:00.000Z' })
  @IsDateString()
  endTime: string;

  @ApiPropertyOptional({ description: 'Leaving this unset books the chair without naming a dentist' })
  @IsUUID()
  @IsOptional()
  dentistId?: string;

  @ApiPropertyOptional({ enum: $Enums.AppointmentType, default: $Enums.AppointmentType.TREATMENT })
  @IsEnum($Enums.AppointmentType)
  @IsOptional()
  type?: $Enums.AppointmentType;
}
