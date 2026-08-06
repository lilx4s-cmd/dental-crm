import { Test } from '@nestjs/testing';
import { Role, type JwtPayload } from '@dental-crm/shared';

import { LeadsService } from './leads.service';
import { PrismaService } from '../prisma/prisma.service';
import { TagsService } from '../tags/tags.service';

const mockPrisma: Record<string, any> = {
  lead: { findMany: jest.fn() },
  leadTask: { findMany: jest.fn() },
};

const admin: JwtPayload = { sub: 'admin-1', email: 'a@clinic.com', role: Role.SUPER_ADMIN };
const sales: JwtPayload = { sub: 'sales-1', email: 's@clinic.com', role: Role.SALES_CONSULTANT };

const DAY = 86_400_000;
const task = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  title: 'Send the warranty certificate',
  dueDate: new Date(Date.now() + DAY),
  assignedTo: null,
  lead: {
    id: 'l1',
    firstName: 'Hajja',
    lastName: 'Zohra',
    phone: null,
    whatsappNumber: null,
    country: null,
    stage: 'DONE',
    status: 'WON',
  },
  ...over,
});

/**
 * My Day showed no tasks at all.
 *
 * Two rules combined to hide every one of them: the page only ever rendered deals the cadence
 * rules flagged, and a deal carrying an open task was deliberately *removed* from that list so the
 * cadence would not talk over the plan. The result was that setting a reminder made a deal vanish
 * from the one screen it should have appeared on more prominently — and a task on a won deal was
 * unreachable entirely, since the whole list filters to ACTIVE.
 */
describe('LeadsService — the task list behind My Day', () => {
  let service: LeadsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        LeadsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TagsService, useValue: { currentOrganizationId: async () => 'org-1' } },
      ],
    }).compile();
    service = moduleRef.get(LeadsService);
    jest.clearAllMocks();
    mockPrisma.lead.findMany.mockResolvedValue([]);
    mockPrisma.leadTask.findMany.mockResolvedValue([]);
  });

  const whereOf = () => mockPrisma.leadTask.findMany.mock.calls[0][0].where;

  it('returns open tasks alongside the cadence lists', async () => {
    mockPrisma.leadTask.findMany.mockResolvedValue([task()]);

    const result = await service.workList(admin);

    expect(result.tasks).toHaveLength(1);
    expect(result.counts.tasks).toBe(1);
  });

  it('includes a task on a won deal', async () => {
    // The single open task in production sat on a closed sale and appeared nowhere. Sending the
    // warranty certificate is due whether or not the deal is won.
    mockPrisma.leadTask.findMany.mockResolvedValue([task()]);

    const result = await service.workList(admin);

    expect(result.tasks[0].lead.status).toBe('WON');
    // No status filter at all on the task query — that is the fix.
    expect(whereOf().lead).toEqual({ mergedIntoId: null });
  });

  it('never returns a completed task', async () => {
    await service.workList(admin);
    expect(whereOf().completedAt).toBeNull();
  });

  it('leaves out tasks on merged duplicates', async () => {
    await service.workList(admin);
    expect(whereOf().lead.mergedIntoId).toBeNull();
  });

  describe('whose list it is', () => {
    it('scopes to the task’s assignee, not the deal’s owner', async () => {
      // A reminder handed to reception on somebody else's deal belongs on reception's list.
      await service.workList(sales);
      expect(whereOf().OR).toContainEqual({ assignedToId: 'sales-1' });
    });

    it('falls back to the deal owner for an unassigned task', async () => {
      // Otherwise a bulk reminder set across a deal with no assignee is silently lost.
      await service.workList(sales);
      expect(whereOf().OR).toContainEqual({
        assignedToId: null,
        lead: { assignedToId: 'sales-1' },
      });
    });

    it('does not scope a super admin', async () => {
      await service.workList(admin);
      expect(whereOf().OR).toBeUndefined();
    });
  });

  describe('what counts as late', () => {
    it('does not call a task due today overdue', async () => {
      // Otherwise every task is red from the moment the day begins, and red stops meaning late.
      const noon = new Date();
      noon.setHours(12, 0, 0, 0);
      mockPrisma.leadTask.findMany.mockResolvedValue([task({ dueDate: noon })]);

      const result = await service.workList(admin);

      expect(result.tasks[0].overdue).toBe(false);
      expect(result.counts.tasksOverdue).toBe(0);
    });

    it('calls yesterday overdue', async () => {
      mockPrisma.leadTask.findMany.mockResolvedValue([task({ dueDate: new Date(Date.now() - DAY) })]);

      const result = await service.workList(admin);

      expect(result.tasks[0].overdue).toBe(true);
      expect(result.counts.tasksOverdue).toBe(1);
    });

    it('does not call tomorrow overdue', async () => {
      mockPrisma.leadTask.findMany.mockResolvedValue([task()]);
      const result = await service.workList(admin);
      expect(result.tasks[0].overdue).toBe(false);
    });

    it('asks for the soonest first', async () => {
      await service.workList(admin);
      expect(mockPrisma.leadTask.findMany.mock.calls[0][0].orderBy).toEqual({ dueDate: 'asc' });
    });

    it('bounds how many it returns', async () => {
      // A morning list, not a task manager.
      await service.workList(admin);
      expect(mockPrisma.leadTask.findMany.mock.calls[0][0].take).toBeLessThanOrEqual(100);
    });
  });
});
