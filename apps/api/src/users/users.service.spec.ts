import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    const dto = { email: 'new@clinic.com', password: 'Password1!', firstName: 'New', lastName: 'User', role: 'RECEPTION' as const };

    it('creates a user when email is unique', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'u1', ...dto });
      const result = await service.create(dto);
      expect(mockPrisma.user.create).toHaveBeenCalled();
      expect(result).toHaveProperty('id');
    });

    it('throws ConflictException when email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });
  });
});

// Access control. These decide whether somebody still has access after an admin has taken it
// away, so they are pinned rather than left for a reviewer to notice.
describe('UsersService access control', () => {
  let service: UsersService;
  let userUpdate: jest.Mock;
  let tokenUpdateMany: jest.Mock;

  const EXISTING = { id: 'user-1', email: 'a@b.c', isActive: true };

  beforeEach(async () => {
    userUpdate = jest.fn().mockResolvedValue(EXISTING);
    tokenUpdateMany = jest.fn().mockReturnValue({ count: 3 });

    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(EXISTING), update: userUpdate },
      refreshToken: { updateMany: tokenUpdateMany, count: jest.fn().mockResolvedValue(2) },
      // The service passes an array of operations; resolve them the way a transaction would.
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<UsersService>(UsersService);
  });

  it('revokes every live refresh token when signing a user out', async () => {
    const result = await service.revokeSessions('user-1');

    expect(tokenUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(result.revoked).toBe(3);
  });

  it('ends existing sessions when an admin resets a password', async () => {
    // A reset that leaves someone logged in has not taken access away, which is usually the point.
    await service.adminResetPassword('user-1', 'a-new-password');
    expect(tokenUpdateMany).toHaveBeenCalled();
  });

  it('stores the new password hashed, never in the clear', async () => {
    await service.adminResetPassword('user-1', 'a-new-password');

    const stored = userUpdate.mock.calls[0][0].data.passwordHash;
    expect(stored).not.toBe('a-new-password');
    expect(await bcrypt.compare('a-new-password', stored)).toBe(true);
  });

  it('revokes sessions when deactivating, so reactivating cannot restore them', async () => {
    await service.deactivate('user-1', 'admin-9');

    expect(userUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { isActive: false } }));
    expect(tokenUpdateMany).toHaveBeenCalled();
  });

  it('refuses to let an admin deactivate their own account', async () => {
    // jwt.strategy rejects inactive users on the very next request — including the one that would
    // undo it — so this would be unrecoverable without database access.
    await expect(service.deactivate('user-1', 'user-1')).rejects.toThrow();
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('reactivates without silently restoring old sessions', async () => {
    await service.activate('user-1');

    expect(userUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { isActive: true } }));
    expect(tokenUpdateMany).not.toHaveBeenCalled();
  });
});
