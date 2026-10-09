import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  JwtPayload,
  canSeeAllLeads,
  canSupervise,
  patientReminderBand,
  CLINIC_TIMEZONE,
} from '@dental-crm/shared';
import { randomUUID } from 'crypto';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Prisma, StaffAlert } from '@prisma/client';
import * as webPush from 'web-push';
import { resolveScheduleEvent, ScheduleContextSchema } from '../patient-schedule/schedule-event';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppSenderService } from '../whatsapp/whatsapp-sender.service';
import { WhatsAppWebService } from '../whatsapp/whatsapp-web.service';
import {
  AlertSettingsSchema,
  StaffPreferencesSchema,
  alertText,
  isWorking,
  workingDeadline,
} from './alert-policy';
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
@Injectable()
export class StaffAlertsService {
  private running = false;
  private readonly logger = new Logger(StaffAlertsService.name);
  constructor(
    private readonly db: PrismaService,
    private readonly sender: WhatsAppSenderService,
    private readonly web: WhatsAppWebService,
    private readonly config: ConfigService,
  ) {}
  async settings() {
    const clinic = await this.db.clinicSettings.findUnique({
      where: { id: 'singleton' },
      select: { notificationSettings: true },
    });
    return AlertSettingsSchema.parse(clinic?.notificationSettings ?? {});
  }
  pushConfig() {
    return {
      publicKey: this.config.get<string>('VAPID_PUBLIC_KEY') ?? null,
      configured:
        !!this.config.get('VAPID_PUBLIC_KEY') &&
        !!this.config.get('VAPID_PRIVATE_KEY') &&
        !!this.config.get('VAPID_SUBJECT'),
    };
  }
  async notifications(userId: string) {
    const where = { userId, channel: 'IN_APP' as const, status: { not: 'FAILED' as const } };
    const [data, unread] = await Promise.all([
      this.db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          title: true,
          body: true,
          createdAt: true,
          readAt: true,
          relatedEntityType: true,
          relatedEntityId: true,
        },
      }),
      this.db.notification.count({ where: { ...where, readAt: null } }),
    ]);
    const alerts = await this.db.staffAlert.findMany({
      where: { userId, id: { in: data.map((n) => n.id) }, kind: 'PATIENT_DATE' },
      select: { id: true, schedule: true },
    });
    const contexts = new Map(
      alerts.map((a) => [a.id, ScheduleContextSchema.safeParse(a.schedule)]),
    );
    return {
      unread,
      data: data.map((n) => {
        const context = contexts.get(n.id);
        const path =
          n.relatedEntityType === 'TRAVEL_BOOKING'
            ? `/travel?bookingId=${encodeURIComponent(n.relatedEntityId ?? '')}`
            : n.relatedEntityType === 'APPOINTMENT' && context?.success
              ? `/appointments?view=day&at=${encodeURIComponent(context.data.at)}`
              : n.relatedEntityType === 'LEAD' && n.relatedEntityId
                ? `/pipeline?leadId=${encodeURIComponent(n.relatedEntityId)}`
                : '/my-day';
        return { ...n, path };
      }),
    };
  }
  async readNotification(userId: string, id: string) {
    const result = await this.db.notification.updateMany({
      where: { id, userId, channel: 'IN_APP' },
      data: { readAt: new Date(), status: 'READ' },
    });
    if (!result.count) throw new NotFoundException('Notification not found');
    return { ok: true };
  }
  async status(userId: string) {
    const staff = await this.db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { notificationPhone: true, notificationPreferences: true },
    });
    return {
      ...staff,
      preferences: StaffPreferencesSchema.parse(staff.notificationPreferences ?? {}),
      push: this.pushConfig(),
      deviceCount: await this.db.pushDevice.count({ where: { userId } }),
    };
  }
  async admin() {
    const [settings, staff, results] = await Promise.all([
      this.settings(),
      this.db.user.findMany({
        where: { isActive: true },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
          notificationPhone: true,
          notificationPreferences: true,
        },
      }),
      this.db.staffAlert.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          userId: true,
          kind: true,
          channel: true,
          state: true,
          attempts: true,
          error: true,
          createdAt: true,
          acceptedAt: true,
          deliveredAt: true,
        },
      }),
    ]);
    return {
      settings,
      staff,
      results,
      whatsapp: await this.sender.alertConnection(),
      push: this.pushConfig(),
      workerEnabled:
        this.config.get('NODE_ENV') === 'production' ||
        this.config.get('STAFF_ALERTS_WORKER_ENABLED') === 'true',
    };
  }
  async updateSettings(input: unknown) {
    const parsed = AlertSettingsSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => i.message));
    if (parsed.data.enabled && !parsed.data.supervisorId)
      throw new BadRequestException('Select the supervisor before enabling alerts');
    const previous = await this.settings();
    parsed.data.enabledSince = parsed.data.enabled
      ? previous.enabled
        ? previous.enabledSince
        : new Date().toISOString()
      : null;
    if (parsed.data.supervisorId) {
      const supervisor = await this.db.user.findUnique({
        where: { id: parsed.data.supervisorId },
        select: { isActive: true, role: true },
      });
      if (!supervisor?.isActive || !['SUPER_ADMIN', 'CLINIC_MANAGER'].includes(supervisor.role))
        throw new BadRequestException(
          'Choose an active clinic manager or administrator who can access unassigned leads',
        );
    }
    const result = await this.db.clinicSettings.update({
      where: { id: 'singleton' },
      data: { notificationSettings: json(parsed.data) },
      select: { notificationSettings: true },
    });
    if (
      previous.patientRemindersEnabled !== parsed.data.patientRemindersEnabled ||
      JSON.stringify(previous.patientReminderHours) !==
        JSON.stringify(parsed.data.patientReminderHours)
    ) {
      await this.db.calendarSync.updateMany({
        where: {
          state: { not: 'PROCESSING' },
          booking: {
            status: { in: ['CONFIRMED', 'ARRIVED', 'COMPLETED'] },
            OR: [{ arrivalAt: { gt: new Date() } }, { departureAt: { gt: new Date() } }],
          },
        },
        data: { state: 'PENDING', attempts: 0, nextAt: new Date(), error: null, lockedAt: null },
      });
    }
    return result;
  }

  async preferences(userId: string, phone: unknown, input: unknown) {
    const parsed = StaffPreferencesSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => i.message));
    const notificationPhone = typeof phone === 'string' && phone.trim() ? phone.trim() : null;
    if (notificationPhone && !/^\+[1-9]\d{7,14}$/.test(notificationPhone))
      throw new BadRequestException('Use a phone number with country code, such as +12025550123');
    if (parsed.data.whatsapp && (!notificationPhone || !parsed.data.optIn))
      throw new BadRequestException(
        'WhatsApp alerts require a staff number and recorded employee opt-in',
      );
    return this.db.user.update({
      where: { id: userId },
      data: { notificationPhone, notificationPreferences: json(parsed.data) },
      select: { id: true, notificationPhone: true, notificationPreferences: true },
    });
  }
  async subscribe(userId: string, input: unknown) {
    const p = input as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    let url: URL;
    try {
      url = new URL(p.endpoint!);
    } catch {
      throw new BadRequestException('Invalid push endpoint');
    }
    const hosts = [
      'fcm.googleapis.com',
      'updates.push.services.mozilla.com',
      'push.apple.com',
      'notify.windows.com',
    ];
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !hosts.some((h) => url.hostname === h || url.hostname.endsWith('.' + h)) ||
      url.href.length > 2500 ||
      !p.keys ||
      !/^[A-Za-z0-9_-]{60,160}$/.test(p.keys.p256dh ?? '') ||
      !/^[A-Za-z0-9_-]{15,80}$/.test(p.keys.auth ?? '')
    )
      throw new BadRequestException('Invalid browser push subscription');
    if (!this.pushConfig().configured)
      throw new BadRequestException(
        'Push server configuration is missing: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT',
      );
    const existing = await this.db.pushDevice.findUnique({ where: { endpoint: url.href } });
    if (existing && (existing.p256dh !== p.keys.p256dh || existing.auth !== p.keys.auth))
      throw new BadRequestException('Subscription keys do not match');
    await this.db.$transaction(async (tx) => {
      await tx.pushDevice.upsert({
        where: { endpoint: url.href },
        create: { userId, endpoint: url.href, p256dh: p.keys!.p256dh!, auth: p.keys!.auth! },
        update: { userId, p256dh: p.keys!.p256dh!, auth: p.keys!.auth! },
      });
      const staff = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { notificationPreferences: true },
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          notificationPreferences: json({
            ...StaffPreferencesSchema.parse(staff.notificationPreferences ?? {}),
            push: true,
          }),
        },
      });
    });
    return { saved: true };
  }
  async recordContact(leadId: string, input: unknown, u: JwtPayload) {
    const v = input as { method?: string; note?: string };
    if (
      !['CALL', 'MESSAGE', 'IN_PERSON'].includes(v.method ?? '') ||
      typeof v.note !== 'string' ||
      v.note.trim().length < 3 ||
      v.note.length > 2000
    )
      throw new BadRequestException('Choose the contact method and enter a short factual note');
    const lead = await this.db.lead.findFirst({
      where: {
        id: leadId,
        ...(canSeeAllLeads(u)
          ? {}
          : canSupervise(u)
            ? { OR: [{ assignedToId: u.sub }, { supervisorId: u.sub }] }
            : { assignedToId: u.sub }),
      },
      select: { id: true },
    });
    if (!lead) throw new BadRequestException('Lead not available');
    const now = new Date();
    return this.db.leadActivity.create({
      data: {
        leadId,
        userId: u.sub,
        contactRecordedAt: now,
        contactMethod: v.method,
        note: v.note.trim(),
      },
    });
  }
  async deviceCheck(userId: string, endpoint: string) {
    return {
      saved: !!(await this.db.pushDevice.findFirst({
        where: { userId, endpoint },
        select: { id: true },
      })),
    };
  }
  async unsubscribe(userId: string, endpoint: string) {
    await this.db.pushDevice.deleteMany({ where: { userId, endpoint } });
    return { removed: true };
  }
  async test(userId: string, channel: 'WHATSAPP' | 'PUSH') {
    const staff = await this.status(userId);
    if (
      channel === 'WHATSAPP' &&
      (!staff.preferences.whatsapp || !staff.preferences.optIn || !staff.notificationPhone)
    )
      throw new BadRequestException(
        'Save this employee’s notification phone and WhatsApp opt-in first',
      );
    if (
      channel === 'PUSH' &&
      (!staff.preferences.push || !staff.deviceCount || !staff.push.configured)
    )
      throw new BadRequestException(
        'Enable notifications on the employee’s device and configure VAPID first',
      );
    const row = await this.db.staffAlert.create({
      data: { userId, kind: 'TEST', channel, dedupeKey: 'test-' + randomUUID() },
    });
    await this.deliver(row, new Date(), true);
    return this.db.staffAlert.findUnique({
      where: { id: row.id },
      select: { id: true, state: true, error: true, acceptedAt: true, deliveredAt: true },
    });
  }
  private async enqueue(eventId: string, userId: string, kind: string, dueAt: Date) {
    const staff = await this.db.user.findUnique({
      where: { id: userId },
      select: { isActive: true, notificationPreferences: true },
    });
    if (!staff?.isActive) return;
    const p = StaffPreferencesSchema.parse(staff.notificationPreferences ?? {});
    for (const channel of [
      'IN_APP',
      ...(p.whatsapp && p.optIn ? ['WHATSAPP'] : []),
      ...(p.push ? ['PUSH'] : []),
    ])
      await this.db.staffAlert.upsert({
        where: { dedupeKey: `${eventId}:${userId}:${kind}:${channel}` },
        create: {
          eventId,
          userId,
          kind,
          channel,
          dueAt,
          dedupeKey: `${eventId}:${userId}:${kind}:${channel}`,
        },
        update: {},
      });
  }
  private async contacted(leadId: string, since: Date) {
    const [calls, messages, manual] = await Promise.all([
      this.db.callLog.count({
        where: {
          leadId,
          outcome: 'ANSWERED',
          occurredAt: { gte: since },
          createdAt: { gte: since },
        },
      }),
      this.db.message.count({
        where: {
          conversation: { leadId },
          direction: 'OUTBOUND',
          status: { in: ['SENT', 'DELIVERED', 'READ'] },
          createdAt: { gte: since },
        },
      }),
      this.db.leadActivity.count({
        where: { leadId, createdAt: { gte: since }, contactRecordedAt: { gte: since } },
      }),
    ]);
    return calls + messages + manual > 0;
  }
  @Cron('*/30 * * * * *') async sweep() {
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
      this.logger.error(e instanceof Error ? e.message : 'Alert worker failed');
    } finally {
      this.running = false;
    }
  }
  async run(now: Date) {
    const settings = await this.settings();
    await this.db.staffAlert.updateMany({
      where: {
        state: 'SENDING',
        channel: 'IN_APP',
        attemptedAt: { lt: new Date(now.getTime() - 5 * 60000) },
      },
      data: { state: 'QUEUED', error: 'Resuming idempotent CRM notification after worker restart' },
    });
    await this.db.staffAlert.updateMany({
      where: {
        state: 'SENDING',
        channel: { not: 'IN_APP' },
        attemptedAt: { lt: new Date(now.getTime() - 5 * 60000) },
      },
      data: {
        state: 'UNCERTAIN',
        error:
          'Worker stopped during send. Check recipient/provider before sending a new test; automatic retry is disabled.',
      },
    });
    const events = settings.enabled
      ? await this.db.leadAssignmentEvent.findMany({
          where: {
            closedAt: null,
            OR: [
              { initializedAt: null },
              { remindedAt: null, reminderAt: { lte: now } },
              { escalatedAt: null, escalationAt: { lte: now } },
            ],
          },
          include: { lead: true },
          orderBy: { createdAt: 'asc' },
          take: 100,
        })
      : [];
    for (const e of events) {
      if (settings.enabledSince && e.createdAt < new Date(settings.enabledSince)) {
        await this.db.leadAssignmentEvent.update({ where: { id: e.id }, data: { closedAt: now } });
        continue;
      }
      if (
        e.lead.assignmentRevision !== e.revision ||
        e.lead.assignedToId !== e.assignedToId ||
        e.lead.mergedIntoId ||
        e.lead.status !== 'ACTIVE' ||
        settings.excludedStages.includes(e.lead.stage) ||
        (await this.contacted(e.leadId, e.createdAt))
      ) {
        await this.db.$transaction([
          this.db.leadAssignmentEvent.update({ where: { id: e.id }, data: { closedAt: now } }),
          this.db.staffAlert.updateMany({
            where: { eventId: e.id, state: 'QUEUED' },
            data: {
              state: 'CANCELLED',
              error: 'Assignment changed, contact recorded, or lead excluded',
            },
          }),
        ]);
        continue;
      }
      const recipient = e.assignedToId ?? settings.supervisorId;
      if (!recipient) continue;
      const staff = await this.db.user.findUnique({
        where: { id: recipient },
        select: { notificationPreferences: true, isActive: true },
      });
      if (!staff?.isActive) continue;
      const p = StaffPreferencesSchema.parse(staff.notificationPreferences ?? {});
      if (!e.initializedAt) {
        const due = workingDeadline(e.createdAt, 0, p),
          reminder = workingDeadline(e.createdAt, settings.reminderMinutes, p),
          escalation = workingDeadline(reminder, settings.escalationMinutes, p);
        await this.enqueue(e.id, recipient, 'ASSIGNMENT', due);
        await this.db.leadAssignmentEvent.update({
          where: { id: e.id },
          data: { initializedAt: now, reminderAt: reminder, escalationAt: escalation },
        });
      }
      if (!e.remindedAt && e.reminderAt && e.reminderAt <= now) {
        await this.enqueue(e.id, recipient, 'REMINDER', e.reminderAt);
        await this.db.leadAssignmentEvent.update({
          where: { id: e.id },
          data: { remindedAt: now },
        });
      }
      if (!e.escalatedAt && e.escalationAt && e.escalationAt <= now) {
        if (settings.supervisorId && settings.supervisorId !== recipient)
          await this.enqueue(e.id, settings.supervisorId, 'ESCALATION', e.escalationAt);
        await this.db.leadAssignmentEvent.update({
          where: { id: e.id },
          data: { escalatedAt: now },
        });
      }
    }
    const queue = await this.db.staffAlert.findMany({
      where: {
        state: 'QUEUED',
        dueAt: { lte: now },
        ...(!settings.enabled ? { kind: { in: ['PATIENT_DATE', 'TEST'] } } : {}),
      },
      orderBy: { dueAt: 'asc' },
      take: 100,
    });
    for (const alert of queue) await this.deliver(alert, now);
  }
  async deliver(alert: StaffAlert, now: Date, test = false) {
    const staff = await this.db.user.findUnique({
      where: { id: alert.userId },
      select: {
        isActive: true,
        notificationPhone: true,
        notificationPreferences: true,
        role: true,
        email: true,
        accessProfile: { select: { permissions: true } },
      },
    });
    if (!staff?.isActive)
      return this.db.staffAlert.update({
        where: { id: alert.id },
        data: { state: 'CANCELLED', error: 'Employee inactive' },
      });
    const p = StaffPreferencesSchema.parse(staff.notificationPreferences ?? {});
    const settings = await this.settings();
    let schedule: Awaited<ReturnType<typeof resolveScheduleEvent>> = null;
    if (alert.kind === 'PATIENT_DATE') {
      const context = ScheduleContextSchema.safeParse(alert.schedule);
      if (
        context.success &&
        settings.patientRemindersEnabled &&
        settings.patientReminderHours.includes(context.data.hours)
      ) {
        schedule = await resolveScheduleEvent(
          this.db,
          context.data,
          {
            sub: alert.userId,
            email: staff.email,
            role: staff.role,
            permissions: staff.accessProfile?.permissions as Record<string, boolean> | undefined,
          },
          now,
        );
        if (
          schedule &&
          patientReminderBand(schedule.at, now, settings.patientReminderHours) !==
            context.data.hours
        )
          schedule = null;
      }
      if (!schedule || !['IN_APP', 'PUSH'].includes(alert.channel)) {
        await this.db.notification.updateMany({
          where: { id: alert.id, readAt: null },
          data: { readAt: now, status: 'READ' },
        });
        return this.db.staffAlert.update({
          where: { id: alert.id },
          data: {
            state: 'CANCELLED',
            error: 'Patient reminder disabled, stale or no longer assigned',
          },
        });
      }
    }
    const event = alert.eventId
      ? await this.db.leadAssignmentEvent.findUnique({
          where: { id: alert.eventId },
          include: { lead: true },
        })
      : null;
    if (
      alert.eventId &&
      (!event ||
        event.closedAt ||
        event.lead.assignmentRevision !== event.revision ||
        (await this.contacted(event.leadId, event.createdAt)))
    )
      return this.db.staffAlert.update({
        where: { id: alert.id },
        data: { state: 'CANCELLED', error: 'Stale alert' },
      });
    if (!test && !(schedule && alert.channel === 'IN_APP') && !isWorking(now, p))
      return this.db.staffAlert.update({
        where: { id: alert.id },
        data: { dueAt: workingDeadline(now, 0, p) },
      });
    const path =
      schedule?.path ??
      (event ? '/pipeline?leadId=' + encodeURIComponent(event.leadId) : '/my-day');
    const url = `${(this.config.get<string[]>('cors.origin') ?? [])[0] ?? this.config.get<string>('webUrl')}${path}`;
    const title = schedule ? `${schedule.label} · ${schedule.patientName}` : 'Lead alert';
    const when = schedule
      ? schedule.localTime ||
        new Intl.DateTimeFormat('en-GB', {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: CLINIC_TIMEZONE,
        }).format(schedule.at)
      : '';
    const body = schedule
      ? `${schedule.patientName} — ${schedule.label}: ${when} (${schedule.timezone}). Open the booking: ${url}`
      : alertText(
          alert.kind,
          p.language,
          event?.lead.preferredLanguage ?? null,
          event?.lead.source ?? '',
          url,
          settings.reminderMinutes,
        );
    if (alert.channel === 'WHATSAPP') {
      if (!p.whatsapp || !p.optIn || !staff.notificationPhone)
        return this.db.staffAlert.update({
          where: { id: alert.id },
          data: { state: 'CANCELLED', error: 'WhatsApp preference or opt-in disabled' },
        });
      const transport = this.sender.activeTransport();
      const connection = await this.sender.alertConnection();
      if (transport !== 'cloud_api' && !connection.canSend)
        return this.db.staffAlert.update({
          where: { id: alert.id },
          data: {
            dueAt: new Date(
              now.getTime() + Math.min(3600, 30 * 2 ** Math.min(alert.attempts, 7)) * 1000,
            ),
            attempts: { increment: 1 },
            error: 'WhatsApp disconnected; CRM and enabled push alerts remain available',
          },
        });
      if (transport === 'cloud_api')
        return this.db.staffAlert.update({
          where: { id: alert.id },
          data: {
            state: 'FAILED',
            error:
              'Staff alerts require the linked phone/gateway. Cloud API staff templates are not configured; free-form business-initiated alerts are not sent.',
          },
        });
    }
    if (alert.channel === 'PUSH' && !p.push)
      return this.db.staffAlert.update({
        where: { id: alert.id },
        data: { state: 'CANCELLED', error: 'Push preference disabled' },
      });
    const claimed = await this.db.staffAlert.updateMany({
      where: { id: alert.id, state: 'QUEUED' },
      data: { state: 'SENDING', attemptedAt: now, attempts: { increment: 1 } },
    });
    if (!claimed.count) return;
    try {
      if (alert.channel === 'IN_APP') {
        await this.db.notification.upsert({
          where: { id: alert.id },
          create: {
            id: alert.id,
            userId: alert.userId,
            channel: 'IN_APP',
            title,
            body,
            status: 'SENT',
            sentAt: now,
            relatedEntityType: schedule?.type ?? 'LEAD',
            relatedEntityId: schedule?.entityId ?? event?.leadId,
          },
          update: {},
        });
      } else if (alert.channel === 'WHATSAPP') {
        await this.sender.sendText(staff.notificationPhone!, body);
      } else {
        await this.sendPush(alert.userId, {
          title: schedule ? title : 'CRM lead alert',
          body: schedule
            ? `${when} (${schedule.timezone})`
            : alert.kind === 'TEST'
              ? 'Test notification'
              : 'A CRM update needs your attention.',
          url,
          tag: alert.id,
        });
      }
      await this.db.staffAlert.update({
        where: { id: alert.id },
        data: { state: 'ACCEPTED', acceptedAt: now, error: null },
      });
    } catch (e) {
      const status =
        (e as { providerStatus?: number }).providerStatus ??
        (e as { statusCode?: number; status?: number }).statusCode ??
        (e as { status?: number }).status;
      const error = (e instanceof Error ? e.message.slice(0, 500) : 'Provider error').replace(
        /Bearer\s+\S+/gi,
        'Bearer [redacted]',
      );
      if (status === 429) {
        await this.db.staffAlert.update({
          where: { id: alert.id },
          data: {
            state: 'QUEUED',
            dueAt: new Date(
              now.getTime() + Math.min(3600, 60 * 2 ** Math.min(alert.attempts, 6)) * 1000,
            ),
            error: 'Provider rate limit; retry scheduled',
          },
        });
        return;
      }
      await this.db.staffAlert.update({
        where: { id: alert.id },
        data: {
          state: 'UNCERTAIN',
          error: `${error}. Provider acceptance is uncertain; no automatic resend.`,
        },
      });
    }
  }
  private async sendPush(userId: string, payload: object) {
    if (!this.pushConfig().configured)
      throw new BadRequestException('VAPID push configuration missing');
    const devices = await this.db.pushDevice.findMany({ where: { userId } });
    if (!devices.length) throw new BadRequestException('No subscribed devices');
    const vapidDetails = {
      subject: this.config.get<string>('VAPID_SUBJECT')!,
      publicKey: this.config.get<string>('VAPID_PUBLIC_KEY')!,
      privateKey: this.config.get<string>('VAPID_PRIVATE_KEY')!,
    };
    let accepted = 0;
    for (const device of devices) {
      try {
        await webPush.sendNotification(
          { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
          JSON.stringify(payload),
          { vapidDetails, TTL: 3600, timeout: 10000 },
        );
        accepted++;
      } catch (e) {
        if ([404, 410].includes((e as { statusCode?: number }).statusCode ?? 0))
          await this.db.pushDevice.deleteMany({ where: { id: device.id } });
        else throw e;
      }
    }
    if (!accepted)
      throw new BadRequestException(
        'All subscriptions expired; re-enable notifications on the device',
      );
  }
}
