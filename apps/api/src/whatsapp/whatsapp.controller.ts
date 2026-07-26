import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@dental-crm/shared';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppWebService } from './whatsapp-web.service';

@ApiTags('whatsapp')
@Controller('whatsapp')
export class WhatsAppController {
  constructor(
    private readonly whatsAppService: WhatsAppService,
    private readonly webService: WhatsAppWebService,
  ) {}

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
