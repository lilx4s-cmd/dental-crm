/**
 * Money, formatted one way.
 *
 * The same amount was rendering as `$12,000`, `12 000 $` and `12000 USD` on different screens,
 * because nine files had each written their own formatter: three used `Intl` with two decimals,
 * two used `Intl` with none and a hardcoded USD, three appended the currency code by hand, and one
 * was locale-dependent so it changed shape depending on the machine it ran on. A patient reading a
 * quote and then an invoice saw two different notations for the number they owe.
 *
 * Two functions, because there are genuinely two cases. An invoice needs the cents; a revenue
 * chart does not, and printing them makes a dashboard harder to scan for no gain.
 */

const SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  TRY: '₺',
  RUB: '₽',
  SAR: 'SR',
  AED: 'AED',
};

/**
 * The app's standard money format: `$12,000.50`.
 *
 * Cents appear only when the amount has them. A list of round quotes reads better as `$12,000`
 * than as `$12,000.00`, and an amount that genuinely carries cents is exactly where hiding them
 * would be wrong.
 *
 * Pinned to `en-US` rather than the browser's locale, so a figure does not change shape between
 * the coordinator's screen and the patient's copy of the same document.
 */
export function formatMoney(amount: number | null | undefined, currency = 'USD'): string {
  const value = Number(amount ?? 0);
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: Number.isInteger(safe) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

/**
 * Whole units, for aggregates: `$1,284,000`.
 *
 * Totals on a dashboard or a chart axis are read for magnitude, not for reconciliation. Cents on a
 * year's revenue are noise that costs horizontal space every screen can use better.
 */
export function formatMoneyRounded(amount: number | null | undefined, currency = 'USD'): string {
  const value = Number(amount ?? 0);
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 0,
  }).format(safe);
}

/**
 * A deal value in Bitrix's own notation: `45 000 $` — digits grouped with spaces, symbol trailing.
 *
 * Deliberately different from `formatMoney`, and the one place that difference is correct: the
 * Deals board is a copy of Bitrix's kanban for staff who worked in it for years, and the notation
 * is part of what makes it recognisable. Nowhere a patient sees uses this.
 */
export function formatDealValue(amount: number, currency = 'USD'): string {
  const hasCents = !Number.isInteger(amount);
  const grouped = amount
    .toLocaleString('en-US', {
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: 2,
    })
    // Narrow no-break space, so a grouped number never wraps mid-figure in a 250px column.
    .replace(/,/g, ' ');
  return `${grouped} ${SYMBOLS[currency] ?? currency}`;
}
