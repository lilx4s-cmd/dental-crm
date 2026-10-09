import { patientMonth, patientMonthRange, patientReminderBand } from '@dental-crm/shared';
const now = new Date('2026-12-31T20:00:00Z');
it('uses the clinic month at midnight and keeps December distinct from January', () => {
  expect(patientMonth('2026-12-31T21:01:00Z')).toBe('2027-01');
  expect(patientMonthRange('2026-12')).toEqual({
    from: new Date('2026-11-30T21:00:00Z'),
    to: new Date('2026-12-31T21:00:00Z'),
  });
  expect(() => patientMonthRange('2026-13')).toThrow();
});
it.each([
  [169, null],
  [168, 168],
  [25, 168],
  [24, 24],
  [2, 2],
  [1, 2],
  [0, null],
  [-1, null],
])('uses only the current reminder band at %s hours remaining', (remaining, expected) => {
  expect(patientReminderBand(new Date(now.getTime() + remaining! * 3600000), now)).toBe(expected);
});
it('handles customized reminder times without depending on their input order', () => {
  expect(patientReminderBand(new Date(now.getTime() + 4 * 3600000), now, [48, 6, 1])).toBe(6);
});
