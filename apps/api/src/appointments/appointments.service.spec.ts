import { AppointmentsService } from './appointments.service';
function fixture() {
  const existing = {
    id: 'appointment',
    startTime: new Date('2026-10-14T10:00:00Z'),
    endTime: new Date('2026-10-14T11:00:00Z'),
  };
  const update = jest.fn().mockImplementation(async ({ data }) => ({ ...existing, ...data }));
  return {
    update,
    service: new AppointmentsService({
      appointment: { findUnique: jest.fn().mockResolvedValue(existing), update },
    } as never),
  };
}
describe('Appointment interval validation', () => {
  it.each([
    { endTime: '2026-10-14T09:00:00Z' },
    { startTime: '2026-10-14T12:00:00Z' },
    { startTime: '2026-10-14T10:00:00Z', endTime: '2026-10-14T10:00:00Z' },
    { endTime: 'not-a-date' },
  ])('rejects an invalid combined interval before writing', async (dto) => {
    const f = fixture();
    await expect(f.service.update('appointment', dto)).rejects.toThrow('End time');
    expect(f.update).not.toHaveBeenCalled();
  });
  it('keeps valid single-field reschedules working', async () => {
    const f = fixture();
    await expect(
      f.service.update('appointment', { endTime: '2026-10-14T12:00:00Z' }),
    ).resolves.toMatchObject({ endTime: new Date('2026-10-14T12:00:00Z') });
  });
});
