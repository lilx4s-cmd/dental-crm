import { replyCoaching } from './reply-coaching';
const now = new Date('2026-10-04T12:00:00Z');
const message = (direction: string, minutes: number) => ({
  direction,
  createdAt: new Date(now.getTime() - minutes * 60_000),
});
describe('reply coaching', () => {
  it('uses the ten minute SLA boundary', () => {
    expect(replyCoaching([{ messages: [message('INBOUND', 9)] }], now)?.severity).toBe('ORANGE');
    expect(replyCoaching([{ messages: [message('INBOUND', 10)] }], now)?.severity).toBe('RED');
  });
  it('clears after a successful reply', () => {
    expect(replyCoaching([{ messages: [message('OUTBOUND', 1)] }], now)).toBeNull();
  });
  it('does not let a reply in a different conversation clear the warning', () => {
    const result = replyCoaching(
      [{ messages: [message('INBOUND', 20)] }, { messages: [message('OUTBOUND', 1)] }],
      now,
    );
    expect(result?.waitingMinutes).toBe(20);
  });
  it('returns no warning without captured messages', () => {
    expect(replyCoaching([{ messages: [] }], now)).toBeNull();
  });
});
