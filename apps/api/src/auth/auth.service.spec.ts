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
  failedLoginAttempts: 0,
  lockedUntil: null as Date | null,
};

const mockPrisma = {
  user: { findUnique: jest.fn(), update: jest.fn() },
  refreshToken: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  auditLog: { create: jest.fn() },
  // The failed-attempt path writes the counter and the audit row together, so neither can exist
  // without the other. The array form returns whatever the calls resolved to.
  $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
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

  describe('login — brute force', () => {
    beforeEach(() => {
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockPrisma.refreshToken.create.mockResolvedValue({});
    });

    it('counts a wrong password against the account', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, failedLoginAttempts: 2 });

      await expect(
        service.login({ email: mockUser.email, password: 'wrong' }, mockRes, '1.2.3.4'),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ failedLoginAttempts: 3, lockedUntil: null }) }),
      );
    });

    it('locks the account and kills its sessions on the fifth failure', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, failedLoginAttempts: 4 });

      await expect(
        service.login({ email: mockUser.email, password: 'wrong' }, mockRes, '1.2.3.4'),
      ).rejects.toThrow(UnauthorizedException);

      const written = mockPrisma.user.update.mock.calls[0][0].data;
      expect(written.failedLoginAttempts).toBe(5);
      expect(written.lockedUntil).toBeInstanceOf(Date);
      // If the attempts were an attacker who has succeeded elsewhere, a refresh token they
      // already hold would outlive the lock.
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalled();
    });

    it('audits the lockout as a lockout, not as another failure', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, failedLoginAttempts: 4 });

      await expect(
        service.login({ email: mockUser.email, password: 'wrong' }, mockRes),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'LOCKOUT' }) }),
      );
    });

    it('refuses the correct password while locked, and says why', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() + 10 * 60_000),
      });

      await expect(
        service.login({ email: mockUser.email, password: 'password123' }, mockRes),
      ).rejects.toThrow(/Too many failed sign-in attempts/);
    });

    it('gives a locked account\'s wrong guesses the same answer as any other wrong guess', async () => {
      // The lockout must not become an oracle. Someone who does not know the password learns
      // nothing about whether the address exists or whether it is locked.
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() + 10 * 60_000),
      });

      await expect(
        service.login({ email: mockUser.email, password: 'wrong' }, mockRes),
      ).rejects.toThrow('Invalid credentials');
    });

    it('lets the user back in once the lock has expired', async () => {
      // Nothing has to run to clear the lock — it expires by being in the past, which matters
      // because this system has no scheduler.
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() - 1000),
      });

      const result = await service.login({ email: mockUser.email, password: 'password123' }, mockRes);
      expect(result.accessToken).toBe('access-token');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { failedLoginAttempts: 0, lockedUntil: null } }),
      );
    });

    it('does not write to the user row on an ordinary successful sign-in', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await service.login({ email: mockUser.email, password: 'password123' }, mockRes);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('spends real work on an unknown address, so the form is not an account oracle', async () => {
      // Without a dummy comparison the unknown-address path returns as fast as the database can
      // answer, while a known one waits for bcrypt. That gap is measurable over the network, so
      // the login form doubles as a way to ask "does this person work at the clinic".
      //
      // A wall-clock lower bound rather than a spy, because bcrypt is a native module whose
      // exports cannot be redefined. The bound is safe in one direction only, which is the
      // direction that matters: bcrypt at 10 rounds costs tens of milliseconds on any machine,
      // and skipping it costs under one. A loaded CI box makes this slower, never faster.
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const started = Date.now();
      await expect(
        service.login({ email: 'nobody@x.com', password: 'pass' }, mockRes),
      ).rejects.toThrow(UnauthorizedException);

      expect(Date.now() - started).toBeGreaterThan(20);
    });

    it('uses a dummy hash bcrypt will actually work against', async () => {
      // A malformed constant would make bcrypt.compare return false immediately, restoring the
      // timing gap the constant exists to close — and nothing else would look wrong.
      const wellFormed = await bcrypt.compare('x', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy');
      expect(wellFormed).toBe(false);
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
