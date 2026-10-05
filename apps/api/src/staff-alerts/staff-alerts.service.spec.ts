// Phone fixtures use the reserved NANPA 202-555-0100 through 0199 example range.
jest.mock('../whatsapp/whatsapp-sender.service', () => ({ WhatsAppSenderService: jest.fn() }));
jest.mock('../whatsapp/whatsapp-web.service', () => ({ WhatsAppWebService: jest.fn() }));
import { BadRequestException } from '@nestjs/common';
import { StaffAlertsService } from './staff-alerts.service';
function fixture() {
  const db = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({
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
