import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  patientReminderBand,
  CLINIC_TIMEZONE,
  type JwtPayload,
  type PatientCalendarEvent,
} from '@dental-crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StaffAlertsService } from '../staff-alerts/staff-alerts.service';
import { StaffPreferencesSchema } from '../staff-alerts/alert-policy';
import { flightSchema } from '../travel-finance/policy';
import {
  resolveScheduleEvent,
  ScheduleContextSchema,
  travelScheduleScope,
  type ScheduleContext,
} from './schedule-event';

@Injectable()
export class PatientScheduleService {
  private running = false;
  private cleanupAfter: string | undefined;
  private logger = new Logger(PatientScheduleService.name);
  constructor(
    private db: PrismaService,
    private alerts: StaffAlertsService,
    private config: ConfigService,
  ) {}

  @Cron('0 * * * * *')
  async sweep() {
    if (
      this.running ||
      !(
        this.config.get('NODE_ENV') === 'production' ||
        this.config.get('STAFF_ALERTS_WORKER_ENABLED') === 'true'
      )
    )
      return;
    this.running = true;
    try {
      await this.run(new Date());
    } catch (e) {
      this.logger.error(e instanceof Error ? e.message : 'Patient reminder sweep failed');
    } finally {
      this.running = false;
    }
  }

  async run(now: Date) {
    const settings = await this.alerts.settings();
    const users = await this.db.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        email: true,
        role: true,
        notificationPreferences: true,
        accessProfile: { select: { permissions: true } },
      },
    });
    const payload = (u: (typeof users)[number]): JwtPayload => ({
      sub: u.id,
      email: u.email,
      role: u.role,
      permissions: u.accessProfile?.permissions as Record<string, boolean> | undefined,
    });
    const people = new Map(users.map((u) => [u.id, u]));
    const checked = new Map<string, ReturnType<typeof resolveScheduleEvent>>();
    const resolve = (context: ScheduleContext, person: (typeof users)[number]) => {
      const key = `${context.kind}:${context.id}:${context.at}:${context.cycle}:${person.id}`;
      if (!checked.has(key))
        checked.set(key, resolveScheduleEvent(this.db, context, payload(person), now));
      return checked.get(key)!;
    };
    // Clear stale notifications as well as queued sends when dates, ownership or cancellation
    // change. Bounded batches are revisited each minute; the sender revalidates before delivery.
    const old = await this.db.staffAlert.findMany({
      where: { kind: 'PATIENT_DATE', state: { in: ['QUEUED', 'ACCEPTED', 'UNCERTAIN'] } },
      ...(this.cleanupAfter ? { cursor: { id: this.cleanupAfter }, skip: 1 } : {}),
      take: 500,
      orderBy: { id: 'asc' },
    });
    const known = new Set(old.map((row) => row.dedupeKey));
    this.cleanupAfter = old.length === 500 ? old[old.length - 1].id : undefined;
    for (const row of old) {
      const context = ScheduleContextSchema.safeParse(row.schedule);
      const person = people.get(row.userId);
      if (
        !settings.patientRemindersEnabled ||
        !context.success ||
        !settings.patientReminderHours.includes(context.data.hours) ||
        !person ||
        !(await resolve(context.data, person))
      ) {
        await this.db.staffAlert.update({
          where: { id: row.id },
          data: {
            state: 'CANCELLED',
            error: 'Event cancelled, rescheduled, passed or no longer accessible',
          },
        });
        await this.db.notification.updateMany({
          where: { id: row.id, readAt: null },
          data: { readAt: now, status: 'READ' },
        });
      }
    }
    if (!settings.patientRemindersEnabled) return { queued: 0 };
    const to = new Date(now.getTime() + Math.max(...settings.patientReminderHours) * 3600000);
    const [appointments, bookings] = await Promise.all([
      this.db.appointment.findMany({
        where: {
          startTime: { gt: now, lte: to },
          status: { in: ['SCHEDULED', 'CONFIRMED'] },
          patient: { isActive: true },
        },
        select: {
          id: true,
          startTime: true,
          dentistId: true,
          createdById: true,
          patient: {
            select: { convertedFromLead: { select: { assignedToId: true, supervisorId: true } } },
          },
        },
      }),
      this.db.travelBooking.findMany({
        where: {
          status: { in: ['CONFIRMED', 'ARRIVED', 'COMPLETED'] },
          patient: { isActive: true },
          OR: [{ arrivalAt: { gt: now, lte: to } }, { departureAt: { gt: now, lte: to } }],
        },
        select: {
          id: true,
          arrivalAt: true,
          departureAt: true,
          calendarCycle: true,
          status: true,
          lead: { select: { assignedToId: true, supervisorId: true } },
        },
      }),
    ]);
    let queued = 0;
    const managers = users
      .filter((u) => ['SUPER_ADMIN', 'CLINIC_MANAGER'].includes(u.role))
      .map((u) => u.id);
    const queue = async (context: ScheduleContext, ids: (string | null | undefined)[]) => {
      for (const id of new Set([...managers, ...ids].filter((id): id is string => !!id))) {
        const person = people.get(id);
        if (!person) continue;
        const preferences = StaffPreferencesSchema.parse(person.notificationPreferences ?? {});
        const pending = ['IN_APP', ...(preferences.push ? ['PUSH'] : [])]
          .map((channel) => ({
            channel,
            dedupeKey: `patient:${context.kind}:${context.id}:${context.at}:${context.cycle}:${context.hours}:${id}:${channel}`,
          }))
          .filter((row) => !known.has(row.dedupeKey));
        if (!pending.length || !(await resolve(context, person))) continue;
        for (const { channel, dedupeKey } of pending) {
          const alert = await this.db.staffAlert.upsert({
            where: { dedupeKey },
            create: {
              userId: id,
              kind: 'PATIENT_DATE',
              channel,
              dueAt: now,
              dedupeKey,
              schedule: context as unknown as Prisma.InputJsonValue,
            },
            update: {},
          });
          // A cancelled, unsent reminder may be restored; accepted sends remain deduplicated.
          if (alert.state === 'CANCELLED' && alert.attempts === 0)
            await this.db.staffAlert.updateMany({
              where: { id: alert.id, state: 'CANCELLED', attempts: 0 },
              data: { state: 'QUEUED', dueAt: now, error: null },
            });
          known.add(dedupeKey);
          queued++;
        }
      }
    };
    for (const a of appointments) {
      const hours = patientReminderBand(a.startTime, now, settings.patientReminderHours);
      if (hours !== null)
        await queue(
          { kind: 'APPOINTMENT', id: a.id, at: a.startTime.toISOString(), hours, cycle: 1 },
          [
            a.dentistId,
            a.createdById,
            a.patient.convertedFromLead?.assignedToId,
            a.patient.convertedFromLead?.supervisorId,
          ],
        );
    }
    for (const b of bookings)
      for (const kind of ['ARRIVAL', 'DEPARTURE'] as const) {
        const at = kind === 'ARRIVAL' ? b.arrivalAt : b.departureAt;
        if (!at || (kind === 'ARRIVAL' && b.status === 'COMPLETED')) continue;
        const hours = patientReminderBand(at, now, settings.patientReminderHours);
        if (hours !== null)
          await queue({ kind, id: b.id, at: at.toISOString(), hours, cycle: b.calendarCycle }, [
            b.lead.assignedToId,
            b.lead.supervisorId,
          ]);
      }
    return { queued };
  }

  async calendar(from: string, to: string, user: JwtPayload): Promise<PatientCalendarEvent[]> {
    const start = new Date(from),
      end = new Date(to);
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      end <= start ||
      end.getTime() - start.getTime() > 93 * 86400000
    )
      throw new BadRequestException('Choose a calendar range of up to 93 days');
    const rows = await this.db.travelBooking.findMany({
      where: {
        ...travelScheduleScope(user),
        patient: { isActive: true },
        status: { in: ['CONFIRMED', 'ARRIVED', 'COMPLETED'] },
        OR: [{ arrivalAt: { gte: start, lte: end } }, { departureAt: { gte: start, lte: end } }],
      },
      select: {
        id: true,
        patientId: true,
        leadId: true,
        visit: true,
        arrivalAt: true,
        departureAt: true,
        details: true,
        patient: { select: { firstName: true, lastName: true } },
      },
      orderBy: { arrivalAt: 'asc' },
    });
    const events: PatientCalendarEvent[] = [];
    for (const b of rows)
      for (const kind of ['ARRIVAL', 'DEPARTURE'] as const) {
        const at = kind === 'ARRIVAL' ? b.arrivalAt : b.departureAt;
        if (!at || at < start || at > end) continue;
        const flight = flightSchema.safeParse(
          ((b.details ?? {}) as Record<string, unknown>)[
            kind === 'ARRIVAL' ? 'arrival' : 'departure'
          ],
        );
        events.push({
          id: `${b.id}:${kind}`,
          kind,
          patientId: b.patientId,
          patientName: `${b.patient.firstName} ${b.patient.lastName}`.trim(),
          bookingId: b.id,
          leadId: b.leadId,
          visit: b.visit,
          startTime: at.toISOString(),
          endTime: new Date(at.getTime() + 30 * 60000).toISOString(),
          localTime: flight.success ? flight.data.local.replace('T', ' ') : '',
          timezone: flight.success ? flight.data.timezone : CLINIC_TIMEZONE,
          flightNumber: flight.success ? flight.data.number : '',
          route: flight.success ? `${flight.data.origin} → ${flight.data.destination}` : '',
        });
      }
    return events;
  }
}
