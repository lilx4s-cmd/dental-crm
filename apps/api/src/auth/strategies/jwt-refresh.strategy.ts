import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { JwtPayload } from '@dental-crm/shared';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => {
          const token = req?.cookies?.['refresh_token'] as string | undefined;
          if (!token) throw new UnauthorizedException('Refresh token not found');
          return token;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.refreshSecret'),
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: JwtPayload): { sub: string; refreshToken: string } {
    const refreshToken = req.cookies?.['refresh_token'] as string;
    if (!refreshToken) throw new UnauthorizedException('Refresh token missing');
    return { sub: payload.sub, refreshToken };
  }
}
