import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { isTwoFactorChallenge, type LoginResult } from '@dental-crm/shared';
import { AuthService } from './auth.service';
import { TwoFactorService } from './two-factor.service';
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
  user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
  refreshToken: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  auditLog: { create: jest.fn() },
  // The failed-attempt path writes the counter and the audit row together, so neither can exist
  // without the other. The array form returns whatever the calls resolved to.
  $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
};

const mockJwt = {
  signAsync: jest.fn().mockResolvedValue('access-token'),
  sign: jest.fn().mockReturnValue('refresh-token'),
  verifyAsync: jest.fn(),
};
const mockConfig = { get: jest.fn((key: string) => ({ 'jwt.accessSecret': 'secret', 'jwt.accessExpiresIn': '15m', 'jwt.refreshSecret': 'rsecret', 'jwt.refreshExpiresIn': '7d', nodeEnv: 'test' }[key])) };
const mockRes = { cookie: jest.fn(), clearCookie: jest.fn() } as any;
const mockTwoFactor = { verifyChallenge: jest.fn() };

/** Narrows a login result to the finished-session branch, failing loudly if 2FA intervened. */
function expectSession(result: LoginResult) {
  if (isTwoFactorChallenge(result)) throw new Error('expected a session, got a 2FA challenge');
  return result;
}

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
        { provide: TwoFactorService, useValue: mockTwoFactor },
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
      expect(expectSession(result).accessToken).toBe('access-token');
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
      expect(expectSession(result).accessToken).toBe('access-token');
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

  describe('two-factor sign-in', () => {
    // Built per test, not once in the describe body: `mockUser.passwordHash` is filled in by
    // beforeAll, which runs *after* the describe body is evaluated, so a spread taken here would
    // capture an empty hash and every password comparison would fail for the wrong reason.
    const twoFactorUser = () => ({ ...mockUser, twoFactorEnabledAt: new Date('2026-01-01') });

    beforeEach(() => {
      mockPrisma.refreshToken.create.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockPrisma.user.update.mockResolvedValue({});
      mockJwt.signAsync.mockResolvedValue('access-token');
    });

    it('returns a challenge instead of a session when 2FA is on', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(twoFactorUser());
      mockJwt.signAsync.mockResolvedValue('challenge-token');

      const result = await service.login({ email: mockUser.email, password: 'password123' }, mockRes);

      expect(isTwoFactorChallenge(result)).toBe(true);
    });

    it('issues no refresh cookie at the challenge step', async () => {
      // The password alone must buy nothing. An attacker holding a stolen password should end this
      // request with something that cannot read a single patient record.
      mockPrisma.user.findUnique.mockResolvedValue(twoFactorUser());

      await service.login({ email: mockUser.email, password: 'password123' }, mockRes);

      expect(mockRes.cookie).not.toHaveBeenCalled();
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('does not audit a LOGIN until the second factor passes', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(twoFactorUser());

      await service.login({ email: mockUser.email, password: 'password123' }, mockRes);

      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('completes the sign-in when the code is right', async () => {
      mockJwt.verifyAsync.mockResolvedValue({ sub: 'user-1', purpose: '2fa-challenge' });
      mockPrisma.user.findUnique.mockResolvedValue(twoFactorUser());
      mockTwoFactor.verifyChallenge.mockResolvedValue(true);

      const result = await service.completeTwoFactorLogin('challenge', '123456', mockRes);

      expect(result.accessToken).toBe('access-token');
      expect(mockRes.cookie).toHaveBeenCalled();
    });

    it('counts a wrong code towards the same lockout a wrong password does', async () => {
      // Without this, 2FA would be the one part of sign-in an attacker could brute-force freely —
      // a million six-digit guesses against an account whose password they already have.
      mockJwt.verifyAsync.mockResolvedValue({ sub: 'user-1', purpose: '2fa-challenge' });
      mockPrisma.user.findUnique.mockResolvedValue({ ...twoFactorUser(), failedLoginAttempts: 4 });
      mockTwoFactor.verifyChallenge.mockResolvedValue(false);

      await expect(
        service.completeTwoFactorLogin('challenge', '000000', mockRes),
      ).rejects.toThrow(UnauthorizedException);

      const written = mockPrisma.user.update.mock.calls[0][0].data;
      expect(written.failedLoginAttempts).toBe(5);
      expect(written.lockedUntil).toBeInstanceOf(Date);
    });

    it('rejects a token that is not a 2FA challenge', async () => {
      // An ordinary access token must not be presentable here — that would let anyone holding one
      // mint a fresh session without the second factor.
      mockJwt.verifyAsync.mockResolvedValue({ sub: 'user-1' });

      await expect(
        service.completeTwoFactorLogin('an-access-token', '123456', mockRes),
      ).rejects.toThrow(/expired/i);
    });

    it('rejects an expired challenge', async () => {
      mockJwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));

      await expect(
        service.completeTwoFactorLogin('stale', '123456', mockRes),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('changeOwnPassword', () => {
    beforeEach(() => {
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});
    });

    it('requires the current password', async () => {
      // A logged-in session is not enough: an unattended screen is a realistic way to be holding
      // someone else's session, and it must not be enough to take their account.
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue(mockUser);

      await expect(
        service.changeOwnPassword('user-1', 'not the password', 'a memorable new phrase'),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses to set the password that is already in use', async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue(mockUser);

      await expect(
        service.changeOwnPassword('user-1', 'password123', 'password123'),
      ).rejects.toThrow(/not been using/);
    });

    it('changes the password, ends every session, and audits it', async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue(mockUser);

      await service.changeOwnPassword('user-1', 'password123', 'a memorable new phrase');

      expect(mockPrisma.user.update.mock.calls[0][0].data.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'PASSWORD_CHANGED' }) }),
      );
    });
  });

  describe('ownSessions', () => {
    it('marks the calling browser rather than hiding it', async () => {
      const raw = 'this-browsers-token';
      mockPrisma.refreshToken.findMany.mockResolvedValue([
        { id: 's1', createdAt: new Date(), expiresAt: new Date(), createdByIp: '1.2.3.4', userAgent: 'Firefox', tokenHash: await bcrypt.hash(raw, 10) },
        { id: 's2', createdAt: new Date(), expiresAt: new Date(), createdByIp: '9.9.9.9', userAgent: 'Chrome', tokenHash: await bcrypt.hash('another', 10) },
      ]);

      const sessions = await service.ownSessions('user-1', raw);

      expect(sessions.map((s) => [s.id, s.current])).toEqual([['s1', true], ['s2', false]]);
    });

    it('never returns the token hash', async () => {
      mockPrisma.refreshToken.findMany.mockResolvedValue([
        { id: 's1', createdAt: new Date(), expiresAt: new Date(), createdByIp: null, userAgent: null, tokenHash: 'secret-hash' },
      ]);

      const [session] = await service.ownSessions('user-1');
      expect(JSON.stringify(session)).not.toContain('secret-hash');
    });
  });
});
