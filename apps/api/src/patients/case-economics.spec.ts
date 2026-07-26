import { computeCaseEconomics } from '@dental-crm/shared';

// These figures decide what the clinic thinks it earned, so the rules that are easy to get subtly
// wrong — which payments count, whether profit follows the invoice or the cash, and what happens
// when a patient overpays — are pinned rather than left to each screen to interpret.
describe('case economics', () => {
  it('sums invoices for the price and settled payments for what is in the bank', () => {
    const e = computeCaseEconomics({
      invoiceTotals: [4000, 1500],
      completedPayments: [2000, 500],
    });

    expect(e.treatmentPrice).toBe(5500);
    expect(e.paid).toBe(2500);
    expect(e.outstanding).toBe(3000);
  });

  it('takes profit from the invoiced price, not from what has been collected', () => {
    // A case half paid is not a case half earned — using `paid` here would make every unfinished
    // case look like a loss and quietly punish staged treatment.
    const e = computeCaseEconomics({
      invoiceTotals: [10000],
      completedPayments: [1000],
      serviceCost: 3000,
      salesCommission: 800,
    });

    expect(e.netProfit).toBe(6200);
    expect(e.marginPercent).toBeCloseTo(62, 5);
  });

  it('treats missing cost and commission as zero rather than unknown', () => {
    const e = computeCaseEconomics({ invoiceTotals: [1000], completedPayments: [] });
    expect(e.serviceCost).toBe(0);
    expect(e.salesCommission).toBe(0);
    expect(e.netProfit).toBe(1000);
  });

  it('reports an overpayment separately instead of as a negative debt', () => {
    const e = computeCaseEconomics({ invoiceTotals: [1000], completedPayments: [1200] });

    expect(e.outstanding).toBe(0);
    expect(e.overpaid).toBe(200);
  });

  it('has no margin when nothing has been invoiced', () => {
    // 0/0 is not 0% — showing a margin here would be inventing a number.
    const e = computeCaseEconomics({ invoiceTotals: [], completedPayments: [], serviceCost: 50 });
    expect(e.marginPercent).toBeNull();
    expect(e.netProfit).toBe(-50);
  });

  it('can report a loss when the case costs more than it charged', () => {
    const e = computeCaseEconomics({
      invoiceTotals: [1000],
      completedPayments: [1000],
      serviceCost: 900,
      salesCommission: 300,
    });
    expect(e.netProfit).toBe(-200);
  });
});
