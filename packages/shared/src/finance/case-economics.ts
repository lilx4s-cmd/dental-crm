// What a case is worth and what it cost, derived in one place.
//
// Only two of these figures are ever stored — the service cost and the sales commission, which
// somebody types in. Price and paid come from the invoices and payments that already exist, and
// profit is computed. Storing a derived total is how a patient ends up with two different answers
// to "how much have they paid", one of which is stale.

export interface CaseMoneyInput {
  /** Invoice totals raised against the patient. */
  invoiceTotals: number[];
  /** Only settled payments. A pending card authorisation is not money the clinic has. */
  completedPayments: number[];
  serviceCost?: number | null;
  salesCommission?: number | null;
}

export interface CaseEconomics {
  /** What the clinic has quoted and invoiced. */
  treatmentPrice: number;
  /** What has actually been received. */
  paid: number;
  /** Still owed. Never negative — an overpayment is shown separately rather than as a debt. */
  outstanding: number;
  /** Paid beyond the invoiced total, usually a deposit taken before invoicing. */
  overpaid: number;
  serviceCost: number;
  salesCommission: number;
  /**
   * Price minus what the case costs to deliver and what the salesperson takes.
   *
   * Computed from the invoiced price, not from what has been collected — profit on a case that is
   * half paid is still the profit, and using `paid` here would make every unfinished case look
   * like a loss.
   */
  netProfit: number;
  /** Net profit as a share of price. Null when nothing has been invoiced, since 0/0 is not 0%. */
  marginPercent: number | null;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function computeCaseEconomics(input: CaseMoneyInput): CaseEconomics {
  const treatmentPrice = sum(input.invoiceTotals);
  const paid = sum(input.completedPayments);
  const serviceCost = input.serviceCost ?? 0;
  const salesCommission = input.salesCommission ?? 0;

  const balance = treatmentPrice - paid;
  const netProfit = treatmentPrice - serviceCost - salesCommission;

  return {
    treatmentPrice,
    paid,
    outstanding: Math.max(0, balance),
    overpaid: Math.max(0, -balance),
    serviceCost,
    salesCommission,
    netProfit,
    marginPercent: treatmentPrice > 0 ? (netProfit / treatmentPrice) * 100 : null,
  };
}
