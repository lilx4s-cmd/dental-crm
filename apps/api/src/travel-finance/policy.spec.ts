import {
  bookingSchema,
  flightInstant,
  calculateCase,
  compensationSchema,
  missingArrangements,
  decimal,
} from './policy';
const uuid = '00000000-0000-4000-8000-000000000001';
const flight = {
  local: '2026-10-31T23:45',
  timezone: 'Europe/Istanbul',
  offset: '+03:00',
  origin: 'CDG',
  destination: 'IST',
  number: 'TK123',
};
const booking = {
  patientId: uuid,
  leadId: uuid,
  visit: 1,
  status: 'CONFIRMED',
  arrival: flight,
  departure: { ...flight, local: '2026-11-07T01:15', origin: 'IST', destination: 'CDG' },
  detailsConfirmed: true,
  passengers: 2,
};
const base = {
  currency: 'EUR',
  mode: 'ITEMIZED' as const,
  packagePrice: null,
  commission: '50.00',
  exchangeRates: [],
  lines: [
    {
      category: 'IMPLANT',
      currency: 'EUR',
      quantity: '3',
      sellingPrice: '350.10',
      cost: '100.15',
      actualCost: '102.10',
      included: false,
    },
    {
      category: 'HOTEL',
      currency: 'EUR',
      quantity: '5',
      sellingPrice: '60.00',
      cost: '40.00',
      actualCost: '42.00',
      included: true,
    },
  ],
};
it('stores local timezone flights crossing midnight and month boundaries correctly', () => {
  expect(flightInstant(flight).toISOString()).toBe('2026-10-31T20:45:00.000Z');
  expect(bookingSchema.parse(booking).visit).toBe(1);
});
it('rejects mismatched daylight-saving offsets', () => {
  expect(() => flightInstant({ ...flight, timezone: 'Europe/Paris', offset: '+02:00' })).toThrow(
    'offset',
  );
});
it('rejects nonexistent spring-forward local times', () => {
  expect(() =>
    flightInstant({
      ...flight,
      local: '2026-03-29T02:30',
      timezone: 'Europe/Paris',
      offset: '+01:00',
    }),
  ).toThrow();
});
it('accepts either explicitly chosen offset for a repeated autumn clock hour', () => {
  expect(
    flightInstant({
      ...flight,
      local: '2026-10-25T02:30',
      timezone: 'Europe/Paris',
      offset: '+02:00',
    }).toISOString(),
  ).toBe('2026-10-25T00:30:00.000Z');
  expect(
    flightInstant({
      ...flight,
      local: '2026-10-25T02:30',
      timezone: 'Europe/Paris',
      offset: '+01:00',
    }).toISOString(),
  ).toBe('2026-10-25T01:30:00.000Z');
});
it('requires confirmation before booking and never invents readiness', () => {
  expect(bookingSchema.safeParse({ ...booking, detailsConfirmed: false }).success).toBe(false);
  expect(missingArrangements(bookingSchema.parse(booking))).toHaveLength(9);
});
it('rejects duplicate visit interpretations and incorrect hotel nights', () => {
  expect(bookingSchema.safeParse({ ...booking, visit: 3 }).success).toBe(false);
  expect(
    bookingSchema.safeParse({
      ...booking,
      hotel: { checkIn: '2026-10-31', checkOut: '2026-11-05', nights: 4 },
    }).success,
  ).toBe(false);
});
it('requires a reason for not-required arrangements', () => {
  expect(
    bookingSchema.safeParse({ ...booking, readiness: { hotel: { state: 'NOT_REQUIRED' } } })
      .success,
  ).toBe(false);
});
it('uses decimal arithmetic and charges included hotel only as an internal cost', () => {
  const total = calculateCase(base);
  expect(total.revenue).toBe('1050.30');
  expect(total.estimatedCost).toBe('500.45');
  expect(total.actualCost).toBe('516.30');
  expect(total.expectedContribution).toBe('499.85');
});
it('counts a package once without recharging any item or included hotel', () => {
  const total = calculateCase({ ...base, mode: 'PACKAGE', packagePrice: '2000.00' });
  expect(total.revenue).toBe('2000.00');
  expect(total.expectedContribution).toBe('1449.55');
});
it('flags missing estimated costs instead of claiming zero-cost profit', () => {
  const total = calculateCase({ ...base, lines: [{ ...base.lines[0], cost: null }] });
  expect(total.estimatedCost).toBeNull();
  expect(total.expectedContribution).toBeNull();
  expect(total.missing).toContain('Estimated cost item 1');
});
it('never silently combines different currencies', () => {
  const total = calculateCase({ ...base, lines: [{ ...base.lines[0], currency: 'USD' }] });
  expect(total.expectedContribution).toBeNull();
  expect(total.missing).toContain('Exchange rate USD/EUR');
});
it('records explicit FX conversion and rounds half up per line', () => {
  const total = calculateCase({
    ...base,
    exchangeRates: [{ from: 'USD', to: 'EUR', rate: '0.9', date: '2026-10-05' }],
    lines: [
      {
        ...base.lines[0],
        currency: 'USD',
        quantity: '1.005',
        sellingPrice: '1.00',
        cost: '0.50',
        actualCost: '0.50',
      },
    ],
    commission: '0.00',
  });
  expect(total.revenue).toBe('0.91');
  expect(total.estimatedCost).toBe('0.45');
  expect(total.rounding).toContain('HALF_UP');
});
it('does not report actual profit until actual expenses and commission are known', () => {
  expect(calculateCase({ ...base, commission: null }).actualContribution).toBeNull();
  expect(
    calculateCase({ ...base, lines: [{ ...base.lines[0], actualCost: null }] }).actualContribution,
  ).toBeNull();
});
it('requires an explicit compensation policy rather than choosing one', () => {
  expect(
    compensationSchema.safeParse({ staffId: uuid, currency: 'EUR', salary: '1000.00' }).success,
  ).toBe(false);
});
it('rejects floating money inputs and more than two money decimals', () => {
  expect(decimal.safeParse(0.1 + 0.2).success).toBe(false);
  expect(decimal.safeParse('100.001').success).toBe(false);
});
it('rejects impossible hotel dates rather than normalizing them silently', () => {
  expect(
    bookingSchema.safeParse({
      ...booking,
      hotel: { checkIn: '2026-02-30', checkOut: '2026-03-05', nights: 3 },
    }).success,
  ).toBe(false);
});
it('does not accept readiness that contradicts the travel or hotel details', () => {
  expect(
    bookingSchema.safeParse({
      ...booking,
      departure: null,
      readiness: { returnFlight: { state: 'READY' } },
    }).success,
  ).toBe(false);
  expect(
    bookingSchema.safeParse({
      ...booking,
      readiness: { hotel: { state: 'READY' }, coordinator: { state: 'READY' } },
    }).success,
  ).toBe(false);
});
