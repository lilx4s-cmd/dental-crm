import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Response } from 'express';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CSRF_COOKIE } from '../common/guards/csrf.guard';
import { TwoFactorService } from './two-factor.service';
import { LoginDto } from './dto/login.dto';
import {
  JwtPayload,
  AuthTokens,
  LoginResult,
  Role,
  afterFailedAttempt,
  afterSuccessfulLogin,
  isLocked,
  minutesUntilUnlock,
} from '@dental-crm/shared';

const REFRESH_TOKEN_COOKIE = 'refresh_token';
const BCRYPT_ROUNDS = 10;

/**
 * Marks a token as proving only the password step of a 2FA sign-in.
 *
 * Checked by JwtStrategy as well as here: without that, a challenge token would be a perfectly
 * valid access token that skipped the second factor entirely, which would make 2FA decorative.
 */
export const TWO_FACTOR_PURPOSE = '2fa-challenge';

/**
 * A real bcrypt hash of a string nobody knows, compared against when the email does not exist.
 *
 * Without it, a request for an unknown address returns as fast as the database can answer, while
 * a known one waits ~80ms for bcrypt. That difference is measurable over the network, so the login
 * form doubles as an oracle for "does this person work at the clinic" — the first thing an attacker
 * wants before spending guesses. Now both paths pay the same cost.
 */
const DUMMY_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private twoFactor: TwoFactorService,
  ) {}

  async login(dto: LoginDto, res: Response, ip?: string, userAgent?: string): Promise<LoginResult> {
    const now = new Date();
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Always run a comparison, even with nothing to compare against — see DUMMY_HASH.
    const passwordMatch = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);

    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');

    if (isLocked(user.lockedUntil, now)) {
      // The lock is only *explained* to someone who proved they are the account holder. An
      // attacker guessing passwords gets the same "Invalid credentials" as always, so the lockout
      // never becomes a way to discover which email addresses are real; the actual owner, who is
      // the one inconvenienced, is told plainly what happened and when they can try again.
      if (passwordMatch) {
        const minutes = minutesUntilUnlock(user.lockedUntil as Date, now);
        throw new UnauthorizedException(
          `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
        );
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!passwordMatch) {
      await this.recordFailedAttempt(user.id, user.failedLoginAttempts, now, ip, userAgent);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.failedLoginAttempts > 0) {
      await this.prisma.user.update({ where: { id: user.id }, data: afterSuccessfulLogin() });
    }

    // The password was right, but on a 2FA account that is only half the answer. No access token
    // and no refresh cookie are issued here — the challenge token proves this step passed and
    // grants nothing else, so an attacker with a stolen password holds something that cannot read
    // a single patient record.
    if (user.twoFactorEnabledAt) {
      return {
        twoFactorRequired: true,
        challengeToken: await this.signChallengeToken(user.id),
      };
    }

    return this.issueSession(user, res, ip, userAgent);
  }

  /**
   * Second step of a 2FA sign-in: the six-digit code, or a recovery code.
   *
   * A failed code counts towards the same lockout a failed password does. Without that, 2FA would
   * be the one part of sign-in an attacker could brute-force freely — a million six-digit guesses
   * against an account whose password they already have.
   */
  async completeTwoFactorLogin(
    challengeToken: string,
    code: string,
    res: Response,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    const userId = await this.verifyChallengeToken(challengeToken);
    const now = new Date();
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');

    if (isLocked(user.lockedUntil, now)) {
      const minutes = minutesUntilUnlock(user.lockedUntil as Date, now);
      throw new UnauthorizedException(
        `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      );
    }

    if (!(await this.twoFactor.verifyChallenge(user.id, code))) {
      await this.recordFailedAttempt(user.id, user.failedLoginAttempts, now, ip, userAgent);
      throw new UnauthorizedException('That code is not right.');
    }

    if (user.failedLoginAttempts > 0) {
      await this.prisma.user.update({ where: { id: user.id }, data: afterSuccessfulLogin() });
    }

    return this.issueSession(user, res, ip, userAgent);
  }

  /** Everything a completed sign-in does, whichever route it arrived by. */
  private async issueSession(
    user: { id: string; email: string; role: Role },
    res: Response,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.signAccessToken(payload);
    const refreshToken = await this.createRefreshToken(user.id, ip, userAgent);

    const csrfToken = this.setRefreshCookie(res, refreshToken);

    await this.prisma.auditLog.create({
      data: { userId: user.id, action: 'LOGIN', entityType: 'User', entityId: user.id, ipAddress: ip, userAgent },
    });

    return { accessToken, csrfToken };
  }

  /**
   * A token that says only "this person's password checked out, a moment ago".
   *
   * Five minutes, and signed with a `purpose` claim so it can never be presented as an access
   * token — the JWT strategy rejects anything carrying it. Long enough to fetch a code from a
   * phone; short enough that one intercepted on a shared machine is dead before it is useful.
   */
  private async signChallengeToken(userId: string): Promise<string> {
    return this.jwtService.signAsync(
      { sub: userId, purpose: TWO_FACTOR_PURPOSE },
      { secret: this.config.get<string>('jwt.accessSecret'), expiresIn: '5m' },
    );
  }

  private async verifyChallengeToken(token: string): Promise<string> {
    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string; purpose?: string }>(token, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
      if (payload.purpose !== TWO_FACTOR_PURPOSE) throw new Error('wrong purpose');
      return payload.sub;
    } catch {
      throw new UnauthorizedException('This sign-in attempt has expired. Start again.');
    }
  }

  /**
   * Changes your own password.
   *
   * Until now only an administrator could rotate a password, so someone who suspected their
   * account was compromised had to find one and explain why — at exactly the moment speed matters.
   *
   * The current password is required. A logged-in session is not enough on its own: an unattended
   * screen is a realistic way to be holding someone else's session, and it should not be enough to
   * take over their account.
   */
  async changeOwnPassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ip?: string,
    userAgent?: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('That is not your current password.');
    }
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw new BadRequestException('Choose a password you have not been using.');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      // Every session goes. Someone changing their password because they think it leaked needs
      // any session that leak created to stop working, and cannot be expected to work out which
      // of the rows in the list is the attacker's.
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.auditLog.create({
        data: {
          userId,
          action: 'PASSWORD_CHANGED',
          entityType: 'User',
          entityId: userId,
          ipAddress: ip,
          userAgent,
        },
      }),
    ]);
  }

  /**
   * Your own live sessions, with enough detail to recognise one that is not yours.
   *
   * `RefreshToken` has stored `createdByIp` and `userAgent` since it was written and nothing ever
   * read them — sessions were only ever counted. A count tells you something is wrong; it does not
   * tell you which one to end.
   */
  async ownSessions(userId: string, currentRawToken?: string) {
    const sessions = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        createdByIp: true,
        userAgent: true,
        tokenHash: true,
      },
    });

    return Promise.all(
      sessions.map(async ({ tokenHash, ...session }) => ({
        ...session,
        // Marked rather than filtered out, so the list is complete and it is still obvious which
        // row belongs to the browser doing the asking.
        current: currentRawToken ? await bcrypt.compare(currentRawToken, tokenHash) : false,
      })),
    );
  }

  /** Ends one of your own sessions. Scoped by userId, so an id from elsewhere matches nothing. */
  async revokeOwnSession(userId: string, sessionId: string): Promise<void> {
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new BadRequestException('That session has already ended.');
  }

  /**
   * Counts a wrong password, locking the account once the threshold is crossed.
   *
   * Both writes are audited. A run of LOGIN_FAILED rows against one account, or the same address
   * across many, is the only evidence of an attempted break-in this system keeps — and until the
   * audit interceptor lands it is the only evidence of anything beyond a login journal.
   */
  private async recordFailedAttempt(
    userId: string,
    currentAttempts: number,
    now: Date,
    ip?: string,
    userAgent?: string,
  ): Promise<void> {
    const next = afterFailedAttempt(currentAttempts, now);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: next }),
      this.prisma.auditLog.create({
        data: {
          userId,
          action: next.lockedUntil ? 'LOCKOUT' : 'LOGIN_FAILED',
          entityType: 'User',
          entityId: userId,
          ipAddress: ip,
          userAgent,
          newValues: { failedLoginAttempts: next.failedLoginAttempts },
        },
      }),
    ]);

    if (next.lockedUntil) {
      // Every session is cut as well as the account being locked. If the attempts were an attacker
      // succeeding elsewhere, a refresh token they already hold would otherwise outlive the lock.
      await this.revokeAllUserTokens(userId);
    }
  }

  async refresh(userId: string, rawToken: string, res: Response): Promise<AuthTokens> {
    // A `const tokenHash = await bcrypt.hash(rawToken, …)` stood here, computed and then never
    // read — the comparison below uses bcrypt.compare against the stored hash instead. It cost a
    // full bcrypt round, about 80ms, on every refresh: once per user per fifteen minutes, for
    // nothing. Lint would have found it years ago; nothing was running lint on this package.
    const stored = await this.prisma.refreshToken.findFirst({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (!stored) {
      await this.revokeAllUserTokens(userId);
      throw new ForbiddenException('Refresh token reuse detected');
    }

    const isValid = await bcrypt.compare(rawToken, stored.tokenHash);
    if (!isValid) {
      await this.revokeAllUserTokens(userId);
      throw new ForbiddenException('Refresh token reuse detected');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new UnauthorizedException('User inactive');

    const newRawToken = await this.createRefreshToken(user.id);
    const newHash = await bcrypt.hash(newRawToken, BCRYPT_ROUNDS);

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedByTokenHash: newHash },
    });

    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.signAccessToken(payload);

    // Rotated with the refresh token, so the client always holds the pair that matches the
    // cookies it now has.
    const csrfToken = this.setRefreshCookie(res, newRawToken);
    return { accessToken, csrfToken };
  }

  async logout(userId: string, rawToken: string, res: Response): Promise<void> {
    const stored = await this.prisma.refreshToken.findFirst({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (stored) {
      const isValid = await bcrypt.compare(rawToken, stored.tokenHash);
      if (isValid) {
        await this.prisma.refreshToken.update({
          where: { id: stored.id },
          data: { revokedAt: new Date() },
        });
      }
    }

    this.clearAuthCookies(res);

    await this.prisma.auditLog.create({
      data: { userId, action: 'LOGOUT', entityType: 'User', entityId: userId },
    });
  }

  private async signAccessToken(payload: JwtPayload): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: this.config.get<string>('jwt.accessExpiresIn'),
    });
  }

  private async createRefreshToken(userId: string, ip?: string, userAgent?: string): Promise<string> {
    const rawToken = this.jwtService.sign(
      { sub: userId },
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: this.config.get<string>('jwt.refreshExpiresIn'),
      },
    );

    const tokenHash = await bcrypt.hash(rawToken, BCRYPT_ROUNDS);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt, createdByIp: ip, userAgent },
    });

    return rawToken;
  }

  private async revokeAllUserTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Sets the refresh cookie and its CSRF partner, and returns the raw CSRF token.
   *
   * The two are issued and rotated together, so a live refresh cookie always has a matching CSRF
   * cookie and neither can outlive the other. The raw value goes back in the response body because
   * the web app cannot read a cookie set on the API's domain — see CsrfGuard.
   */
  private setRefreshCookie(res: Response, token: string): string {
    res.cookie(REFRESH_TOKEN_COOKIE, token, this.cookieOptions());

    const csrfToken = randomBytes(32).toString('base64url');
    // httpOnly, because nothing needs to read this one: the server compares it against the header,
    // and the client gets its copy from the response body instead.
    res.cookie(CSRF_COOKIE, csrfToken, this.cookieOptions());
    return csrfToken;
  }

  private clearAuthCookies(res: Response): void {
    res.clearCookie(REFRESH_TOKEN_COOKIE, this.cookieOptions());
    res.clearCookie(CSRF_COOKIE, this.cookieOptions());
  }

  /**
   * Options for the refresh cookie.
   *
   * SameSite has to differ by environment because the deployment is cross-site: the app is served
   * from Vercel and the API from Render, which are separate registrable domains. A Strict cookie is
   * never attached to a cross-site request, so the browser held a refresh token it would not send —
   * /auth/refresh saw no cookie, answered 401, and every user was signed out the moment their
   * fifteen-minute access token expired. In development both run on localhost, where Strict is
   * correct and None would be refused for lacking Secure.
   *
   * None is only safe here because the cookie is HttpOnly, path-scoped to /api/auth, and the
   * refresh endpoint accepts requests only from the CORS allowlist — a third-party site can cause
   * the cookie to be sent but cannot read the response.
   */
  private cookieOptions() {
    const isProduction = this.config.get<string>('nodeEnv') === 'production';
    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? ('none' as const) : ('strict' as const),
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    };
  }
}
