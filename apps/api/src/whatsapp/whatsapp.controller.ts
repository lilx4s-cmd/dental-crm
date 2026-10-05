import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Param,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../common/decorators/public.decorator';
import { Permission } from '../common/decorators/permission.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role, JwtPayload } from '@dental-crm/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PATIENT_FACING, MANAGEMENT } from '../common/access-policy';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppWebService } from './whatsapp-web.service';
import { EvolutionService } from './evolution.service';

@ApiTags('whatsapp')
@Controller('whatsapp')
export class WhatsAppController {
  constructor(
    private readonly whatsAppService: WhatsAppService,
    private readonly webService: WhatsAppWebService,
    private readonly evolution: EvolutionService,
  ) {}

  @Get('sessions/me')
  @ApiOperation({ summary: 'QR-ready work account status; first-time accounts can prepare pairing immediately' })
  @Permission('conversations.read')
  @Roles(...PATIENT_FACING)
  ownSession(@CurrentUser() user: JwtPayload) { return this.webService.ownStatus(user); }

  @Post('sessions/me/connect')
  @Permission('conversations.read')
  @Roles(...PATIENT_FACING)
  @HttpCode(HttpStatus.OK)
  connectOwnSession(@CurrentUser() user: JwtPayload) { return this.webService.connectOwn(user); }

  @Post('sessions/me/new-qr')
  @Permission('conversations.read')
  @Roles(...PATIENT_FACING)
  @HttpCode(HttpStatus.OK)
  newOwnSessionQr(@CurrentUser() user: JwtPayload) { return this.webService.newQrOwn(user); }

  @Post('sessions/me/sync-contacts')
  @Permission('conversations.read')
  @Roles(...PATIENT_FACING)
  @HttpCode(HttpStatus.OK)
  syncOwnContacts(@CurrentUser() user: JwtPayload) { return this.webService.syncOwnContacts(user); }

  @Post('sessions/me/logout')
  @Permission('conversations.read')
  @Roles(...PATIENT_FACING)
  @HttpCode(HttpStatus.OK)
  logoutOwnSession(@CurrentUser() user: JwtPayload) { return this.webService.logoutOwn(user); }

  @Get('sessions')
  @Permission('conversations.supervise')
  @Roles(...MANAGEMENT)
  teamSessions() { return this.webService.teamStatus(); }

  @Post('sessions/:ownerId/logout')
  @Permission('conversations.supervise')
  @Roles(...MANAGEMENT)
  @HttpCode(HttpStatus.OK)
  logoutTeamSession(@Param('ownerId') ownerId: string, @CurrentUser() user: JwtPayload) {
    return this.webService.logoutOwn(user, ownerId);
  }

  // ── Self-hosted Evolution API gateway ──

  @Get('evolution/status')
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER)
  @ApiOperation({ summary: 'Evolution instance state, with a pairing QR when one is waiting' })
  evolutionStatus() {
    return this.evolution.status();
  }

  @Post('evolution/connect')
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ask Evolution to start pairing and return a fresh QR' })
  async evolutionConnect() {
    await this.evolution.fetchQr().catch(() => null);
    return this.evolution.status();
  }

  /**
   * Inbound messages relayed by Evolution.
   *
   * Public, because Evolution posts here unauthenticated. It does not sign payloads the way Meta
   * does, so the shared token on the query string is the only thing distinguishing a real delivery
   * from anyone who found the URL — configure the webhook in Evolution as
   * `/api/whatsapp/evolution/webhook?token=...`.
   */
  @Post('evolution/webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Inbound messages from Evolution (shared-token authorised)' })
  async evolutionWebhook(@Query('token') token: string, @Body() body: Record<string, unknown>) {
    if (!this.evolution.verifyWebhookToken(token)) {
      throw new UnauthorizedException('Invalid webhook token');
    }
    await this.evolution.handleWebhook(body);
    return 'EVENT_RECEIVED';
  }

  // ── QR-linked session (interim, until Cloud API verification completes) ──
  //
  // Management only. Linking a device to the clinic's WhatsApp gives whoever holds it the whole
  // conversation history, so it is not something reception should be able to do.

  @Get('web/status')
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER)
  @ApiOperation({ summary: 'QR session state, including the pairing code when one is waiting' })
  webStatus() {
    return this.webService.status();
  }

  @Post('web/connect')
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start the QR session — poll web/status for the code' })
  async webConnect() {
    await this.webService.connect();
    return this.webService.status();
  }

  @Post('web/new-qr')
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER)
  @HttpCode(HttpStatus.OK)
  async newWebQr() {
    await this.webService.newQr();
    return this.webService.status();
  }

  @Post('web/sync-contacts')
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER)
  @HttpCode(HttpStatus.OK)
  async syncWebContacts() {
    await this.webService.syncContacts();
    return this.webService.status();
  }

  @Post('web/logout')
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unlink the device and forget the session' })
  async webLogout() {
    await this.webService.logout();
    return this.webService.status();
  }

  @Get('webhook')
  @Public()
  @ApiOperation({ summary: 'Meta webhook verification handshake' })
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const result = this.whatsAppService.verifyWebhook(mode, token, challenge);
    if (result !== null) {
      res.status(200).send(result);
    } else {
      res.status(403).send('Forbidden');
    }
  }

  /**
   * Inbound messages from Meta.
   *
   * Public by necessity, so the signature is the only thing separating a real patient message from
   * anyone who has guessed the URL. Unsigned and wrongly signed requests are both rejected — the
   * Facebook webhook waves requests through when its secret is unset, and that is a convenience
   * this endpoint deliberately does not copy: an integration nobody has configured has no business
   * writing into the clinic's conversation history.
   */
  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Inbound WhatsApp messages (signed by Meta)' })
  async receiveWebhook(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

    if (!this.whatsAppService.verifySignature(rawBody, signature)) {
      throw new UnauthorizedException('Invalid WhatsApp webhook signature');
    }

    await this.whatsAppService.handleInbound(body);
    // Meta retries anything that is not a 2xx, so only acknowledge once the message is stored.
    return 'EVENT_RECEIVED';
  }

  @Get('status')
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER)
  @ApiOperation({ summary: 'Whether WhatsApp is configured, and what is missing' })
  status() {
    return this.whatsAppService.status();
  }
}
