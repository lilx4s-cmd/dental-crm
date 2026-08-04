import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto';
import {
  ChangePasswordDto,
  DisableTwoFactorDto,
  TwoFactorCodeDto,
  TwoFactorLoginDto,
} from './dto/account-security.dto';
import { PasswordResetService } from './password-reset.service';
import { TwoFactorService } from './two-factor.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtRefreshGuard } from '../common/guards/jwt-refresh.guard';
import { CsrfGuard } from '../common/guards/csrf.guard';
import { JwtPayload } from '@dental-crm/shared';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private passwordReset: PasswordResetService,
    private twoFactor: TwoFactorService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ) {
    const ip = req.ip;
    const userAgent = req.headers['user-agent'];
    return this.authService.login(dto, res, ip, userAgent);
  }

  /**
   * Always 204, whether or not the address belongs to anyone.
   *
   * Answering "no account with that email" would turn this into the account oracle that the
   * login-form timing fix just closed — the same information through a different door.
   */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Send a password reset link, if the address is known' })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    await this.passwordReset.request(dto.email, req.ip);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Set a new password using an emailed reset token' })
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    await this.passwordReset.reset(dto.token, dto.newPassword, req.ip, req.headers['user-agent']);
  }

  // The only cookie-authenticated route in the API, and therefore the only one a browser will
  // authenticate on a forged request. CsrfGuard runs first so an untrusted origin is refused
  // before the refresh token is even looked at.
  @Public()
  @UseGuards(CsrfGuard, JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Refresh access token using HttpOnly cookie' })
  async refresh(
    @Req() req: Request & { user: { sub: string; refreshToken: string } },
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.refresh(req.user.sub, req.user.refreshToken, res);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout and revoke refresh token' })
  async logout(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = (req.cookies?.['refresh_token'] as string) ?? '';
    await this.authService.logout(user.sub, token, res);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user' })
  me(@CurrentUser() user: JwtPayload) {
    return user;
  }

  @Public()
  @Post('login/2fa')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Finish a 2FA sign-in with a code or a recovery code' })
  async loginTwoFactor(
    @Body() dto: TwoFactorLoginDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ) {
    return this.authService.completeTwoFactorLogin(
      dto.challengeToken,
      dto.code,
      res,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change your own password' })
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    await this.authService.changeOwnPassword(
      user.sub,
      dto.currentPassword,
      dto.newPassword,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Your own live sessions, with device and address' })
  sessions(@CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.authService.ownSessions(user.sub, req.cookies?.['refresh_token'] as string | undefined);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'End one of your own sessions' })
  async revokeSession(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.authService.revokeOwnSession(user.sub, id);
  }

  @Get('2fa/status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Whether 2FA is on, and how many recovery codes remain' })
  async twoFactorStatus(@CurrentUser() user: JwtPayload) {
    return {
      enabled: await this.twoFactor.isEnabled(user.sub),
      recoveryCodesRemaining: await this.twoFactor.remainingRecoveryCodes(user.sub),
    };
  }

  /** Generates a secret and QR. Does NOT switch 2FA on — see confirm. */
  @Post('2fa/setup')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Begin 2FA enrolment: returns a QR to scan' })
  setupTwoFactor(@CurrentUser() user: JwtPayload) {
    return this.twoFactor.beginEnrolment(user.sub);
  }

  @Post('2fa/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Prove the authenticator works, turn 2FA on, and get recovery codes' })
  confirmTwoFactor(
    @CurrentUser() user: JwtPayload,
    @Body() dto: TwoFactorCodeDto,
    @Req() req: Request,
  ) {
    return this.twoFactor.confirmEnrolment(user.sub, dto.code, req.ip);
  }

  @Post('2fa/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Turn 2FA off (requires your password)' })
  async disableTwoFactor(
    @CurrentUser() user: JwtPayload,
    @Body() dto: DisableTwoFactorDto,
    @Req() req: Request,
  ) {
    await this.twoFactor.disable(user.sub, dto.currentPassword, req.ip);
  }
}
