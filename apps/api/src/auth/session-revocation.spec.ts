import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { isTwoFactorChallenge } from '@dental-crm/shared';

describe('Access tokens follow their actual session', () => {
  const jwt = new JwtService();
  const config = new ConfigService({
    jwt: {
      accessSecret: 'fixture-access-secret-not-a-real-credential',
      accessExpiresIn: '15m',
      refreshSecret: 'fixture-refresh-secret-not-a-real-credential',
      refreshExpiresIn: '7d',
    },
    nodeEnv: 'test',
  });
  const user = {
    id: 'fixture-staff',
    email: 'fixture@example.test',
    role: 'SALES_CONSULTANT',
    isActive: true,
    passwordHash: '',
    failedLoginAttempts: 0,
    lockedUntil: null,
    twoFactorEnabledAt: null,
    accessProfile: null,
  };
  let rows: any[], prisma: any, auth: AuthService, strategy: JwtStrategy;
  const response = { cookie: jest.fn(), clearCookie: jest.fn() } as any;
  beforeAll(async () => {
    user.passwordHash = await bcrypt.hash('fixture-password', 10);
  });
  beforeEach(() => {
    rows = [];
    user.isActive = true;
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      auditLog: { create: jest.fn() },
      refreshToken: {
        create: jest.fn(async ({ data }) => {
          const row = { createdAt: new Date(), revokedAt: null, ...data };
          rows.push(row);
          return row;
        }),
        findFirst: jest.fn(async ({ where }) =>
          rows.find(
            (r) =>
              r.id === where.id &&
              r.userId === where.userId &&
              !r.revokedAt &&
              r.expiresAt > where.expiresAt.gt,
          ),
        ),
        findMany: jest.fn(async ({ where }) =>
          rows.filter((r) => r.userId === where.userId && !r.revokedAt),
        ),
        updateMany: jest.fn(async ({ where, data }) => {
          let count = 0;
          for (const row of rows)
            if (
              (!where.id || row.id === where.id) &&
              (!where.userId || row.userId === where.userId) &&
              !row.revokedAt
            ) {
              Object.assign(row, data);
              count++;
            }
          return { count };
        }),
        update: jest.fn(async ({ where, data }) =>
          Object.assign(
            rows.find((r) => r.id === where.id),
            data,
          ),
        ),
      },
    };
    auth = new AuthService(prisma, jwt, config, {} as never);
    strategy = new JwtStrategy(config, prisma);
    jest.clearAllMocks();
  });
  async function signIn() {
    const result = await auth.login({ email: user.email, password: 'fixture-password' }, response);
    if (isTwoFactorChallenge(result)) throw new Error('Unexpected challenge');
    const payload = await jwt.verifyAsync(result.accessToken, {
      secret: config.get('jwt.accessSecret'),
    });
    return {
      ...result,
      payload,
      refresh: response.cookie.mock.calls
        .filter((c: unknown[]) => c[0] === 'refresh_token')
        .at(-1)![1] as string,
    };
  }
  it('binds each signed access token to a different persisted session', async () => {
    const a = await signIn(),
      b = await signIn();
    expect(a.payload.sid).toBe(rows[0].id);
    expect(b.payload.sid).toBe(rows[1].id);
    expect(a.payload.sid).not.toBe(b.payload.sid);
    expect(await strategy.validate(a.payload)).toMatchObject({ sub: user.id, sid: a.payload.sid });
  });
  it('rejects a revoked session immediately but leaves another device usable', async () => {
    const a = await signIn(),
      b = await signIn();
    await auth.revokeOwnSession(user.id, a.payload.sid);
    await expect(strategy.validate(a.payload)).rejects.toThrow('Session has ended');
    await expect(strategy.validate(b.payload)).resolves.toMatchObject({ sub: user.id });
  });
  it('stops the access token on logout even without a refresh cookie', async () => {
    const a = await signIn();
    await auth.logout(user.id, '', response, a.payload.sid);
    await expect(strategy.validate(a.payload)).rejects.toThrow('Session has ended');
  });
  it('moves rotation to the newly persisted session and refuses the former one', async () => {
    const a = await signIn();
    const renewed = await auth.refresh(user.id, a.refresh, response);
    const payload = await jwt.verifyAsync(renewed.accessToken, {
      secret: config.get('jwt.accessSecret'),
    });
    expect(payload.sid).not.toBe(a.payload.sid);
    await expect(strategy.validate(payload)).resolves.toMatchObject({ sub: user.id });
    await expect(strategy.validate(a.payload)).rejects.toThrow('Session has ended');
  });
  it('upgrades old access tokens only through a valid existing refresh session', async () => {
    const a = await signIn();
    const legacy = await jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      { secret: config.get('jwt.accessSecret'), expiresIn: '15m' },
    );
    await expect(
      strategy.validate(await jwt.verifyAsync(legacy, { secret: config.get('jwt.accessSecret') })),
    ).rejects.toThrow('Refresh your session');
    const renewed = await auth.refresh(user.id, a.refresh, response);
    await expect(
      strategy.validate(
        await jwt.verifyAsync(renewed.accessToken, { secret: config.get('jwt.accessSecret') }),
      ),
    ).resolves.toMatchObject({ sub: user.id });
  });
  it('checks session expiry and session ownership, not just the presence of a session ID', async () => {
    const a = await signIn();
    rows[0].expiresAt = new Date(0);
    await expect(strategy.validate(a.payload)).rejects.toThrow('Session has ended');
    rows[0].expiresAt = new Date(Date.now() + 60000);
    rows[0].userId = 'another-user';
    await expect(strategy.validate(a.payload)).rejects.toThrow('Session has ended');
  });
  it('rejects every access token after an all-device revocation', async () => {
    const a = await signIn(),
      b = await signIn();
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await expect(strategy.validate(a.payload)).rejects.toThrow('Session has ended');
    await expect(strategy.validate(b.payload)).rejects.toThrow('Session has ended');
  });
  it('retains the immediate inactive-user and two-factor boundaries', async () => {
    const a = await signIn();
    user.isActive = false;
    await expect(strategy.validate(a.payload)).rejects.toThrow('inactive');
    await expect(strategy.validate({ ...a.payload, purpose: '2fa-challenge' })).rejects.toThrow(
      'authentication code',
    );
  });
});
