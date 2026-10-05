import { z } from 'zod';
import { Prisma } from '@prisma/client';
export const decimal = z
  .string()
  .regex(
    /^\d{1,12}(\.\d{1,2})?$/,
    'Enter a non-negative decimal amount with at most two decimal places',
  );
export const currency = z
  .string()
  .length(3)
  .refine(
    (v) =>
      /^[A-Z]{3}$/.test(v) &&
      (Intl as unknown as { supportedValuesOf: (s: string) => string[] })
        .supportedValuesOf('currency')
        .includes(v),
    'Unsupported currency',
  );
const timezone = z.string().refine((v) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: v });
    return true;
  } catch {
    return false;
  }
}, 'Invalid IANA timezone');
export const flightSchema = z.object({
  local: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  timezone,
  offset: z.string().regex(/^[+-]\d{2}:\d{2}$/),
  origin: z.string().regex(/^[A-Z]{3}$/),
  destination: z.string().regex(/^[A-Z]{3}$/),
  number: z.string().trim().min(2).max(20),
});
export function flightInstant(f: z.infer<typeof flightSchema>) {
  const date = new Date(f.local + ':00' + f.offset);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid flight date');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: f.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (k: string) => parts.find((p) => p.type === k)?.value;
  if (`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}` !== f.local)
    throw new Error(
      'Flight offset does not match the local time and timezone; check daylight saving',
    );
  return date;
}
export const readinessKeys = [
  'arrivalTicket',
  'returnFlight',
  'hotel',
  'hotelDates',
  'airportPickup',
  'airportDeparture',
  'clinicTransfers',
  'appointment',
  'coordinator',
] as const;
const readiness = z
  .object({
    state: z.enum(['MISSING', 'READY', 'NOT_REQUIRED']),
    reason: z.string().max(500).default(''),
    responsibleId: z.string().uuid().nullable().default(null),
    provider: z.string().max(200).default(''),
  })
  .refine(
    (v) => v.state !== 'NOT_REQUIRED' || v.reason.trim().length > 0,
    'Not required needs a reason',
  );
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const date = new Date(v + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === v;
  }, 'Use a valid calendar date');
export const bookingSchema = z
  .object({
    patientId: z.string().uuid(),
    leadId: z.string().uuid(),
    visit: z.number().int().min(1).max(2),
    status: z.enum(['DRAFT', 'CONFIRMED', 'ARRIVED', 'COMPLETED', 'CANCELLED']),
    revision: z.number().int().positive().optional(),
    arrival: flightSchema.nullable(),
    departure: flightSchema.nullable(),
    detailsConfirmed: z.boolean(),
    passengers: z.number().int().min(1).max(100),
    companions: z.string().max(2000).default(''),
    treatmentPlanId: z.string().uuid().nullable().default(null),
    hotel: z
      .object({
        name: z.string().max(200).default(''),
        room: z.string().max(100).default(''),
        checkIn: calendarDate.nullable().default(null),
        checkOut: calendarDate.nullable().default(null),
        nights: z.number().int().min(0).max(365).default(0),
      })
      .default({}),
    readiness: z.record(z.enum(readinessKeys), readiness).default({}),
    notes: z.string().max(4000).default(''),
  })
  .superRefine((v, c) => {
    const issue = (message: string) => c.addIssue({ code: 'custom', message });
    if (v.readiness.arrivalTicket?.state === 'READY' && (!v.arrival || !v.detailsConfirmed))
      issue('Arrival ticket readiness requires confirmed flight details');
    if (v.readiness.returnFlight?.state === 'READY' && !v.departure)
      issue('Return flight readiness requires a departure flight');
    if (v.readiness.hotel?.state === 'READY' && !v.hotel.name.trim())
      issue('Enter the booked hotel name');
    if (v.readiness.hotelDates?.state === 'READY' && (!v.hotel.checkIn || !v.hotel.checkOut))
      issue('Confirm both hotel dates');
    for (const key of [
      'airportPickup',
      'airportDeparture',
      'clinicTransfers',
      'appointment',
      'coordinator',
    ] as const) {
      const r = v.readiness[key];
      if (r?.state === 'READY' && !r.responsibleId && !r.provider.trim())
        issue(`${key} needs an assigned coordinator or provider`);
    }
    if (
      ['CONFIRMED', 'ARRIVED', 'COMPLETED'].includes(v.status) &&
      (!v.arrival || !v.detailsConfirmed)
    )
      c.addIssue({
        code: 'custom',
        message:
          'Confirm the extracted/entered flight details and arrival before confirming travel',
      });
    try {
      const a = v.arrival ? flightInstant(v.arrival) : null,
        d = v.departure ? flightInstant(v.departure) : null;
      if (a && d && d <= a)
        c.addIssue({ code: 'custom', message: 'Departure must follow arrival' });
    } catch (e) {
      c.addIssue({ code: 'custom', message: (e as Error).message });
    }
    if (v.hotel.checkIn && v.hotel.checkOut) {
      const n = (Date.parse(v.hotel.checkOut) - Date.parse(v.hotel.checkIn)) / 86400000;
      if (!Number.isInteger(n) || n < 0 || n !== v.hotel.nights)
        c.addIssue({ code: 'custom', message: 'Hotel nights must match check-in/check-out dates' });
    }
  });
export const catalogSchema = z.object({
  key: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  name: z.string().min(1).max(200),
  category: z.enum([
    'IMPLANT',
    'CROWN',
    'VENEER',
    'ABUTMENT',
    'EXTRACTION',
    'GRAFT',
    'SINUS',
    'LAB',
    'TEMPORARY',
    'SCAN',
    'MEDICATION',
    'HOTEL',
    'TRANSFER',
    'OTHER',
    'FEE',
  ]),
  unit: z.string().min(1).max(100),
  currency,
  sellingPrice: decimal.nullable(),
  cost: decimal.nullable(),
  provider: z.string().max(200).default(''),
  brand: z.string().max(100).default(''),
  material: z.string().max(100).default(''),
  effectiveAt: z.string().datetime(),
  active: z.boolean(),
  reason: z.string().trim().min(3).max(1000),
});
export const costLineSchema = z.object({
  catalogId: z.string().uuid(),
  quantity: z
    .string()
    .regex(/^\d{1,5}(\.\d{1,3})?$/)
    .refine((v) => Number(v) > 0),
  included: z.boolean(),
  actualCost: decimal.nullable().default(null),
  exception: z
    .object({
      sellingPrice: decimal.nullable(),
      cost: decimal.nullable(),
      reason: z.string().trim().min(3).max(1000),
    })
    .nullable()
    .default(null),
});
export const snapshotSchema = z
  .object({
    patientId: z.string().uuid(),
    leadId: z.string().uuid(),
    visit: z.number().int().min(1).max(2),
    state: z.enum(['ESTIMATE', 'CONFIRMED']),
    reportMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    mode: z.enum(['ITEMIZED', 'PACKAGE']),
    packagePrice: decimal.nullable(),
    currency,
    lines: z.array(costLineSchema).min(1).max(100),
    exchangeRates: z
      .array(
        z.object({
          from: currency,
          to: currency,
          rate: z
            .string()
            .regex(/^\d{1,8}(\.\d{1,8})?$/)
            .refine((v) => Number(v) > 0),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        }),
      )
      .max(30),
    commission: decimal.nullable(),
    reason: z.string().trim().min(3).max(1000),
  })
  .refine((v) => v.mode !== 'PACKAGE' || v.packagePrice !== null, 'Package price is required');
type MoneyLine = {
  category: string;
  currency: string;
  quantity: string;
  sellingPrice: string | null;
  cost: string | null;
  actualCost: string | null;
  included: boolean;
};
const D = Prisma.Decimal;
export function calculateCase(input: {
  currency: string;
  mode: 'ITEMIZED' | 'PACKAGE';
  packagePrice: string | null;
  commission: string | null;
  exchangeRates: { from: string; to: string; rate: string; date: string }[];
  lines: MoneyLine[];
}) {
  let revenue = new D(input.mode === 'PACKAGE' ? input.packagePrice! : '0'),
    cost = new D(0),
    actual = new D(0);
  const missing: string[] = [];
  const groups: Record<string, { estimated: string | null; actual: string | null }> = {};
  const convert = (v: Prisma.Decimal, from: string) => {
    if (from === input.currency) return v;
    const rate = input.exchangeRates.find((r) => r.from === from && r.to === input.currency);
    if (!rate) {
      missing.push(`Exchange rate ${from}/${input.currency}`);
      return null;
    }
    return v.mul(rate.rate).toDecimalPlaces(2, D.ROUND_HALF_UP);
  };
  for (const [i, line] of input.lines.entries()) {
    const quantity = new D(line.quantity);
    if (input.mode === 'ITEMIZED' && !line.included) {
      if (line.sellingPrice === null) missing.push(`Selling price item ${i + 1}`);
      else {
        const value = convert(
          new D(line.sellingPrice).mul(quantity).toDecimalPlaces(2, D.ROUND_HALF_UP),
          line.currency,
        );
        if (value) revenue = revenue.add(value);
      }
    }
    let estimate: Prisma.Decimal | null = null,
      act: Prisma.Decimal | null = null;
    if (line.cost === null) missing.push(`Estimated cost item ${i + 1}`);
    else
      estimate = convert(
        new D(line.cost).mul(quantity).toDecimalPlaces(2, D.ROUND_HALF_UP),
        line.currency,
      );
    if (line.actualCost === null) missing.push(`Actual cost item ${i + 1}`);
    else
      act = convert(
        new D(line.actualCost).mul(quantity).toDecimalPlaces(2, D.ROUND_HALF_UP),
        line.currency,
      );
    if (estimate) cost = cost.add(estimate);
    if (act) actual = actual.add(act);
    const g = groups[line.category] ?? { estimated: '0.00', actual: '0.00' };
    g.estimated =
      g.estimated === null || estimate === null
        ? null
        : new D(g.estimated).add(estimate).toFixed(2);
    g.actual = g.actual === null || act === null ? null : new D(g.actual).add(act).toFixed(2);
    groups[line.category] = g;
  }
  if (input.commission === null) missing.push('Commission policy/calculation');
  const expectedMissing = missing.filter((m) => !m.startsWith('Actual cost'));
  return {
    currency: input.currency,
    revenue: missing.some((m) => m.startsWith('Selling') || m.startsWith('Exchange'))
      ? null
      : revenue.toFixed(2),
    estimatedCost: expectedMissing.some(
      (m) => m.startsWith('Estimated') || m.startsWith('Exchange'),
    )
      ? null
      : cost.toFixed(2),
    actualCost: missing.some((m) => m.startsWith('Actual') || m.startsWith('Exchange'))
      ? null
      : actual.toFixed(2),
    commission: input.commission,
    expectedContribution: expectedMissing.length
      ? null
      : revenue.minus(cost).minus(input.commission!).toFixed(2),
    actualContribution: missing.length
      ? null
      : revenue.minus(actual).minus(input.commission!).toFixed(2),
    groups,
    missing,
    rounding:
      'Each quantity × unit amount rounded to 2 decimals, HALF_UP; FX conversion rounded per line.',
  };
}
export const compensationSchema = z.object({
  staffId: z.string().uuid(),
  currency,
  salary: decimal,
  salaryAccrual: z.enum(['MONTH_START', 'MONTH_END']),
  effectiveAt: z.string().datetime(),
  trigger: z.enum(['BOOKING', 'DEPOSIT', 'ARRIVAL', 'COLLECTED_PAYMENT', 'COMPLETED_TREATMENT']),
  basis: z.enum(['AGREED_REVENUE', 'COLLECTED_REVENUE', 'DEFINED_PROFIT']),
  fixed: decimal,
  percentage: z.string().regex(/^\d{1,2}(\.\d{1,4})?$|^100(\.0{1,4})?$/),
  tiers: z
    .array(
      z.object({
        threshold: decimal,
        percentage: z.string().regex(/^\d{1,2}(\.\d{1,4})?$|^100(\.0{1,4})?$/),
      }),
    )
    .max(20),
  excludedCategories: z.array(z.enum(['HOTEL', 'TRANSFER', 'FEE', 'TAX'])),
  attribution: z.enum(['AT_TRIGGER', 'ORIGINAL_SALESPERSON', 'MANUAL_SHARED']),
  cancellation: z.enum(['REVERSE', 'KEEP_EARNED', 'MANUAL_REVIEW']),
  refund: z.enum(['PROPORTIONAL', 'REVERSE', 'MANUAL_REVIEW']),
  scope: z.enum(['PER_CASE', 'PER_VISIT']),
  reason: z.string().trim().min(3).max(1000),
});
export function missingArrangements(details: z.infer<typeof bookingSchema>) {
  return readinessKeys.filter(
    (k) => !details.readiness[k] || details.readiness[k]?.state === 'MISSING',
  );
}
