import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';
const payload = {
  sub: 'staff',
  email: 'old@test.com',
  role: 'SUPER_ADMIN' as const,
  permissions: { 'leads.all': true },
};
describe('Current access on every request', () => {
  it('uses database role and profile instead of stale token privileges', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValue({
        id: 'staff',
        email: 'staff@test.com',
        role: 'SALES_CONSULTANT',
        isActive: true,
        accessProfile: {
          name: 'Restricted salesperson',
          permissions: { 'leads.all': false, 'leads.read': true },
        },
      });
    const strategy = new JwtStrategy(
      { get: () => 'test-only-signing-secret' } as unknown as ConfigService,
      { user: { findUnique } } as unknown as PrismaService,
    );
    expect(await strategy.validate(payload)).toMatchObject({
      role: 'SALES_CONSULTANT',
      permissions: { 'leads.all': false },
      accessProfileName: 'Restricted salesperson',
    });
    findUnique.mockResolvedValue({
      id: 'staff',
      email: 'staff@test.com',
      role: 'SALES_CONSULTANT',
      isActive: true,
      accessProfile: { name: 'Revoked', permissions: { 'leads.read': false } },
    });
    expect((await strategy.validate(payload)).permissions).toEqual({ 'leads.read': false });
  });
});
