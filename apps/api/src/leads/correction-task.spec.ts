import { BadRequestException } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { PrismaService } from '../prisma/prisma.service';
import { TagsService } from '../tags/tags.service';
const user = { sub: 'staff', email: 's@test.com', role: 'SALES_CONSULTANT' as const };
describe('Supervisor correction task protection', () => {
  it('cannot be ticked off or deleted outside the review workflow', async () => {
    const prisma = {
      leadTask: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            id: 'task',
            leadId: 'lead',
            review: { id: 'review', status: 'OPEN' },
          }),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    const service = new LeadsService(prisma as unknown as PrismaService, {} as TagsService);
    jest
      .spyOn(service, 'findOne')
      .mockResolvedValue({ id: 'lead', assignedTo: { id: 'staff' } } as never);
    await expect(service.updateTask('task', { completed: true }, user)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.removeTask('task', user)).rejects.toThrow(BadRequestException);
    expect(prisma.leadTask.update).not.toHaveBeenCalled();
    expect(prisma.leadTask.delete).not.toHaveBeenCalled();
  });
});
