import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Role } from '@dental-crm/shared';
import { DashboardService } from './dashboard.service';
import { LeadsService } from '../leads/leads.service';
import { LeadsQueryDto } from '../leads/dto/leads-query.dto';

describe('dashboard lead drill-down', () => {
  const owner = { sub: 'example-owner', email: 'owner@test.invalid', role: Role.SUPER_ADMIN };
  const staff = { sub: 'example-staff', email: 'staff@test.invalid', role: Role.SALES_CONSULTANT };
  let prisma: { lead: { count: jest.Mock; groupBy: jest.Mock; aggregate: jest.Mock; findMany: jest.Mock }; patient: { count: jest.Mock }; appointment: { count: jest.Mock }; $transaction: jest.Mock };
  let dashboard: DashboardService;
  let leads: LeadsService;
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-05T12:00:00Z'));
    prisma = {
      lead: { count: jest.fn().mockResolvedValue(3), groupBy: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _sum: {} }), findMany: jest.fn().mockResolvedValue([]) },
      patient: { count: jest.fn().mockResolvedValue(0) }, appointment: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn(async callback => callback(prisma)),
    };
    dashboard = new DashboardService(prisma as never);
    leads = new LeadsService(prisma as never, {} as never);
  });
  afterEach(() => jest.useRealTimers());

  it('uses the exact dashboard date window on the board, including today’s closed leads', async () => {
    const stats = await dashboard.getStats();
    const query = plainToInstance(LeadsQueryDto, { createdFrom: stats.todayStart, createdBefore: stats.todayEnd, status: 'ALL' });
    expect(await validate(query)).toEqual([]);
    const groups = await leads.findAllByStage(query, owner);
    const countWhere = prisma.lead.count.mock.calls[0][0].where;
    const boardWhere = prisma.lead.findMany.mock.calls[0][0].where;
    expect(boardWhere.createdAt).toEqual(countWhere.createdAt);
    expect(boardWhere.mergedIntoId).toBeNull();
    expect(boardWhere.status).toBeUndefined();
    expect(countWhere.createdAt.lt.getTime() - countWhere.createdAt.gte.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(groups.length).toBeGreaterThan(1); // Empty columns stay available for moving a deal.
  });

  it('retains staff access scope even when all outcomes and a date window are requested', async () => {
    await leads.findAllByStage(plainToInstance(LeadsQueryDto, { status: 'ALL', createdFrom: '2026-10-05T00:00:00Z', createdBefore: '2026-10-06T00:00:00Z', assignedToId: 'someone-else' }), staff);
    expect(prisma.lead.findMany.mock.calls[0][0].where.assignedToId).toBe(staff.sub);
  });

  it('filters stage links while retaining the board columns', async () => {
    await leads.findAllByStage(plainToInstance(LeadsQueryDto, { stage: 'NEW_DEAL' }), owner);
    expect(prisma.lead.findMany.mock.calls[0][0].where).toMatchObject({ stage: 'NEW_DEAL', status: 'ACTIVE', mergedIntoId: null });
  });

  it('shows won outcomes when the conversion card is opened', async () => {
    await leads.findAllByStage(plainToInstance(LeadsQueryDto, { status: 'WON' }), owner);
    expect(prisma.lead.findMany.mock.calls[0][0].where.status).toBe('WON');
  });

  it('rejects malformed dates and statuses at the request boundary', async () => {
    const errors = await validate(plainToInstance(LeadsQueryDto, { createdFrom: 'yesterday', createdBefore: 'invalid', status: 'unknown' }));
    expect(errors.map(error => error.property)).toEqual(expect.arrayContaining(['createdFrom', 'createdBefore', 'status']));
  });
});
