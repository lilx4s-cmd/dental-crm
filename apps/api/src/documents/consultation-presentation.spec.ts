import { ConsultationSchema, DOCUMENT_LANGUAGES, consultationExample, consultationChart, consultationQuotedPayment, consultationVisitBreakdown, consultationPresentationCopy, preserveConsultationLineDetails, parseConsultation } from '@dental-crm/shared';
it('uses the saved discount, travel coverage and canonical cash/card payment calculation', () => {
  const example = consultationExample();
  expect(consultationVisitBreakdown(example.plan, 1)).toMatchObject({
    subtotal: 900,
    discount: 100,
    hotel: 0,
    transfer: 0,
    total: 800
  });
  expect(consultationVisitBreakdown(example.plan, 2)).toMatchObject({
    subtotal: 500,
    discount: 0,
    hotel: 420,
    transfer: 75,
    total: 995
  });
  expect(consultationQuotedPayment(example.plan, example.payment)).toMatchObject({
    total: 1795,
    cashTotal: 1759.1,
    cardTotal: 1811.87,
    cardExtra: 52.77,
    deposit: 300,
    remaining: 1459.1
  });
});
it('does not guess positions when pricing is incomplete or positions are unassigned', () => {
  const example = consultationExample();
  const plan = {
    ...example.plan,
    findings: {},
    lines: example.plan.lines.map(line => ({
      ...line,
      positions: [],
      unitPrice: null,
      discount: 0
    }))
  };
  expect(ConsultationSchema.safeParse(plan).success).toBe(true);
  expect(consultationVisitBreakdown(plan, 1).unpriced).toBe(true);
  expect(consultationChart(plan, 1)).toEqual({});
});
it('keeps the recorded tooth until its proposed extraction and replacement are applied', () => {
  const example = consultationExample();
  const plan = {
    ...example.plan,
    findings: {
      '12': 'healthy' as const
    },
    lines: [{
      ...example.plan.lines[0],
      id: 'extraction',
      type: 'extraction' as const,
      quantity: 1,
      positions: ['12'],
      discount: 0
    }, {
      ...example.plan.lines[0],
      quantity: 1,
      positions: ['12'],
      visit: 2
    }]
  };
  expect(ConsultationSchema.safeParse(plan).success).toBe(true);
  expect(consultationChart(plan, 1, 'recorded')).toEqual({
    '12': 'healthy'
  });
  expect(consultationChart(plan, 1)).toEqual({
    '12': 'extraction'
  });
  expect(consultationChart(plan, 2)).toEqual({
    '12': 'implant'
  });
});
it('preserves saved price exceptions and tooth positions when treatment quantities are refreshed', () => {
  const example = consultationExample();
  const parsed = parseConsultation('3 implants', 'USD', example.config).lines;
  const saved = {
    ...parsed[0],
    id: 'saved',
    quantity: 2,
    unitPrice: 400,
    discount: 50,
    positions: ['12', '22'],
    overrideReason: 'Approved earlier'
  };
  const merged = preserveConsultationLineDetails(parsed, [saved]);
  expect(merged[0]).toMatchObject({
    id: 'saved',
    quantity: 3,
    unitPrice: 400,
    discount: 50,
    positions: ['12', '22'],
    overrideReason: 'Approved earlier'
  });
  expect(saved.quantity).toBe(2);
});
it.each(DOCUMENT_LANGUAGES)('retains complete patient wording and valid fixtures in %s', language => {
  const example = consultationExample(language);
  expect(ConsultationSchema.safeParse(example.plan).success).toBe(true);
  expect(Object.values(consultationPresentationCopy(language)).every(value => value.length > 0)).toBe(true);
  expect(consultationQuotedPayment(example.plan, example.payment).total).toBe(1795);
});
it('keeps treatment-day estimates separate from hotel nights on old and new plans', () => {
  const example = consultationExample();
  expect(example.plan.visits[0]).toMatchObject({
    treatmentDays: 4,
    nights: 5
  });
  const old = {
    ...example.plan,
    visits: example.plan.visits.map(({
      treatmentDays: _days,
      ...visit
    }) => visit)
  };
  expect(ConsultationSchema.parse(old).visits[0].treatmentDays).toBeUndefined();
});
it('preserves saved line identities without colliding with newly parsed procedures', () => {
  const example = consultationExample();
  const saved = parseConsultation('2 crowns', 'USD', example.config).lines;
  const parsed = parseConsultation('1 veneer + 2 crowns', 'USD', example.config).lines;
  const result = preserveConsultationLineDetails(parsed, saved);
  expect(result[1].id).toBe(saved[0].id);
  expect(new Set(result.map(line => line.id)).size).toBe(2);
});

it('retains saved brand, material, price and FDI after catalog defaults change', () => {
  const example = consultationExample();
  const parsed = [{ ...example.plan.lines[0], unitPrice: 990, material: 'New default material', brand: 'New default brand', quantity: 3, positions: [] }];
  const result = preserveConsultationLineDetails(parsed, [example.plan.lines[0]], '3 implants');
  expect(result[0]).toMatchObject({ quantity: 3, unitPrice: 450, discount: 100, material: 'Titanium', brand: 'Example implant brand', positions: ['12', '22'] });
});
it('keeps differently priced saved rows instead of collapsing a plain-text summary', () => {
  const example = consultationExample();
  const saved = [example.plan.lines[0], { ...example.plan.lines[0], id: 'other-brand', brand: 'Other brand', unitPrice: 700, positions: ['14', '24'] }];
  const parsed = [{ ...example.plan.lines[0], quantity: 4, positions: [] }];
  expect(preserveConsultationLineDetails(parsed, saved, '4 implants')).toEqual(saved);
  expect(() => preserveConsultationLineDetails([{ ...parsed[0], quantity: 5 }], saved, '5 implants')).toThrow('Ambiguous saved treatment allocation');
});
it('uses catalog pricing when a different material is explicitly requested', () => {
  const example = consultationExample();
  const saved = [{ ...example.plan.lines[1], type: 'crown' as const }];
  const parsed = [{ ...saved[0], id: 'new-line', unitPrice: 350, material: 'E.max', positions: [] }];
  expect(preserveConsultationLineDetails(parsed, saved, '2 E.max crowns')[0]).toMatchObject({ material: 'E.max', unitPrice: 350 });
});
