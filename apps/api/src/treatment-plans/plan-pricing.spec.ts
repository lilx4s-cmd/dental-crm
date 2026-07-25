import { computePhaseTotals, computePlanTotal } from '@dental-crm/shared';

// The API persists TreatmentPlan.totalCost from this helper, the builder shows a running total from
// it, and the patient's PDF prints it. They must all land on the same number, so the rules that are
// easy to get subtly wrong — which phase an item falls into, discount ordering, and clamping — are
// pinned here rather than left to the three call sites to rediscover.
describe('treatment plan pricing', () => {
  it('groups unphased items into phase 1', () => {
    const totals = computePhaseTotals([{ cost: 100 }, { cost: 50, phaseNumber: null }]);
    expect(totals).toHaveLength(1);
    expect(totals[0]).toMatchObject({ phaseNumber: 1, subtotal: 150, total: 150 });
  });

  it('subtotals each phase separately and orders them', () => {
    const totals = computePhaseTotals([
      { cost: 300, phaseNumber: 2 },
      { cost: 100, phaseNumber: 1 },
      { cost: 200, phaseNumber: 2 },
    ]);
    expect(totals.map((t) => t.phaseNumber)).toEqual([1, 2]);
    expect(totals.map((t) => t.subtotal)).toEqual([100, 500]);
  });

  it('applies a percentage discount against that phase only', () => {
    const totals = computePhaseTotals(
      [
        { cost: 1000, phaseNumber: 1 },
        { cost: 400, phaseNumber: 2 },
      ],
      [{ phaseNumber: 1, discountPercent: 10 }],
    );
    expect(totals[0]).toMatchObject({ subtotal: 1000, discount: 100, total: 900 });
    expect(totals[1]).toMatchObject({ subtotal: 400, discount: 0, total: 400 });
  });

  it('takes the percentage off first, then the flat amount', () => {
    const [phase] = computePhaseTotals(
      [{ cost: 1000 }],
      [{ phaseNumber: 1, discountPercent: 10, discountAmount: 200 }],
    );
    expect(phase.discount).toBe(300); // 10% of 1000, then 200 — not 10% of 800
    expect(phase.total).toBe(700);
  });

  it('never discounts a phase below zero', () => {
    const [phase] = computePhaseTotals([{ cost: 100 }], [{ phaseNumber: 1, discountAmount: 500 }]);
    expect(phase.discount).toBe(100);
    expect(phase.total).toBe(0);
  });

  it('keeps a phase that carries only a healing period, with no line items', () => {
    const totals = computePhaseTotals([{ cost: 100, phaseNumber: 1 }], [{ phaseNumber: 2, healingPeriodMonths: 6 }]);
    expect(totals).toHaveLength(2);
    expect(totals[1]).toMatchObject({ phaseNumber: 2, subtotal: 0, total: 0, healingPeriodMonths: 6 });
  });

  it('totals the plan as the sum of post-discount phase totals', () => {
    const items = [
      { cost: 5510.25, phaseNumber: 1 },
      { cost: 3975, phaseNumber: 2 },
    ];
    const phases = [
      { phaseNumber: 1, discountAmount: 5 },
      { phaseNumber: 2, discountAmount: 500 },
    ];
    expect(computePlanTotal(items, phases)).toBeCloseTo(8980.25, 2);
  });
});
