import { PACKAGE_INCLUSIONS, computePaymentSummary, packageInclusionDef } from '@dental-crm/shared';

// These figures go on a document a patient pays against, and the clinic's own quotation states a
// 16% card surcharge and a cash price. Getting the order of operations wrong here hands somebody a
// number the desk cannot reconcile when they arrive with an envelope.

describe('computePaymentSummary', () => {
  it('discounts for cash, then adds the card fee to the discounted price', () => {
    // The plan is quoted at the cash price, so the surcharge applies to that — not to the
    // pre-discount figure, which would overstate what the processor actually charges.
    const s = computePaymentSummary({ total: 1000, cashDiscountPercent: 10, cardFeePercent: 16 });
    expect(s.cashTotal).toBe(900);
    expect(s.cardTotal).toBe(1044);
    expect(s.cardExtra).toBe(144);
  });

  it('states the card difference as money, not only as a percentage', () => {
    // "16%" is abstract; the gap in currency is the number that changes how somebody pays.
    const s = computePaymentSummary({ total: 3500, cardFeePercent: 16 });
    expect(s.cardExtra).toBe(560);
    expect(s.cardTotal).toBe(4060);
  });

  it('takes the deposit off the cash price, which is what the plan is quoted at', () => {
    const s = computePaymentSummary({ total: 4280, depositAmount: 1000, cashDiscountPercent: 5 });
    expect(s.cashTotal).toBe(4066);
    expect(s.deposit).toBe(1000);
    expect(s.remaining).toBe(3066);
  });

  it('never reports a negative balance', () => {
    // A deposit above the total is a data-entry mistake. Printing "remaining: -400" starts an
    // argument at the desk; clamping starts a question to the coordinator instead.
    const s = computePaymentSummary({ total: 500, depositAmount: 900 });
    expect(s.deposit).toBe(500);
    expect(s.remaining).toBe(0);
  });

  it('leaves the total alone when no terms are set', () => {
    const s = computePaymentSummary({ total: 2400 });
    expect(s.cashTotal).toBe(2400);
    expect(s.cardTotal).toBe(2400);
    expect(s.cardExtra).toBe(0);
    expect(s.remaining).toBe(2400);
  });

  it('rounds to whole cents rather than printing a floating-point tail', () => {
    const s = computePaymentSummary({ total: 3333.33, cashDiscountPercent: 7, cardFeePercent: 16 });
    for (const v of [s.cashTotal, s.cardTotal, s.cardExtra, s.remaining]) {
      expect(Math.round(v * 100)).toBe(v * 100);
    }
  });

  it('treats a missing total as zero rather than NaN', () => {
    const s = computePaymentSummary({ total: Number.NaN, cardFeePercent: 16 });
    expect(s.cashTotal).toBe(0);
    expect(s.cardTotal).toBe(0);
  });
});

describe('package inclusions', () => {
  it('covers everything the clinic already promises on its quotation', () => {
    const keys = PACKAGE_INCLUSIONS.map((p) => p.key);
    for (const expected of ['HOTEL', 'MEDICATION', 'PANORAMIC_XRAY', 'AFTERCARE', 'AIRPORT_TRANSFER']) {
      expect(keys).toContain(expected);
    }
  });

  it('gives every inclusion a line that says what the patient gets', () => {
    for (const item of PACKAGE_INCLUSIONS) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.detail.length).toBeGreaterThan(20);
    }
  });

  it('ignores a key it does not recognise instead of rendering a blank row', () => {
    expect(packageInclusionDef('SOMETHING_ELSE')).toBeUndefined();
  });
});
