import { GoogleCalendarService } from './google-calendar.service';
const booking = {
  id: 'booking',
  revision: 1,
  calendarCycle: 1,
  visit: 1,
  lead: { assignedTo: { firstName: 'Staff', lastName: 'A' } },
  details: {
    patientId: '00000000-0000-4000-8000-000000000001',
    leadId: '00000000-0000-4000-8000-000000000002',
    visit: 1,
    status: 'CONFIRMED',
    arrival: {
      local: '2026-10-31T23:45',
      timezone: 'Europe/Istanbul',
      offset: '+03:00',
      origin: 'CDG',
      destination: 'IST',
      number: 'TK123',
    },
    departure: null,
    detailsConfirmed: true,
    passengers: 2,
  },
};
function fixture() {
  const db = {
    travelBooking: { findUniqueOrThrow: jest.fn().mockResolvedValue(booking) },
    calendarSync: { updateMany: jest.fn() },
  };
  const service = new GoogleCalendarService(
    db as never,
    { get: () => 'https://crm.example' } as never,
  );
  const internal = service as unknown as {
    token: () => Promise<{ token: string; calendarId: string }>;
    request: (path: string, options: RequestInit) => Promise<unknown>;
  };
  internal.token = jest
    .fn()
    .mockResolvedValue({ token: 'server-secret', calendarId: 'clinic-calendar' });
  internal.request = jest.fn().mockResolvedValue({ id: 'event' });
  return { service, db, internal };
}
it('uses stable event IDs and updates existing events without invitations or medical data', async () => {
  const f = fixture();
  await f.service.sync('booking', 1, {});
  const request = f.internal.request as jest.Mock;
  expect(request.mock.calls[0][0]).toContain('sendUpdates=none');
  const payload = JSON.parse(request.mock.calls[0][1].body);
  expect(payload.id).toMatch(/^[a-f0-9]{64}$/);
  expect(payload.attendees).toBeUndefined();
  expect(payload.description).not.toMatch(/medical|document|allerg/i);
  expect(payload.start).toEqual({
    dateTime: '2026-10-31T20:45:00.000Z',
    timeZone: 'Europe/Istanbul',
  });
  expect(f.db.calendarSync.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ state: 'SYNCED' }) }),
  );
});
it('recovers a missing event by inserting the same deterministic ID', async () => {
  const f = fixture();
  (f.internal.request as jest.Mock).mockRejectedValueOnce(
    Object.assign(new Error('404'), { status: 404 }),
  );
  await f.service.sync('booking', 1, {});
  const calls = (f.internal.request as jest.Mock).mock.calls;
  expect(calls[1][1].method).toBe('POST');
  expect(JSON.parse(calls[1][1].body).id).toBe(JSON.parse(calls[0][1].body).id);
});
it('handles a timed-out insert subsequently returning conflict by updating, not duplicating', async () => {
  const f = fixture();
  (f.internal.request as jest.Mock)
    .mockRejectedValueOnce(Object.assign(new Error('404'), { status: 404 }))
    .mockRejectedValueOnce(Object.assign(new Error('409'), { status: 409 }));
  await f.service.sync('booking', 1, {});
  expect((f.internal.request as jest.Mock).mock.calls.map((c) => c[1].method)).toEqual([
    'PUT',
    'POST',
    'PUT',
    'DELETE',
  ]);
});
it('cancellation deletes deterministic event IDs even when acceptance was uncertain', async () => {
  const f = fixture();
  f.db.travelBooking.findUniqueOrThrow.mockResolvedValue({
    ...booking,
    details: { ...booking.details, status: 'CANCELLED' },
  });
  await f.service.sync('booking', 1, {});
  expect((f.internal.request as jest.Mock).mock.calls.every((c) => c[1].method === 'DELETE')).toBe(
    true,
  );
});
it('ignores an obsolete revision before making provider calls', async () => {
  const f = fixture();
  await f.service.sync('booking', 2, {});
  expect(f.internal.request).not.toHaveBeenCalled();
});
it('uses a fresh event identity after cancelling and reconfirming a visit', async () => {
  const f = fixture();
  f.db.travelBooking.findUniqueOrThrow.mockResolvedValue({ ...booking, calendarCycle: 2 });
  await f.service.sync('booking', 1, { arrival: 'previous-cycle-event', arrivalCycle: '1' });
  const calls = (f.internal.request as jest.Mock).mock.calls;
  expect(calls[0][1].method).toBe('DELETE');
  expect(calls[0][0]).toContain('previous-cycle-event');
  const payload = JSON.parse(calls[1][1].body);
  expect(payload.id).not.toBe('previous-cycle-event');
  expect(f.db.calendarSync.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ eventIds: expect.objectContaining({ arrivalCycle: '2' }) }),
    }),
  );
});
