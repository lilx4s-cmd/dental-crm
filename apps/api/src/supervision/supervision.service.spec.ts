import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SupervisionService } from './supervision.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '@dental-crm/shared';
const owner: JwtPayload = { sub: 'owner', email: 'owner@test.com', role: 'SUPER_ADMIN' };
const staff: JwtPayload = { sub: 'staff', email: 'staff@test.com', role: 'SALES_CONSULTANT' };
const supervisor: JwtPayload = {
  sub: 'reviewer',
  email: 'r@test.com',
  role: 'SALES_CONSULTANT',
  permissions: { 'leads.review': true, 'leads.all': false },
};
function setup() {
  const lead = { id: 'lead', assignedToId: 'staff', supervisorId: 'reviewer' };
  const tx = {
    leadReview: {
      create: jest.fn().mockResolvedValue({ id: 'review' }),
      update: jest.fn().mockResolvedValue({ id: 'review' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    leadTask: { create: jest.fn().mockResolvedValue({ id: 'task' }), updateMany: jest.fn() },
    leadActivity: { create: jest.fn() },
  };
  const prisma = {
    lead: { findFirst: jest.fn().mockResolvedValue(lead) },
    leadReview: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'review', leadId: 'lead', taskId: 'task', status: 'OPEN', lead }),
    },
    $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
  };
  return { service: new SupervisionService(prisma as unknown as PrismaService), prisma, tx };
}
describe('Lead correction workflow', () => {
  it('creates a dated task for the salesperson in the same transaction as the flagged issue', async () => {
    const { service, tx } = setup();
    await service.flag(
      { leadId: 'lead', note: 'Contact patient and record the next follow-up' },
      owner,
    );
    expect(tx.leadTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assignedToId: 'staff',
          createdById: 'owner',
          dueDate: expect.any(Date),
        }),
      }),
    );
    expect(tx.leadReview.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { taskId: 'task' } }),
    );
  });
  it('refuses a regular salesperson creating supervisor issues', async () => {
    const { service, prisma } = setup();
    await expect(service.flag({ leadId: 'lead', note: 'Needs correction' }, staff)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('limits a delegated supervisor to the leads they supervise', async () => {
    const { service, prisma } = setup();
    prisma.lead.findFirst.mockResolvedValue({
      id: 'lead',
      assignedToId: 'staff',
      supervisorId: 'other',
    });
    await expect(
      service.flag({ leadId: 'lead', note: 'Needs correction' }, supervisor),
    ).rejects.toThrow(ForbiddenException);
  });
  it('allows the assigned salesperson to submit but not close a correction', async () => {
    const { service, tx } = setup();
    await service.submit('review', 'I contacted the patient and set a follow-up', staff);
    expect(tx.leadReview.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'READY', submittedById: 'staff' }),
      }),
    );
    await expect(
      service.decide('review', { status: 'RESOLVED', note: 'Everything fixed' }, staff),
    ).rejects.toThrow(ForbiddenException);
  });
  it('rejects another salesperson submitting a correction', async () => {
    const { service } = setup();
    await expect(
      service.submit('review', 'Claim it is fixed', { ...staff, sub: 'other' }),
    ).rejects.toThrow(NotFoundException);
  });
  it('requires a submitted correction before supervisor approval', async () => {
    const { service } = setup();
    await expect(
      service.decide('review', { status: 'RESOLVED', note: 'Approved' }, owner),
    ).rejects.toThrow(BadRequestException);
  });
  it('closes the related follow-up only after approval', async () => {
    const { service, prisma, tx } = setup();
    prisma.leadReview.findUnique.mockResolvedValue({
      id: 'review',
      leadId: 'lead',
      taskId: 'task',
      status: 'READY',
      lead: { assignedToId: 'staff' },
    });
    await service.decide(
      'review',
      { status: 'RESOLVED', note: 'Verified the patient was contacted' },
      supervisor,
    );
    expect(tx.leadTask.updateMany).toHaveBeenCalledWith({
      where: { id: 'task' },
      data: { completedAt: expect.any(Date) },
    });
  });
});
