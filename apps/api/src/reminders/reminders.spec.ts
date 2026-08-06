import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { RemindersService } from './reminders.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma: Record<string, any> = {
  appointment: { findMany: jest.fn(), updateMany: jest.fn() },
  clinicSettings: { findFirst: jest.fn() },
};

const mail = { send: jest.fn() };

/** 10:00 Istanbul on a Wednesday — comfortably outside quiet hours. */
const MIDMORNING = new Date('2026-08-12T07:00:00Z');

const appointment = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  startTime: new Date('2026-08-13T08:00:00Z'),
  type: 'CONSULTATION',
  patient: { id: 'p1', firstName: 'Ahmed', lastName: 'Al-Rashid', email: 'ahmed@example.com' },
  dentist: { firstName: 'Kerem', lastName: 'Demir' },
  ...over,
});

/**
 * The first thing in this system that runs without somebody clicking.
 *
 * `Appointment.reminderSentAt` was a column no code read or wrote, so "your appointment is on
 * Thursday" was never sent — to patients who board a plane for it.
 *
 * Almost everything worth testing here is about *not* sending: not twice, not to a cancelled
 * appointment, not at three in the morning, and not silently never.
 */
describe('RemindersService', () => {
  let service: RemindersService;

  async function build(enabled = true) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RemindersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailService, useValue: mail },
        {
          provide: ConfigService,
          useValue: { get: (k: string) => (k === 'reminders.enabled' ? String(enabled) : undefined) },
        },
      ],
    }).compile();
    return moduleRef.get(RemindersService);
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.appointment.findMany.mockResolvedValue([]);
    // The claim succeeds by default: one row won.
    mockPrisma.appointment.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.clinicSettings.findFirst.mockResolvedValue({
      clinicName: 'Kerem Clinic',
      timezone: 'Europe/Istanbul',
      address: 'Istanbul',
      phone: '+90 555 000 0000',
    });
    mail.send.mockResolvedValue(undefined);
    service = await build();
  });

  describe('never twice', () => {
    it('claims each appointment with an atomic update before sending', async () => {
      // Two instances, or one restarted mid-send, must not produce two messages. The claim is an
      // updateMany on `reminderSentAt: null` — Postgres will not let a second process win the
      // same row.
      mockPrisma.appointment.findMany.mockResolvedValue([appointment()]);

      await service.run(MIDMORNING);

      const claim = mockPrisma.appointment.updateMany.mock.calls[0][0];
      expect(claim.where).toEqual({ id: 'a1', reminderSentAt: null });
      expect(claim.data.reminderSentAt).toBeInstanceOf(Date);
    });

    it('claims before it sends, not after', async () => {
      // The order is the whole guarantee. A crash between the two loses a reminder rather than
      // duplicating one — reception can call somebody who was not reminded; nobody can unsend a
      // second message at 3am.
      const order: string[] = [];
      mockPrisma.appointment.findMany.mockResolvedValue([appointment()]);
      mockPrisma.appointment.updateMany.mockImplementation(async () => {
        order.push('claim');
        return { count: 1 };
      });
      mail.send.mockImplementation(async () => {
        order.push('send');
      });

      await service.run(MIDMORNING);

      expect(order).toEqual(['claim', 'send']);
    });

    it('does not send when another process won the claim', async () => {
      mockPrisma.appointment.findMany.mockResolvedValue([appointment()]);
      mockPrisma.appointment.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.run(MIDMORNING);

      expect(mail.send).not.toHaveBeenCalled();
      expect(result.sent).toBe(0);
    });

    it('only considers appointments not yet reminded', async () => {
      await service.run(MIDMORNING);
      expect(mockPrisma.appointment.findMany.mock.calls[0][0].where.reminderSentAt).toBeNull();
    });
  });

  describe('when a send fails', () => {
    it('releases the claim so the next sweep retries', async () => {
      // A transport down for ten minutes must not permanently consume the reminder. The window is
      // an hour wide precisely so a released row is still inside it.
      mockPrisma.appointment.findMany.mockResolvedValue([appointment()]);
      mail.send.mockRejectedValue(new Error('SMTP refused'));

      const result = await service.run(MIDMORNING);

      const release = mockPrisma.appointment.updateMany.mock.calls[1][0];
      expect(release.data).toEqual({ reminderSentAt: null });
      expect(result.failed).toBe(1);
      expect(result.sent).toBe(0);
    });

    it('counts a patient with no email as a failure rather than skipping quietly', async () => {
      // Silence is the thing this service exists to fix. A patient who cannot be reached should
      // surface, not vanish.
      mockPrisma.appointment.findMany.mockResolvedValue([
        appointment({ patient: { id: 'p1', firstName: 'A', lastName: 'B', email: null } }),
      ]);

      const result = await service.run(MIDMORNING);

      expect(result.failed).toBe(1);
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('keeps going after one failure', async () => {
      mockPrisma.appointment.findMany.mockResolvedValue([appointment({ id: 'a1' }), appointment({ id: 'a2' })]);
      mail.send.mockRejectedValueOnce(new Error('SMTP refused')).mockResolvedValueOnce(undefined);

      const result = await service.run(MIDMORNING);

      expect(result.sent).toBe(1);
      expect(result.failed).toBe(1);
    });
  });

  describe('who gets one', () => {
    it('leaves out cancelled and completed appointments', async () => {
      // Reminding somebody about something they have already had is the message that makes people
      // stop reading them.
      await service.run(MIDMORNING);
      expect(mockPrisma.appointment.findMany.mock.calls[0][0].where.status.in).toEqual([
        'SCHEDULED',
        'CONFIRMED',
      ]);
    });

    it('looks a day ahead, not an hour', async () => {
      // These patients fly in. The useful reminder is the one that still leaves time to move a
      // flight.
      await service.run(MIDMORNING);
      const { gte, lt } = mockPrisma.appointment.findMany.mock.calls[0][0].where.startTime;
      const hoursAhead = (gte.getTime() - MIDMORNING.getTime()) / 3600_000;
      expect(hoursAhead).toBe(24);
      // A window wider than the sweep interval, so a missed tick does not drop anybody.
      expect((lt.getTime() - gte.getTime()) / 3600_000).toBeGreaterThanOrEqual(1);
    });
  });

  describe('quiet hours', () => {
    it('holds rather than sends at three in the morning', async () => {
      // 00:00 UTC is 03:00 in Istanbul.
      const result = await service.run(new Date('2026-08-12T00:00:00Z'));

      expect(result.heldForQuietHours).toBe(true);
      expect(mockPrisma.appointment.findMany).not.toHaveBeenCalled();
    });

    it('reads the clinic’s timezone, not the server’s', async () => {
      // Render runs UTC. A 21:00 cut-off in UTC is midnight in Istanbul, so the wrong clock would
      // send at exactly the hour this exists to protect.
      mockPrisma.clinicSettings.findFirst.mockResolvedValue({ timezone: 'Europe/Istanbul' });

      // 19:00 UTC is 22:00 Istanbul — quiet there, not quiet in UTC.
      const result = await service.run(new Date('2026-08-12T19:00:00Z'));

      expect(result.heldForQuietHours).toBe(true);
    });

    it('sends during the working day', async () => {
      const result = await service.run(MIDMORNING);
      expect(result.heldForQuietHours).toBe(false);
    });

    it('falls back to the clinic default rather than UTC on a bad timezone', async () => {
      // An unrecognised value in settings must not stop every reminder forever, and must not
      // silently become UTC — which is three hours out for this clinic.
      mockPrisma.clinicSettings.findFirst.mockResolvedValue({ timezone: 'Not/AZone' });

      const result = await service.run(new Date('2026-08-12T19:00:00Z'));

      expect(result.heldForQuietHours).toBe(true);
    });
  });

  describe('what the patient reads', () => {
    it('names the timezone, because the patient is in another one', async () => {
      // "14:00" with no zone is read by somebody in Riyadh as their own, and they arrive two
      // hours out.
      mockPrisma.appointment.findMany.mockResolvedValue([appointment()]);

      await service.run(MIDMORNING);

      const { text, subject } = mail.send.mock.calls[0][0];
      expect(text).toContain('Europe/Istanbul');
      expect(subject).toContain('Kerem Clinic');
    });

    it('addresses the patient and names the dentist', async () => {
      mockPrisma.appointment.findMany.mockResolvedValue([appointment()]);
      await service.run(MIDMORNING);
      const { text, to } = mail.send.mock.calls[0][0];
      expect(to).toBe('ahmed@example.com');
      expect(text).toContain('Ahmed');
      expect(text).toContain('Kerem Demir');
    });

    it('omits the dentist line rather than printing a blank one', async () => {
      mockPrisma.appointment.findMany.mockResolvedValue([appointment({ dentist: null })]);
      await service.run(MIDMORNING);
      expect(mail.send.mock.calls[0][0].text).not.toContain('With ');
    });
  });

  describe('the switch', () => {
    it('sends nothing when reminders are off', async () => {
      // A developer running this against the production database must not email real patients
      // because the server was left up over lunch.
      const off = await build(false);
      mockPrisma.appointment.findMany.mockResolvedValue([appointment()]);

      await off.sweep();

      expect(mail.send).not.toHaveBeenCalled();
      expect(mockPrisma.appointment.findMany).not.toHaveBeenCalled();
    });

    it('does not start a sweep while one is running', async () => {
      // The sweep is slower than the tick when a transport is timing out, and two overlapping
      // passes would both read the same unclaimed rows.
      //
      // The clock is pinned because `sweep()` calls `new Date()` itself, unlike `run(now)`. Left
      // to the real time this test passed or failed depending on the hour it was run at — inside
      // the clinic's quiet hours the sweep returns before ever reaching findMany. `setTimeout` is
      // left real so the flush below still works.
      jest.useFakeTimers({ now: MIDMORNING, doNotFake: ['setTimeout', 'nextTick', 'setImmediate'] });
      try {
        let release!: () => void;
        mockPrisma.appointment.findMany.mockReturnValue(new Promise((r) => { release = () => r([]); }));

        const first = service.sweep();
        // Let the first sweep get past the quiet-hours lookup and reach findMany. Without this the
        // assertion below would pass for the wrong reason — nothing has been called yet either way.
        await new Promise((r) => setTimeout(r, 0));
        expect(mockPrisma.appointment.findMany).toHaveBeenCalledTimes(1);

        await service.sweep();
        expect(mockPrisma.appointment.findMany).toHaveBeenCalledTimes(1);

        release();
        await first;
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
