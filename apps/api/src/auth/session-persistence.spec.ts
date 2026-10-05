import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { TwoFactorService } from './two-factor.service';

describe('session persistence across devices', () => {
  let service: AuthService;
  let sessions: any[];
  let prisma: any;
  const response = { cookie: jest.fn(), clearCookie: jest.fn() } as any;
  const jwt = new JwtService();
  const user = { id: 'fixture-user', email: 'fixture@example.test', role: 'SUPER_ADMIN', isActive: true, failedLoginAttempts: 0, lockedUntil: null, twoFactorEnabledAt: null, passwordHash: '' };
  const config = new ConfigService({ jwt: { accessSecret: 'fixture-access-secret-for-unit-tests-only', accessExpiresIn: '15m', refreshSecret: 'fixture-refresh-secret-for-unit-tests-only', refreshExpiresIn: '7d' }, nodeEnv: 'test' });

  beforeAll(async () => { user.passwordHash = await bcrypt.hash('fixture-password', 10); });
  beforeEach(() => {
    sessions = [];
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      refreshToken: {
        findMany: jest.fn(async ({ where }) => sessions.filter(row => row.userId === where.userId && !row.revokedAt)),
        create: jest.fn(async ({ data }) => { const row = { id: 'session-' + sessions.length, createdAt: new Date(), revokedAt: null, ...data }; sessions.push(row); return row; }),
        updateMany: jest.fn(async ({ where, data }) => {
          let count = 0;
          for (const row of sessions) if ((!where.id || row.id === where.id) && (!where.userId || row.userId === where.userId) && row.revokedAt === null) { Object.assign(row, data); count++; }
          return { count };
        }),
        update: jest.fn(async ({ where, data }) => Object.assign(sessions.find(row => row.id === where.id), data)),
      },
    };
    service = new AuthService(prisma as PrismaService, jwt, config, {} as TwoFactorService);
    jest.clearAllMocks();
  });
  const signIn = async (agent: string) => {
    await service.login({ email: user.email, password: 'fixture-password' }, response, 'fixture-ip', agent);
    return response.cookie.mock.calls.filter((call: unknown[]) => call[0] === 'refresh_token').at(-1)![1] as string;
  };

  it('issues distinct refresh tokens for two logins during the same second', async () => {
    const first = await signIn('device-a'); const second = await signIn('device-b');
    expect(first).not.toBe(second);
    expect(sessions.every(row => row.tokenHash.startsWith('sha256:'))).toBe(true);
    const decoded = jwt.decode(first) as { jti: string };
    expect(decoded.jti).toBeTruthy();
  });

  it('refreshes the older device without revoking the newer device', async () => {
    const first = await signIn('device-a'); const second = await signIn('device-b');
    const result = await service.refresh(user.id, first, response);
    expect(result.accessToken).toBeTruthy();
    expect(sessions[0].revokedAt).toBeInstanceOf(Date);
    expect(sessions[1].revokedAt).toBeNull();
    const listed = await service.ownSessions(user.id, second);
    expect(listed.find(row => row.id === sessions[1].id)?.current).toBe(true);
    expect(sessions[2].userAgent).toBe('device-a');
    expect(sessions[0].replacedByTokenHash).toBe(sessions[2].tokenHash);
  });

  it('logout ends only the browser that requested it', async () => {
    const first = await signIn('device-a'); await signIn('device-b');
    await service.logout(user.id, first, response);
    expect(sessions[0].revokedAt).toBeInstanceOf(Date);
    expect(sessions[1].revokedAt).toBeNull();
    expect(response.clearCookie).toHaveBeenCalledWith('refresh_token', expect.anything());
  });

  it('matches the whole JWT instead of accepting a changed suffix after bcrypt\'s 72-byte limit', async () => {
    const raw = await signIn('device-a');
    const digest = createHash('sha256').update(raw + 'different-suffix').digest('hex');
    expect(await bcrypt.compare(digest, sessions[0].tokenHash.slice(7))).toBe(false);
    await expect(service.refresh(user.id, raw + 'different-suffix', response)).rejects.toThrow('reuse detected');
  });

  it('supports an existing session hash when it first rotates after deployment', async () => {
    const raw = 'fixture-existing-session';
    sessions.push({ id: 'legacy', userId: user.id, tokenHash: await bcrypt.hash(raw, 10), revokedAt: null });
    const result = await service.refresh(user.id, raw, response);
    expect(result.accessToken).toBeTruthy();
    expect(sessions.at(-1).tokenHash).toMatch(/^sha256:/);
  });
});
