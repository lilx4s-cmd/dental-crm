import { formatMoney, formatMoneyRounded, formatDealValue } from './money';

/**
 * Every price the clinic shows a patient now goes through these three functions, so the shapes
 * below are the contract: a change to one of them changes a quote, an invoice and a printed
 * dossier at the same time.
 *
 * Exact strings rather than loose matches, deliberately. The bug this module exists to fix was
 * nine formatters quietly disagreeing about notation, and a permissive assertion is how they
 * would drift apart again.
 */

/** U+00A0. Written as an escape so the expectations cannot be mistaken for ordinary spaces. */
const NBSP = ' ';

describe('formatMoney', () => {
  it('prints the symbol, grouping and no cents on a whole amount', () => {
    expect(formatMoney(12000)).toBe('$12,000');
  });

  it('prints cents when the amount has them', () => {
    // The case the "always two decimals" and "never any decimals" formatters each got wrong in
    // one direction: a list of round quotes should not read $12,000.00, but a real 50-cent
    // balance must not be rounded away on an invoice someone pays against.
    expect(formatMoney(12000.5)).toBe('$12,000.50');
    expect(formatMoney(0.99)).toBe('$0.99');
  });

  it('rounds to cents rather than showing a float artefact', () => {
    expect(formatMoney(0.1 + 0.2)).toBe('$0.30');
  });

  it('honours the currency', () => {
    expect(formatMoney(1500, 'EUR')).toBe('€1,500');
    expect(formatMoney(1500, 'GBP')).toBe('£1,500');
  });

  it('prints the ISO code for a currency en-US has no symbol for', () => {
    // Turkish lira is on the clinic's currency list and renders as "TRY 1,500", not "₺1,500".
    // Unambiguous, which is what matters on a document a patient pays from — pinned here so the
    // shape is a decision rather than a surprise.
    expect(formatMoney(1500, 'TRY')).toBe(`TRY${NBSP}1,500`);
  });

  it('falls back to USD when a currency is missing or empty', () => {
    // Plans and invoices both carry a nullable currency column, and an empty string reaching
    // Intl.NumberFormat throws a RangeError — one blank field would blank the whole screen.
    expect(formatMoney(100, '')).toBe('$100');
    expect(formatMoney(100, undefined)).toBe('$100');
  });

  it('treats a missing or non-finite amount as zero rather than printing NaN', () => {
    expect(formatMoney(null)).toBe('$0');
    expect(formatMoney(undefined)).toBe('$0');
    expect(formatMoney(Number.NaN)).toBe('$0');
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe('$0');
  });

  it('keeps the sign on a refund', () => {
    expect(formatMoney(-250)).toBe('-$250');
  });
});

describe('formatMoneyRounded', () => {
  it('drops the cents on an aggregate', () => {
    expect(formatMoneyRounded(1284000.62)).toBe('$1,284,001');
  });

  it('still prints a real zero', () => {
    // A dashboard tile showing $0 has to mean zero. That it is now distinguishable from a failed
    // request is the point of the error states around it; this pins the honest case.
    expect(formatMoneyRounded(0)).toBe('$0');
  });

  it('survives a missing total', () => {
    expect(formatMoneyRounded(null)).toBe('$0');
  });
});

describe('formatDealValue', () => {
  it('uses Bitrix notation: space grouping, trailing symbol', () => {
    // Deliberately unlike formatMoney, and the one place that difference is correct: the Deals
    // board is a copy of the CRM the clinic used for years and this notation is part of what
    // makes it recognisable to staff.
    expect(formatDealValue(45000)).toBe(`45${NBSP}000 $`);
  });

  it('groups with a space that cannot break across lines', () => {
    // An ordinary space lets a narrow kanban column split "45 000" over two lines, where it reads
    // as two numbers. The source claimed to prevent this for a while without actually doing it.
    expect(formatDealValue(45000)).not.toMatch(/\d \d/);
  });

  it('shows cents only when there are some', () => {
    expect(formatDealValue(1500.25)).toBe(`1${NBSP}500.25 $`);
    expect(formatDealValue(1500)).toBe(`1${NBSP}500 $`);
  });

  it('falls back to the currency code when there is no symbol for it', () => {
    expect(formatDealValue(1000, 'PLN')).toBe(`1${NBSP}000 PLN`);
  });
});
