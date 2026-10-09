import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { patientMonthRange } from '@dental-crm/shared';
import { PatientsQueryDto } from './dto/patients-query.dto';
export const UPCOMING_APPOINTMENTS = ['SCHEDULED', 'CONFIRMED'] as const;
export const VISIBLE_BOOKINGS = ['CONFIRMED', 'ARRIVED', 'COMPLETED'];
export function patientBaseWhere(q: PatientsQueryDto): Prisma.PatientWhereInput {
  return {
    isActive: true,
    ...(q.search
      ? {
          AND: q.search
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .map((term) => ({
              OR: ['firstName', 'lastName', 'email', 'phone', 'whatsappNumber'].map((key) => ({
                [key]: { contains: term, mode: 'insensitive' },
              })),
            })),
        }
      : {}),
    ...(q.tagId ? { tags: { some: { tagId: q.tagId } } } : {}),
    ...(q.staffId ? { convertedFromLead: { assignedToId: q.staffId } } : {}),
  };
}
export function reservationRange(now: Date, month?: string, dueDays?: number) {
  let range: { gte: Date; lt?: Date } = { gte: now };
  if (month) {
    try {
      const bounds = patientMonthRange(month);
      range = { gte: bounds.from, lt: bounds.to };
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }
  if (dueDays) {
    const end = new Date(now.getTime() + dueDays * 86400000);
    range = {
      gte: new Date(Math.max(range.gte.getTime(), now.getTime())),
      lt: range.lt && range.lt < end ? range.lt : end,
    };
  }
  return range;
}
export function reservationBookingWhere(
  now: Date,
  month?: string,
  dueDays?: number,
): Prisma.TravelBookingWhereInput {
  const range = reservationRange(now, month, dueDays);
  return { status: { in: VISIBLE_BOOKINGS }, OR: [{ arrivalAt: range }, { departureAt: range }] };
}
export function reservationWhere(
  now: Date,
  month?: string,
  dueDays?: number,
): Prisma.PatientWhereInput {
  const range = reservationRange(now, month, dueDays);
  return {
    OR: [
      { travelBookings: { some: reservationBookingWhere(now, month, dueDays) } },
      { appointments: { some: { status: { in: [...UPCOMING_APPOINTMENTS] }, startTime: range } } },
    ],
  };
}
export function patientListWhere(q: PatientsQueryDto, now: Date): Prisma.PatientWhereInput {
  const filters: Prisma.PatientWhereInput[] = [patientBaseWhere(q)];
  if (q.view === 'working') filters.push({ treatmentStatus: 'WORKING' });
  if (q.view === 'finished') filters.push({ treatmentStatus: 'FINISHED' });
  if (q.view === 'reservations' || q.month || q.dueDays)
    filters.push(reservationWhere(now, q.month, q.dueDays));
  return { AND: filters };
}
