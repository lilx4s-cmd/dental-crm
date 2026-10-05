import { StaffPreferencesSchema, workingDeadline, isWorking, alertText } from './alert-policy';
const p = StaffPreferencesSchema.parse({
  timezone: 'Europe/Istanbul',
  days: [1, 2, 3, 4, 5],
  start: 540,
  end: 1080,
});
it('counts reminder minutes only within working hours', () =>
  expect(workingDeadline(new Date('2026-10-05T14:55:00Z'), 15, p).toISOString()).toBe(
    '2026-10-06T06:10:00.000Z',
  ));
it('holds weekend alerts until Monday', () =>
  expect(workingDeadline(new Date('2026-10-03T09:00:00Z'), 0, p).toISOString()).toBe(
    '2026-10-05T06:00:00.000Z',
  ));
it('uses the actual local timezone across daylight-saving changes', () => {
  const berlin = { ...p, timezone: 'Europe/Berlin' };
  expect(workingDeadline(new Date('2026-10-24T10:00:00Z'), 15, berlin).toISOString()).toBe(
    '2026-10-26T08:15:00.000Z',
  );
});
it('supports overnight shifts using the preceding working day', () => {
  const night = { ...p, days: [1], start: 1320, end: 360 };
  expect(isWorking(new Date('2026-10-05T23:00:00Z'), night)).toBe(true);
  expect(isWorking(new Date('2026-10-06T20:00:00Z'), night)).toBe(false);
});
it('rejects invalid timezone and empty work schedules', () => {
  expect(StaffPreferencesSchema.safeParse({ timezone: 'invalid' }).success).toBe(false);
  expect(StaffPreferencesSchema.safeParse({ days: [] }).success).toBe(false);
});
it('keeps external content discreet and links to an authenticated lead route', () => {
  const body = alertText(
    'ASSIGNMENT',
    'ar',
    'fr',
    'WEBSITE',
    'https://crm.example/pipeline?leadId=lead-42',
    15,
  );
  expect(body).toContain('leadId=lead-42');
  expect(body).not.toMatch(/medical|diagnosis|photo|patient name/i);
  expect(body).toContain('تم تعيين');
});
