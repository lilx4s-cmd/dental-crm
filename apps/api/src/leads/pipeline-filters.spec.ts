import { STUCK_LEAD_DAYS, stuckBefore, taskDueRange } from '@dental-crm/shared';

// The board and the filter chips both read these windows, so a boundary being off by a day means
// the pipeline shows a different set than the chip promises. Fixed clock throughout: Wednesday
// 23 July 2026, 14:30 local.
const NOW = new Date(2026, 6, 23, 14, 30);

describe('pipeline task-due windows', () => {
  it('covers today from midnight to midnight, not from now', () => {
    const range = taskDueRange('today', NOW)!;
    // A task due at 09:00 today is still today's work even though that moment has passed.
    expect(range.gte).toEqual(new Date(2026, 6, 23, 0, 0, 0));
    expect(range.lt).toEqual(new Date(2026, 6, 24, 0, 0, 0));
  });

  it('runs "this week" from today to the end of Sunday', () => {
    const range = taskDueRange('week', NOW)!;
    expect(range.gte).toEqual(new Date(2026, 6, 23, 0, 0, 0));
    // Wednesday the 23rd -> the coming Sunday is the 26th, so the window ends at midnight on the 27th.
    expect(range.lt).toEqual(new Date(2026, 6, 27, 0, 0, 0));
  });

  it('treats Sunday as the last day of its own week, not the first of the next', () => {
    const sunday = new Date(2026, 6, 26, 10, 0);
    const range = taskDueRange('week', sunday)!;
    expect(range.lt).toEqual(new Date(2026, 6, 27, 0, 0, 0));
  });

  it('runs "this month" from today to the first of next month', () => {
    const range = taskDueRange('month', NOW)!;
    expect(range.gte).toEqual(new Date(2026, 6, 23, 0, 0, 0));
    expect(range.lt).toEqual(new Date(2026, 7, 1, 0, 0, 0));
  });

  it('rolls the month window over the year end', () => {
    const december = new Date(2026, 11, 15, 9, 0);
    expect(taskDueRange('month', december)!.lt).toEqual(new Date(2027, 0, 1, 0, 0, 0));
  });

  it('counts anything before today as overdue, with no lower bound', () => {
    const range = taskDueRange('overdue', NOW)!;
    expect(range.lt).toEqual(new Date(2026, 6, 23, 0, 0, 0));
    expect(range.gte).toBeUndefined();
  });

  it('does not overlap overdue with today', () => {
    // The boundary belongs to exactly one bucket, so a task cannot be counted twice.
    expect(taskDueRange('overdue', NOW)!.lt).toEqual(taskDueRange('today', NOW)!.gte);
  });

  it('has no range for "no task" — it is an absence, not a window', () => {
    expect(taskDueRange('none', NOW)).toBeNull();
  });
});

describe('stuck lead cutoff', () => {
  it('looks back the configured number of days', () => {
    const cutoff = stuckBefore(NOW);
    const expected = new Date(NOW);
    expected.setDate(expected.getDate() - STUCK_LEAD_DAYS);
    expect(cutoff).toEqual(expected);
  });

  it('is in the past relative to now', () => {
    expect(stuckBefore(NOW).getTime()).toBeLessThan(NOW.getTime());
  });
});
