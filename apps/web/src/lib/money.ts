// Bitrix writes deal values as "45 000 $" — digits grouped with spaces, symbol trailing — and the
// board copies that. Kept in one place because the column header sums the same numbers the cards
// show individually; two formatters would let a column total and its cards disagree in shape.

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
 * Formats a deal value the way Bitrix does. Decimals are shown only when the amount actually has
 * them — a board of "12 000,00 $" is harder to scan than a board of "12 000 $", and clinic
 * quotes are round far more often than not.
 */
export function formatDealValue(amount: number, currency = 'USD'): string {
  const hasCents = !Number.isInteger(amount);
  const grouped = amount
    .toLocaleString('en-US', {
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: 2,
    })
    // Narrow no-break space, so a grouped number never wraps mid-figure in a 250px column.
    .replace(/,/g, ' ');
  return `${grouped} ${SYMBOLS[currency] ?? currency}`;
}
