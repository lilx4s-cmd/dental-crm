import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '@dental-crm/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { TWO_FACTOR_PURPOSE } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret'),
    });
  }

  async validate(payload: JwtPayload & { purpose?: string }): Promise<JwtPayload> {
    // A 2FA challenge token is signed with the same secret, so without this check it would be
    // accepted here as a perfectly valid access token — letting anyone who knows a password skip
    // the second factor entirely and making 2FA decorative. It grants nothing but the right to
    // present a code.
    if (payload.purpose === TWO_FACTOR_PURPOSE) {
      throw new UnauthorizedException('Finish signing in with your authentication code.');
    }
    // Older tokens upgrade through the existing refresh flow. They cannot evade session revocation.
    if (!payload.sid || typeof payload.sid !== 'string') throw new UnauthorizedException('Refresh your session to continue');

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, include: { accessProfile: true } });
    if (!user || !user.isActive) throw new UnauthorizedException('User not found or inactive');
    const session = await this.prisma.refreshToken.findFirst({ where: { id: payload.sid, userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } });
    if (!session) throw new UnauthorizedException('Session has ended');
    return { sub: user.id, email: user.email, role: user.role, sid: payload.sid, permissions: user.accessProfile?.permissions as Record<string, boolean> | undefined, accessProfileName: user.accessProfile?.name };
  }
}
