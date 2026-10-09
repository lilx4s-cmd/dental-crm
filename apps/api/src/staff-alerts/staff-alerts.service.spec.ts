// Phone fixtures use the reserved NANPA 202-555-0100 through 0199 example range.
jest.mock('../whatsapp/whatsapp-sender.service', () => ({ WhatsAppSenderService: jest.fn() }));
jest.mock('../whatsapp/whatsapp-web.service', () => ({ WhatsAppWebService: jest.fn() }));
import { BadRequestException } from '@nestjs/common';
import { StaffAlertsService } from './staff-alerts.service';
function fixture() {
  const db = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        isActive: true,
        notificationPhone: '+12025550123',
        notificationPreferences: { whatsapp: true, optIn: true },
      }),
    },
    clinicSettings: {
      findUnique: jest.fn().mockResolvedValue({ notificationSettings: { enabled: true } }),
    },
    staffAlert: { update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    leadAssignmentEvent: { findUnique: jest.fn() },
    callLog: { count: jest.fn().mockResolvedValue(0) },
    leadActivity: { count: jest.fn().mockResolvedValue(0) },
    message: { count: jest.fn().mockResolvedValue(0) },
    notification: { upsert: jest.fn() },
  };
  const sender = {
    activeTransport: jest.fn().mockReturnValue('web'),
    alertConnection: jest.fn().mockResolvedValue({ canSend: true }),
    sendText: jest.fn().mockResolvedValue('web'),
  };
  const service = new StaffAlertsService(
    db as never,
    sender as never,
    {} as never,
    {
      get: (key: string) => (key === 'cors.origin' ? ['https://crm.example'] : undefined),
    } as never,
  );
  const alert = {
    id: 'a1',
    userId: 's1',
    eventId: null,
    kind: 'TEST',
    channel: 'WHATSAPP',
    state: 'QUEUED',
    attempts: 0,
  } as never;
  return { db, sender, service, alert };
}
it('keeps disconnected WhatsApp queued without claiming delivery or sending', async () => {
  const f = fixture();
  f.sender.activeTransport.mockReturnValue('none');
  f.sender.alertConnection.mockResolvedValue({ canSend: false });
  await f.service.deliver(f.alert, new Date(), true);
  expect(f.sender.sendText).not.toHaveBeenCalled();
  expect(f.db.staffAlert.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        dueAt: expect.any(Date),
        error: expect.stringContaining('disconnected'),
      }),
    }),
  );
});
it('records provider acceptance without marking a message delivered', async () => {
  const f = fixture();
  await f.service.deliver(f.alert, new Date(), true);
  expect(f.sender.sendText).toHaveBeenCalledWith('+12025550123', expect.any(String));
  expect(f.db.staffAlert.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ state: 'ACCEPTED' }) }),
  );
  expect(f.db.staffAlert.update.mock.calls[0][0].data.deliveredAt).toBeUndefined();
});
it('does not resend an uncertain network result', async () => {
  const f = fixture();
  f.sender.sendText.mockRejectedValue(new Error('connection reset'));
  await f.service.deliver(f.alert, new Date(), true);
  expect(f.db.staffAlert.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ state: 'UNCERTAIN' }) }),
  );
});
it('allows only one worker to claim a queued alert', async () => {
  const f = fixture();
  f.db.staffAlert.updateMany.mockResolvedValue({ count: 0 });
  await f.service.deliver(f.alert, new Date(), true);
  expect(f.sender.sendText).not.toHaveBeenCalled();
});
it('cancels stale assignments before sending', async () => {
  const f = fixture();
  f.db.leadAssignmentEvent.findUnique.mockResolvedValue({ closedAt: new Date() });
  await f.service.deliver({ ...(f.alert as object), eventId: 'e1' } as never, new Date(), true);
  expect(f.sender.sendText).not.toHaveBeenCalled();
  expect(f.db.staffAlert.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ state: 'CANCELLED' }) }),
  );
});
it('refuses arbitrary push endpoints instead of making server requests', async () => {
  const f = fixture();
  await expect(
    f.service.subscribe('s1', {
      endpoint: 'https://127.0.0.1/private',
      keys: { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) },
    }),
  ).rejects.toBeInstanceOf(BadRequestException);
});
it('does not use free-form Cloud API text for business-initiated staff alerts', async () => {
  const f = fixture();
  f.sender.activeTransport.mockReturnValue('cloud_api');
  await f.service.deliver(f.alert, new Date(), true);
  expect(f.sender.sendText).not.toHaveBeenCalled();
  expect(f.db.staffAlert.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        state: 'FAILED',
        error: expect.stringContaining('templates'),
      }),
    }),
  );
});

function patientFixture(channel = 'IN_APP', push = false) {
  const f = fixture();
  const now = new Date('2026-10-09T10:00:00Z');
  const at = new Date('2026-10-09T11:00:00Z');
  f.db.user.findUnique.mockResolvedValue({
    isActive: true,
    role: 'CLINIC_MANAGER',
    email: 'fictional@example.org',
    notificationPhone: '+12025550123',
    notificationPreferences: { push },
  } as never);
  Object.assign(f.db, {
    appointment: {
      findFirst: jest.fn().mockResolvedValue({
        startTime: at,
        patientId: 'p',
        patient: { firstName: 'Fictional', lastName: 'Patient' },
      }),
    },
  });
  Object.assign(f.db.notification, { updateMany: jest.fn() });
  const alert = {
    id: 'patient-alert',
    userId: 's1',
    eventId: null,
    kind: 'PATIENT_DATE',
    channel,
    state: 'QUEUED',
    attempts: 0,
    schedule: { kind: 'APPOINTMENT', id: 'appointment', at: at.toISOString(), hours: 2, cycle: 1 },
  } as never;
  return {
    ...f,
    now,
    at,
    alert,
    sendPush: jest
      .spyOn(
        f.service as unknown as { sendPush: (id: string, payload: object) => Promise<void> },
        'sendPush',
      )
      .mockResolvedValue(),
  };
}
it('delivers in-app patient reminders with a date link even outside staff working hours', async () => {
  const f = patientFixture();
  f.db.user.findUnique.mockResolvedValue({
    isActive: true,
    role: 'CLINIC_MANAGER',
    email: 'fictional@example.org',
    notificationPreferences: { days: [1] },
  } as never);
  await f.service.deliver(f.alert, f.now);
  expect(f.db.notification.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      create: expect.objectContaining({
        title: 'Clinic appointment · Fictional Patient',
        relatedEntityType: 'APPOINTMENT',
        relatedEntityId: 'appointment',
        body: expect.stringContaining('/appointments?view=day&at='),
      }),
    }),
  );
  expect(f.sender.sendText).not.toHaveBeenCalled();
});
it('sends patient mobile push only to opted-in staff', async () => {
  const off = patientFixture('PUSH');
  await off.service.deliver(off.alert, off.now);
  expect(off.sendPush).not.toHaveBeenCalled();
  const on = patientFixture('PUSH', true);
  await on.service.deliver(on.alert, on.now);
  expect(on.sendPush).toHaveBeenCalledWith(
    's1',
    expect.objectContaining({
      title: 'Clinic appointment · Fictional Patient',
      url: expect.stringContaining('/appointments?view=day&at='),
    }),
  );
});
it('cancels missed older reminder bands rather than sending several notices together', async () => {
  const f = patientFixture();
  await f.service.deliver(
    {
      ...(f.alert as object),
      schedule: { kind: 'APPOINTMENT', id: 'appointment', at: f.at.toISOString(), hours: 168 },
    } as never,
    f.now,
  );
  expect(f.db.staffAlert.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ state: 'CANCELLED' }) }),
  );
  expect(f.db.notification.upsert).not.toHaveBeenCalled();
});
it('rechecks patient appointment permission before a reminder is sent', async () => {
  const f = patientFixture();
  f.db.user.findUnique.mockResolvedValue({
    isActive: true,
    role: 'CLINIC_MANAGER',
    email: 'fictional@example.org',
    notificationPreferences: {},
    accessProfile: { permissions: { 'appointments.read': false } },
  } as never);
  await f.service.deliver(f.alert, f.now);
  expect(f.db.notification.upsert).not.toHaveBeenCalled();
  expect(f.db.staffAlert.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ state: 'CANCELLED' }) }),
  );
});
