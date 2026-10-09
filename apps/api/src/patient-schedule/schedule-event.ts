import { z } from 'zod';
import { Prisma } from '@prisma/client';
import {
  canSeeAllLeads,
  canSupervise,
  hasPermission,
  CLINICAL,
  CLINIC_TIMEZONE,
  type JwtPayload,
} from '@dental-crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { flightSchema } from '../travel-finance/policy';

export const ScheduleContextSchema = z.object({
  kind: z.enum(['APPOINTMENT', 'ARRIVAL', 'DEPARTURE']),
  id: z.string(),
  at: z.string().datetime(),
  hours: z.number().int().positive(),
  cycle: z.number().int().positive().default(1),
});
export type ScheduleContext = z.infer<typeof ScheduleContextSchema>;
export function travelScheduleScope(user: JwtPayload): Prisma.TravelBookingWhereInput {
  if (
    hasPermission(user, 'patients.read', CLINICAL.includes(user.role as never)) ||
    canSeeAllLeads(user)
  )
    return {};
  return {
    lead: canSupervise(user)
      ? { OR: [{ assignedToId: user.sub }, { supervisorId: user.sub }] }
      : { assignedToId: user.sub },
  };
}
function responsible(user: JwtPayload, ids: (string | null | undefined)[]) {
  return ['SUPER_ADMIN', 'CLINIC_MANAGER'].includes(user.role) || ids.includes(user.sub);
}
export async function resolveScheduleEvent(
  db: PrismaService,
  context: ScheduleContext,
  user: JwtPayload,
  now: Date,
) {
  if (!hasPermission(user, 'appointments.read', true)) return null;
  if (context.kind === 'APPOINTMENT') {
    const event = await db.appointment.findFirst({
      where: {
        id: context.id,
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
        patient: { isActive: true },
      },
      select: {
        startTime: true,
        patientId: true,
        dentistId: true,
        createdById: true,
        patient: {
          select: {
            firstName: true,
            lastName: true,
            convertedFromLead: { select: { assignedToId: true, supervisorId: true } },
          },
        },
      },
    });
    if (
      !event ||
      !responsible(user, [
        event.dentistId,
        event.createdById,
        event.patient.convertedFromLead?.assignedToId,
        event.patient.convertedFromLead?.supervisorId,
      ]) ||
      event.startTime.toISOString() !== context.at ||
      event.startTime <= now
    )
      return null;
    return {
      patientId: event.patientId,
      patientName: `${event.patient.firstName} ${event.patient.lastName}`.trim(),
      label: 'Clinic appointment',
      localTime: '',
      timezone: CLINIC_TIMEZONE,
      at: event.startTime,
      path: `/appointments?view=day&at=${encodeURIComponent(event.startTime.toISOString())}`,
      type: 'APPOINTMENT',
      entityId: context.id,
    };
  }
  if (
    !hasPermission(user, 'leads.read', user.role !== 'DENTIST') &&
    !hasPermission(user, 'patients.read', CLINICAL.includes(user.role as never))
  )
    return null;
  const event = await db.travelBooking.findFirst({
    where: {
      id: context.id,
      status: {
        in:
          context.kind === 'ARRIVAL'
            ? ['CONFIRMED', 'ARRIVED']
            : ['CONFIRMED', 'ARRIVED', 'COMPLETED'],
      },
      patient: { isActive: true },
      ...travelScheduleScope(user),
    },
    select: {
      arrivalAt: true,
      departureAt: true,
      calendarCycle: true,
      details: true,
      patientId: true,
      lead: { select: { assignedToId: true, supervisorId: true } },
      patient: { select: { firstName: true, lastName: true } },
    },
  });
  const at = context.kind === 'ARRIVAL' ? event?.arrivalAt : event?.departureAt;
  if (
    !event ||
    !responsible(user, [event.lead.assignedToId, event.lead.supervisorId]) ||
    !at ||
    at.toISOString() !== context.at ||
    at <= now ||
    event.calendarCycle !== context.cycle
  )
    return null;
  const details = (event.details ?? {}) as Record<string, unknown>;
  const flight = flightSchema.safeParse(
    details[context.kind === 'ARRIVAL' ? 'arrival' : 'departure'],
  );
  return {
    patientId: event.patientId,
    patientName: `${event.patient.firstName} ${event.patient.lastName}`.trim(),
    label: context.kind === 'ARRIVAL' ? 'Patient arrival' : 'Patient departure',
    localTime: flight.success
      ? `${flight.data.local.replace('T', ' ')} · ${flight.data.number} · ${flight.data.origin} → ${flight.data.destination}`
      : '',
    timezone: flight.success ? flight.data.timezone : CLINIC_TIMEZONE,
    at,
    path: `/travel?bookingId=${encodeURIComponent(context.id)}`,
    type: 'TRAVEL_BOOKING',
    entityId: context.id,
  };
}
