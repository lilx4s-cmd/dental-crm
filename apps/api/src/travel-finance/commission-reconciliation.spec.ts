import { Prisma } from '@prisma/client';
import { TravelFinanceService } from './travel-finance.service';
const D = Prisma.Decimal;
const policy = {
  staffId: 'staff',
  currency: 'EUR',
  salary: '1000',
  salaryAccrual: 'MONTH_START',
  effectiveAt: '2026-01-01T00:00:00Z',
  trigger: 'BOOKING',
  basis: 'AGREED_REVENUE',
  fixed: '10',
  percentage: '5',
  tiers: [],
  excludedCategories: [],
  attribution: 'AT_TRIGGER',
  cancellation: 'REVERSE',
  refund: 'PROPORTIONAL',
  scope: 'PER_CASE',
  reason: 'Clinic policy',
};
const snap = {
  id: 'snapshot',
  patientId: 'patient',
  leadId: 'lead',
  visit: 1,
  createdAt: new Date('2026-10-01'),
  details: {
    currency: 'EUR',
    mode: 'ITEMIZED',
    assignedToId: 'staff',
    lines: [],
    totals: { revenue: '2000', estimatedCost: '800' },
  },
};
const rule = { id: 'rule', version: 1, staffId: 'staff', createdById: 'admin', details: policy };
function fixture() {
  const db = {
    caseCostSnapshot: {
      findMany: jest.fn().mockResolvedValue([snap]),
      findFirst: jest.fn().mockResolvedValue(snap),
    },
    lead: { findUnique: jest.fn().mockResolvedValue({ assignedToId: 'staff', stage: 'NEW' }) },
    compensationRule: {
      findUnique: jest.fn().mockResolvedValue(rule),
      findFirst: jest.fn().mockResolvedValue(rule),
    },
    commissionEntry: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn(),
    },
    travelBooking: { findMany: jest.fn().mockResolvedValue([{ status: 'CONFIRMED', visit: 1 }]) },
    payment: { findMany: jest.fn().mockResolvedValue([]) },
    financialChange: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation((fn) => fn(db));
  return {
    db,
    service: new TravelFinanceService(db as never, {} as never, {} as never, {} as never),
  };
}
it('earns exactly one fixed plus percentage commission per case', async () => {
  const f = fixture();
  await f.service.reconcileCommissions(['lead']);
  const data = f.db.commissionEntry.upsert.mock.calls[0][0];
  expect(data.where.dedupeKey).toBe('commission:lead:0');
  expect(data.create.amount.toFixed(2)).toBe('110.00');
  expect(data.create.state).toBe('EARNED');
  expect(data.create.earnedAt).toBeInstanceOf(Date);
});
it('uses the new salesperson rule before eligibility and freezes it after eligibility', async () => {
  const f = fixture();
  const old = {
    ...rule,
    id: 'old-entry',
    ruleId: 'old-rule',
    state: 'ESTIMATED',
    staffId: 'previous',
    amount: new D(60),
    calculation: { policy: { ...policy, percentage: '2' } },
  };
  f.db.commissionEntry.findFirst.mockResolvedValue(old);
  f.db.commissionEntry.findUnique.mockResolvedValue(old);
  await f.service.reconcileCommissions(['lead']);
  expect(f.db.compensationRule.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({ where: expect.objectContaining({ staffId: 'staff' }) }),
  );
  const update = f.db.commissionEntry.upsert.mock.calls[0][0].update;
  expect(update.staffId).toBe('staff');
  expect(update.ruleId).toBe('rule');
  expect(update.amount.toFixed(2)).toBe('110.00');
});
it('does not reattribute an earned case when the deal is reassigned', async () => {
  const f = fixture();
  const old = {
    id: 'earned',
    ruleId: 'rule',
    state: 'EARNED',
    staffId: 'original',
    amount: new D(110),
    earnedAt: new Date(),
    calculation: { policy },
  };
  f.db.commissionEntry.findFirst.mockResolvedValue(old);
  f.db.commissionEntry.findUnique.mockResolvedValue(old);
  await f.service.reconcileCommissions(['lead']);
  expect(f.db.commissionEntry.upsert.mock.calls[0][0].update.staffId).toBeUndefined();
  expect(f.db.commissionEntry.upsert.mock.calls[0][0].create.staffId).toBe('original');
});
it('records a negative adjustment for paid cancellation without rewriting the paid ledger', async () => {
  const f = fixture();
  const old = {
    id: 'paid',
    ruleId: 'rule',
    state: 'PAID',
    staffId: 'staff',
    patientId: 'patient',
    currency: 'EUR',
    amount: new D(110),
    calculation: { policy },
  };
  f.db.commissionEntry.findFirst.mockResolvedValue(old);
  f.db.commissionEntry.findUnique.mockResolvedValue(old);
  f.db.travelBooking.findMany.mockResolvedValue([{ status: 'CANCELLED', visit: 1 }]);
  await f.service.reconcileCommissions(['lead']);
  const create = f.db.commissionEntry.upsert.mock.calls[0][0].create;
  expect(create.amount.toFixed(2)).toBe('-110.00');
  expect(create.dedupeKey).toContain(':adjust:');
  expect(f.db.commissionEntry.update).not.toHaveBeenCalled();
});
it('does not create a second refund adjustment on a retry', async () => {
  const f = fixture();
  const old = {
    id: 'paid',
    ruleId: 'rule',
    state: 'PAID',
    staffId: 'staff',
    patientId: 'patient',
    currency: 'EUR',
    amount: new D(110),
    calculation: { policy },
  };
  f.db.commissionEntry.findFirst.mockResolvedValue(old);
  f.db.commissionEntry.findUnique.mockResolvedValue(old);
  f.db.payment.findMany.mockResolvedValue([
    { id: 'refund', currency: 'EUR', status: 'REFUNDED', amount: new D(1000) },
  ]);
  await f.service.reconcileCommissions(['lead']);
  expect(f.db.commissionEntry.upsert.mock.calls[0][0].create.amount.toFixed(2)).toBe('-55.00');
  f.db.commissionEntry.findMany.mockResolvedValue([{ amount: new D('-55') }]);
  f.db.commissionEntry.upsert.mockClear();
  await f.service.reconcileCommissions(['lead']);
  expect(f.db.commissionEntry.upsert).not.toHaveBeenCalled();
});
it('uses only explicitly allocated payments for a visit and does not earn from unallocated receipts', async () => {
  const f = fixture();
  f.db.compensationRule.findFirst.mockResolvedValue({
    ...rule,
    details: {
      ...policy,
      scope: 'PER_VISIT',
      basis: 'COLLECTED_REVENUE',
      trigger: 'COLLECTED_PAYMENT',
    },
  });
  await f.service.reconcileCommissions(['lead']);
  expect(f.db.payment.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: expect.objectContaining({ visitNumber: 1 }) }),
  );
  expect(f.db.commissionEntry.upsert.mock.calls[0][0].create.state).toBe('ESTIMATED');
});
it('requires the specific visit to complete for per-visit completed-treatment commission', async () => {
  const f = fixture();
  f.db.compensationRule.findFirst.mockResolvedValue({
    ...rule,
    details: { ...policy, scope: 'PER_VISIT', trigger: 'COMPLETED_TREATMENT' },
  });
  f.db.lead.findUnique.mockResolvedValue({ assignedToId: 'staff', stage: 'DONE' });
  await f.service.reconcileCommissions(['lead']);
  expect(f.db.commissionEntry.upsert.mock.calls[0][0].create.state).toBe('ESTIMATED');
});
it('rejects editing a paid entry even when an amount and adjustment reason are supplied', async () => {
  const f = fixture();
  f.db.commissionEntry.findUniqueOrThrow.mockResolvedValue({ state: 'PAID', amount: new D(110) });
  await expect(
    f.service.commissionAction(
      'paid',
      { state: 'ADJUSTED', amount: '50', reason: 'Refund adjustment' },
      { role: 'SUPER_ADMIN', sub: 'admin' } as never,
    ),
  ).rejects.toThrow('immutable');
  expect(f.db.commissionEntry.update).not.toHaveBeenCalled();
});
