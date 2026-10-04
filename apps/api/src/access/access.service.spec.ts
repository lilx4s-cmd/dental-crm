import { BadRequestException } from '@nestjs/common';
import { AccessService } from './access.service';
import { PrismaService } from '../prisma/prisma.service';
const actor = { sub: 'owner', email: 'owner@test.com', role: 'SUPER_ADMIN' as const };
describe('Editable access profiles', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    accessProfile: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new AccessService(prisma as unknown as PrismaService);
  beforeEach(() => jest.clearAllMocks());
  it('rejects unknown privileges and non-boolean settings', () => {
    expect(() => service.validate({ 'users.admin': true })).toThrow(BadRequestException);
    expect(() => service.validate({ 'leads.read': 'yes' } as never)).toThrow(BadRequestException);
  });
  it('requires read access for edits and complete oversight for team control', () => {
    expect(() => service.validate({ 'leads.write': true })).toThrow(BadRequestException);
    expect(() => service.validate({ 'leads.read': true, 'leads.assign': true })).toThrow(
      BadRequestException,
    );
    expect(() =>
      service.validate({ 'conversations.read': true, 'conversations.supervise': true }),
    ).toThrow(BadRequestException);
  });
  it('accepts a supervisor without granting finance or messaging', () => {
    expect(() =>
      service.validate({
        'leads.read': true,
        'leads.all': true,
        'leads.assign': true,
        'leads.review': true,
        'finance.read': false,
        'conversations.send': false,
      }),
    ).not.toThrow();
  });
  it('cannot lock an owner into a restricted profile', async () => {
    prisma.user.findUnique.mockResolvedValue({ role: 'SUPER_ADMIN', accessProfileId: null });
    await expect(service.assign('owner', 'profile', actor)).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
