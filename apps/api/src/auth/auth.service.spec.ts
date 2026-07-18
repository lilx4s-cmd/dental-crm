import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

const mockUser = {
  id: 'user-1',
  email: 'test@clinic.com',
  passwordHash: '',
  role: 'SUPER_ADMIN' as const,
  isActive: true,
  firstName: 'Test',
  lastName: 'User',
};

const mockPrisma = {
  user: { findUnique: jest.fn() },
  refreshToken: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  auditLog: { create: jest.fn() },
};

const mockJwt = { signAsync: jest.fn().mockResolvedValue('access-token'), sign: jest.fn().mockReturnValue('refresh-token') };
const mockConfig = { get: jest.fn((key: string) => ({ 'jwt.accessSecret': 'secret', 'jwt.accessExpiresIn': '15m', 'jwt.refreshSecret': 'rsecret', 'jwt.refreshExpiresIn': '7d', nodeEnv: 'test' }[key])) };
const mockRes = { cookie: jest.fn(), clearCookie: jest.fn() } as any;

describe('AuthService', () => {
  let service: AuthService;

  beforeAll(async () => {
    mockUser.passwordHash = await bcrypt.hash('password123', 10);
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('returns access token on valid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.refreshToken.create.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.login({ email: mockUser.email, password: 'password123' }, mockRes);
      expect(result.accessToken).toBe('access-token');
    });

    it('throws UnauthorizedException for wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      await expect(
        service.login({ email: mockUser.email, password: 'wrong' }, mockRes),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for unknown email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'nobody@x.com', password: 'pass' }, mockRes),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for inactive user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, isActive: false });
      await expect(
        service.login({ email: mockUser.email, password: 'password123' }, mockRes),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('clears the cookie', async () => {
      mockPrisma.refreshToken.findFirst.mockResolvedValue(null);
      mockPrisma.auditLog.create.mockResolvedValue({});
      await service.logout('user-1', 'token', mockRes);
      expect(mockRes.clearCookie).toHaveBeenCalled();
    });
  });
});
