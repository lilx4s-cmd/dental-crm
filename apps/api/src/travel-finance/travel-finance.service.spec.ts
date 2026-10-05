import { TravelFinanceService } from './travel-finance.service';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
const ids = {
  patient: '00000000-0000-4000-8000-000000000001',
  lead: '00000000-0000-4000-8000-000000000002',
  user: '00000000-0000-4000-8000-000000000003',
  item: '00000000-0000-4000-8000-000000000004',
};
const user = { sub: ids.user, role: 'SALES_CONSULTANT' } as never;
const manager = { sub: ids.user, role: 'SUPER_ADMIN' } as never;
const details = {
  patientId: ids.patient,
  leadId: ids.lead,
  visit: 1,
  status: 'DRAFT',
  arrival: null,
  departure: null,
  detailsConfirmed: false,
  passengers: 1,
};
function fixture() {
  const db = {
    lead: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: ids.lead, assignedToId: ids.user, patient: { id: ids.patient } }),
    },
    travelBooking: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockImplementation(({ data }) => Promise.resolve({ ...data, id: 'b', revision: 1 })),
      update: jest
        .fn()
        .mockImplementation(({ data }) => Promise.resolve({ ...data, id: 'b', revision: 2 })),
    },
    calendarSync: { upsert: jest.fn().mockResolvedValue({}) },
    costCatalogVersion: { findMany: jest.fn(), findUnique: jest.fn() },
    caseCostSnapshot: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...data, id: 'snap' })),
    },
    financialChange: { create: jest.fn() },
    compensationRule: { findMany: jest.fn() },
    businessExpense: { upsert: jest.fn() },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation((fn) => fn(db));
  const google = { retry: jest.fn() };
  const files = { getDownloadUrl: jest.fn() };
  const service = new TravelFinanceService(
    db as never,
    files as never,
    google as never,
    {} as never,
  );
  return { db, service, google, files };
}
it('saves a booking and its persistent sync job without calling Google', async () => {
  const { db, service, google } = fixture();
  const b = await service.saveBooking(details, user);
  expect(b.id).toBe('b');
  expect(db.calendarSync.upsert).toHaveBeenCalledWith(
    expect.objectContaining({ create: expect.objectContaining({ bookingId: 'b', revision: 1 }) }),
  );
  expect(google.retry).not.toHaveBeenCalled();
});
it('updates one existing visit instead of inserting another booking', async () => {
  const f = fixture();
  f.db.travelBooking.findUnique.mockResolvedValue({ id: 'b', revision: 2, status: 'DRAFT' });
  await f.service.saveBooking({ ...details, revision: 2 }, user);
  expect(f.db.travelBooking.create).not.toHaveBeenCalled();
  expect(f.db.travelBooking.update).toHaveBeenCalled();
});
it('rejects a stale booking edit without overwriting current travel details', async () => {
  const f = fixture();
  f.db.travelBooking.findUnique.mockResolvedValue({ id: 'b', revision: 2 });
  await expect(f.service.saveBooking({ ...details, revision: 1 }, user)).rejects.toBeInstanceOf(
    ConflictException,
  );
  expect(f.db.travelBooking.update).not.toHaveBeenCalled();
});
it('rejects a patient ID that is not the converted patient of that deal', async () => {
  const f = fixture();
  await expect(
    f.service.saveBooking({ ...details, patientId: ids.item }, user),
  ).rejects.toBeInstanceOf(NotFoundException);
});
it('applies assignment permissions when looking up the existing case', async () => {
  const f = fixture();
  await f.service.saveBooking(details, user);
  expect(f.db.lead.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({ where: expect.objectContaining({ assignedToId: ids.user }) }),
  );
});
it('never returns protected catalog costs to sales staff', async () => {
  const f = fixture();
  f.db.costCatalogVersion.findMany.mockResolvedValue([
    {
      key: 'implant',
      version: 1,
      active: true,
      details: { name: 'Implant', sellingPrice: '300', cost: '80', reason: 'Supplier quote' },
    },
  ]);
  expect((await f.service.catalog(user))[0].details).toEqual({
    name: 'Implant',
    sellingPrice: '300',
  });
});
it('blocks sales staff from writing internal costs or compensation', async () => {
  const f = fixture();
  await expect(f.service.saveCosts({}, user)).rejects.toBeInstanceOf(ForbiddenException);
  await expect(f.service.rule({}, user)).rejects.toBeInstanceOf(ForbiddenException);
});
it('freezes the selected catalog version and audits exceptions', async () => {
  const f = fixture();
  f.db.costCatalogVersion.findUnique.mockResolvedValue({
    id: ids.item,
    active: true,
    version: 1,
    effectiveAt: new Date('2026-01-01'),
    details: {
      name: 'Implant',
      category: 'IMPLANT',
      currency: 'EUR',
      sellingPrice: '300',
      cost: '80',
      unit: 'implant',
      provider: 'Lab',
    },
  });
  const result = await f.service.saveCosts(
    {
      ...details,
      state: 'CONFIRMED',
      mode: 'ITEMIZED',
      currency: 'EUR',
      reportMonth: '2026-10',
      packagePrice: null,
      commission: '0',
      exchangeRates: [],
      lines: [
        {
          catalogId: ids.item,
          quantity: '2',
          included: false,
          exception: { sellingPrice: '250', cost: '75', reason: 'Approved promotion' },
        },
      ],
      reason: 'Confirmed agreement',
    },
    manager,
  );
  expect((result.details as { totals: { revenue: string } }).totals.revenue).toBe('500.00');
  expect(f.db.financialChange.create).toHaveBeenCalled();
  expect(f.db.costCatalogVersion.findUnique).toHaveBeenCalledWith({ where: { id: ids.item } });
});
it('records monthly salary once via a unique user/month key, separately from cases', async () => {
  const f = fixture();
  f.db.compensationRule.findMany.mockResolvedValue([
    {
      id: 'rule',
      staffId: ids.user,
      version: 1,
      effectiveAt: new Date('2026-01-01'),
      details: { salary: '1000', currency: 'EUR', salaryAccrual: 'MONTH_START' },
    },
  ]);
  await f.service.salary('2026-10', manager);
  await f.service.salary('2026-10', manager);
  expect(f.db.businessExpense.upsert).toHaveBeenCalledTimes(2);
  expect(f.db.businessExpense.upsert.mock.calls[0][0]).toEqual(
    f.db.businessExpense.upsert.mock.calls[1][0],
  );
  expect(f.db.businessExpense.upsert.mock.calls[0][0].update).toEqual({});
  expect(f.db.caseCostSnapshot.create).not.toHaveBeenCalled();
});
it('does not silently accept missing compensation eligibility', async () => {
  const f = fixture();
  await expect(
    f.service.rule({ staffId: ids.user, currency: 'EUR', salary: '1000' }, manager),
  ).rejects.toBeInstanceOf(BadRequestException);
});
