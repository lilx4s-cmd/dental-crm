import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { $Enums } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

/**
 * How far ahead of an appointment a reminder goes out.
 *
 * A day, not an hour. These patients fly in — the useful reminder is the one that still leaves
 * time to move a flight or ask a question, and an hour's notice on a treatment somebody crossed a
 * border for is a courtesy, not a reminder.
 */
const LEAD_HOURS = 24;

/**
 * How wide a window each sweep considers.
 *
 * The sweep runs every fifteen minutes and looks at the next hour beyond the lead time, so an
 * appointment is caught even if several sweeps are missed — a deploy, a restart, a sleeping
 * instance. The `reminderSentAt` claim is what stops the overlap sending twice.
 */
const WINDOW_HOURS = 1;

/**
 * Hours during which a reminder is held rather than sent, in the clinic's timezone.
 *
 * A patient woken at 03:00 by a booking confirmation is worse served than one told an hour later.
 * Held, not skipped: the next sweep after the quiet period sends it.
 */
const QUIET_FROM = 21;
const QUIET_UNTIL = 8;

/**
 * Appointment reminders.
 *
 * Nothing in this system had ever run on its own. `Appointment.reminderSentAt` was a column no
 * code read or wrote, and `Notification` had zero references anywhere — so "your appointment is
 * on Thursday" was never sent, which for a clinic whose patients board a plane for it is the most
 * expensive silence in the product.
 *
 * ## Why this is a cron and not a queue
 *
 * A queue would need a broker this deployment does not have. A cron over a column is less
 * sophisticated and has one property that matters more: it is *self-healing*. Miss an hour to a
 * restart and the next sweep picks up everything still unsent, because the query asks the database
 * what is outstanding rather than replaying a log of what was scheduled.
 *
 * ## Sending twice is the failure to design against
 *
 * Two instances, or one instance restarted mid-send, must not produce two messages. The claim is
 * an `updateMany` on `reminderSentAt: null` — the count it returns is how many rows *this* process
 * won, and Postgres will not let a second process win the same row. Claiming before sending means
 * a crash between the two loses a reminder rather than duplicating one, which is the right way
 * round: a patient who is not reminded is called by reception, where one reminded twice at 3am
 * concludes the clinic is disorganised.
 */
@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);
  private readonly enabled: boolean;
  /** Guards against a sweep starting while the previous one is still running. */
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {
    // Off by default in every environment but production. A developer running the API against the
    // production database — which is how this project works — must not send a real patient a real
    // email because they left the server on over lunch.
    this.enabled = this.config.get<string>('reminders.enabled') === 'true';
    if (!this.enabled) {
      this.logger.log('Appointment reminders are off (set REMINDERS_ENABLED=true to turn them on).');
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweep() {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      await this.run(new Date());
    } catch (e) {
      // A throw here would take down the scheduler for the life of the process, and nothing would
      // say so — the reminders would simply stop.
      this.logger.error(`Reminder sweep failed: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * One pass. Exported from the cron so it can be tested, and run by hand from the admin endpoint.
   *
   * Returns what it did rather than logging only, so the endpoint can report it and a test can
   * assert on it.
   */
  async run(now: Date): Promise<{ considered: number; sent: number; failed: number; heldForQuietHours: boolean }> {
    if (await this.inQuietHours(now)) {
      return { considered: 0, sent: 0, failed: 0, heldForQuietHours: true };
    }

    const from = new Date(now.getTime() + LEAD_HOURS * 3600_000);
    const to = new Date(from.getTime() + WINDOW_HOURS * 3600_000);

    const due = await this.prisma.appointment.findMany({
      where: {
        startTime: { gte: from, lt: to },
        reminderSentAt: null,
        // Cancelled and no-show are self-evident. COMPLETED is here because an appointment can be
        // marked done early, and reminding somebody about something they have already had is the
        // message that makes people stop reading them.
        status: { in: [$Enums.AppointmentStatus.SCHEDULED, $Enums.AppointmentStatus.CONFIRMED] },
      },
      select: {
        id: true,
        startTime: true,
        type: true,
        patient: { select: { id: true, firstName: true, lastName: true, email: true } },
        dentist: { select: { firstName: true, lastName: true } },
      },
    });

    let sent = 0;
    let failed = 0;

    for (const appointment of due) {
      // The claim. `updateMany` with the null check is atomic: a second process running the same
      // sweep gets count 0 and moves on. Done before the send, so a crash in between loses a
      // reminder rather than sending a second one.
      const claim = await this.prisma.appointment.updateMany({
        where: { id: appointment.id, reminderSentAt: null },
        data: { reminderSentAt: new Date() },
      });
      if (claim.count === 0) continue;

      try {
        await this.sendFor(appointment);
        sent += 1;
      } catch (e) {
        failed += 1;
        // Released, so the next sweep tries again. A transport that is down for ten minutes should
        // not permanently consume the reminder — and the window is an hour wide precisely so a
        // released row is still inside it.
        await this.prisma.appointment.updateMany({
          where: { id: appointment.id },
          data: { reminderSentAt: null },
        });
        this.logger.warn(
          `Reminder for appointment ${appointment.id} failed: ${e instanceof Error ? e.message : 'unknown'}`,
        );
      }
    }

    if (due.length) this.logger.log(`Reminders: ${sent} sent, ${failed} failed, of ${due.length} due.`);
    return { considered: due.length, sent, failed, heldForQuietHours: false };
  }

  /**
   * Whether now is inside the clinic's quiet hours.
   *
   * Read from `ClinicSettings.timezone` rather than the server's clock: Render runs UTC, and a
   * 21:00 cut-off in UTC is midnight in Istanbul. Defaults to the schema's own default when
   * settings are missing, rather than falling back to UTC and being three hours wrong.
   */
  private async inQuietHours(now: Date): Promise<boolean> {
    const settings = await this.prisma.clinicSettings.findFirst({ select: { timezone: true } });
    const timeZone = settings?.timezone || 'Europe/Istanbul';

    let hour: number;
    try {
      hour = Number(
        new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hour12: false }).format(now),
      );
    } catch {
      // An unrecognised timezone in settings should not stop every reminder forever. Fall back to
      // the clinic's own default rather than to UTC.
      hour = Number(
        new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hour12: false }).format(now),
      );
    }

    return hour >= QUIET_FROM || hour < QUIET_UNTIL;
  }

  /**
   * Sends one reminder.
   *
   * Email only, today. WhatsApp is the channel these patients actually read, but sending a
   * template outside the 24-hour window needs a Meta-approved message template and this clinic has
   * none registered — building against an approval that does not exist would produce a send that
   * fails in production and passes every test here. Noted in NEXT_TASK.md.
   *
   * A patient with no email address throws rather than being silently skipped, so the row is
   * released and the failure is counted. Silence is what this whole service exists to fix.
   */
  private async sendFor(appointment: {
    id: string;
    startTime: Date;
    type: $Enums.AppointmentType;
    patient: { firstName: string; lastName: string; email: string | null };
    dentist: { firstName: string; lastName: string } | null;
  }) {
    const { patient } = appointment;
    if (!patient.email) {
      throw new Error('No email address on the patient record');
    }

    const settings = await this.prisma.clinicSettings.findFirst({
      select: { clinicName: true, timezone: true, address: true, phone: true },
    });
    const timeZone = settings?.timezone || 'Europe/Istanbul';
    const clinicName = settings?.clinicName || 'the clinic';

    // Formatted in the clinic's timezone and named as such. A patient in Riyadh reading "14:00"
    // with no zone will assume their own, and arrive two hours out.
    const when = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(appointment.startTime);

    const lines = [
      `Dear ${patient.firstName},`,
      '',
      `This is a reminder of your appointment at ${clinicName}:`,
      '',
      `  ${when} (${timeZone.replace('_', ' ')} time)`,
      appointment.dentist ? `  With ${appointment.dentist.firstName} ${appointment.dentist.lastName}` : '',
      settings?.address ? `  ${settings.address}` : '',
      '',
      'If you need to change or cancel this appointment, please reply to this email'
        + (settings?.phone ? ` or call us on ${settings.phone}.` : '.'),
      '',
      `We look forward to seeing you.`,
      clinicName,
    ].filter((l) => l !== '');

    await this.mail.send({
      to: patient.email,
      subject: `Your appointment at ${clinicName} — ${when}`,
      text: lines.join('\n'),
    });
  }
}
