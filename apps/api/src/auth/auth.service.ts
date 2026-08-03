import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import {
  JwtPayload,
  AuthTokens,
  afterFailedAttempt,
  afterSuccessfulLogin,
  isLocked,
  minutesUntilUnlock,
} from '@dental-crm/shared';

const REFRESH_TOKEN_COOKIE = 'refresh_token';
const BCRYPT_ROUNDS = 10;

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
  ) {}

  async login(dto: LoginDto, res: Response, ip?: string, userAgent?: string): Promise<AuthTokens> {
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

    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.signAccessToken(payload);
    const refreshToken = await this.createRefreshToken(user.id, ip, userAgent);

    this.setRefreshCookie(res, refreshToken);

    await this.prisma.auditLog.create({
      data: { userId: user.id, action: 'LOGIN', entityType: 'User', entityId: user.id, ipAddress: ip, userAgent },
    });

    return { accessToken };
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
    const tokenHash = await bcrypt.hash(rawToken, BCRYPT_ROUNDS);

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

    this.setRefreshCookie(res, newRawToken);
    return { accessToken };
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

    res.clearCookie(REFRESH_TOKEN_COOKIE, this.cookieOptions());

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

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_TOKEN_COOKIE, token, this.cookieOptions());
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
