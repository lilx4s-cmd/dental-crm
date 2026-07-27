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
import { JwtPayload, AuthTokens } from '@dental-crm/shared';

const REFRESH_TOKEN_COOKIE = 'refresh_token';
const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async login(dto: LoginDto, res: Response, ip?: string, userAgent?: string): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch) throw new UnauthorizedException('Invalid credentials');

    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.signAccessToken(payload);
    const refreshToken = await this.createRefreshToken(user.id, ip, userAgent);

    this.setRefreshCookie(res, refreshToken);

    await this.prisma.auditLog.create({
      data: { userId: user.id, action: 'LOGIN', entityType: 'User', entityId: user.id, ipAddress: ip, userAgent },
    });

    return { accessToken };
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
