import { STAGE_CADENCE, TERMINAL_STAGES, longestDormancyDays, nextAction } from '@dental-crm/shared';

// This decides what a salesperson is told to do each morning, so the boundaries are pinned: what
// counts as due, what counts as abandoned, and what should never appear at all.
const NOW = new Date(2026, 6, 26, 10, 0);
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe('next action', () => {
  it('leaves a deal alone until its stage cadence says otherwise', () => {
    // Offer Sent is chased after 3 days; at 1 day it is simply too early.
    const a = nextAction('OFFER_SENT', daysAgo(1), NOW);
    expect(a.urgency).toBe('later');
    expect(a.overdueDays).toBe(0);
    expect(a.action).toBe('Follow up on the offer');
  });

  it('marks a deal due the moment its cadence elapses', () => {
    const a = nextAction('OFFER_SENT', daysAgo(3), NOW);
    expect(a.urgency).toBe('due');
  });

  it('counts whole days past due so the worst offenders sort first', () => {
    const a = nextAction('OFFER_SENT', daysAgo(9), NOW);
    expect(a.urgency).toBe('overdue');
    expect(a.overdueDays).toBe(6);
  });

  it('chases a new enquiry within a day', () => {
    // Speed to first contact decides more of these than anything else in the process.
    expect(nextAction('NEW_DEAL', daysAgo(2), NOW).urgency).toBe('overdue');
    expect(STAGE_CADENCE.NEW_DEAL.chaseAfterDays).toBe(1);
  });

  it('measures from the last stage change, not from when the deal was created', () => {
    // An old deal that moved yesterday is being worked. Using age would park every long case at
    // the top of the list permanently and train people to ignore the list.
    const a = nextAction('NEGOTIATION', daysAgo(1), NOW);
    expect(a.urgency).toBe('later');
  });

  it('moves a cold deal out of the daily list rather than to the top of it', () => {
    // Recycling is a different job with a different message, done in batches. Left as "very
    // overdue" it would sit above genuinely urgent work forever.
    const a = nextAction('OFFER_SENT', daysAgo(45), NOW);
    expect(a.dormant).toBe(true);
    expect(a.urgency).toBe('none');
  });

  it('never chases a finished deal', () => {
    for (const stage of TERMINAL_STAGES) {
      const a = nextAction(stage, daysAgo(200), NOW);
      expect(a.action).toBeNull();
      expect(a.urgency).toBe('none');
      expect(a.dormant).toBe(false);
    }
  });

  it('says nothing about a stage it has no rule for, rather than inventing one', () => {
    expect(nextAction('SOMETHING_ELSE', daysAgo(30), NOW).action).toBeNull();
  });

  it('gives booked travel a longer leash than an unanswered quote', () => {
    // Chasing someone who has already paid and booked flights costs trust and gains nothing.
    expect(STAGE_CADENCE.TICKET.chaseAfterDays).toBeGreaterThan(STAGE_CADENCE.OFFER_SENT.chaseAfterDays);
  });

  it('never lets a deal be dormant before it is even due a chase', () => {
    for (const [stage, c] of Object.entries(STAGE_CADENCE)) {
      expect(c.dormantAfterDays).toBeGreaterThan(c.chaseAfterDays);
      expect(nextAction(stage, daysAgo(c.chaseAfterDays), NOW).dormant).toBe(false);
    }
  });

  it('exposes the longest dormancy so a query can pre-filter on it', () => {
    expect(longestDormancyDays()).toBe(
      Math.max(...Object.values(STAGE_CADENCE).map((c) => c.dormantAfterDays)),
    );
  });
});
