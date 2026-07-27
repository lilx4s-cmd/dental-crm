import { Controller, Get, Post, Query, Body, Req, Res, HttpCode, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { FacebookService } from './facebook.service';

@Controller('facebook')
export class FacebookController {
  constructor(private readonly facebookService: FacebookService) {}

  @Get('webhook')
  @Public()
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const result = this.facebookService.verifyWebhook(mode, token, challenge);
    if (result !== null) {
      res.status(200).send(result);
    } else {
      res.status(403).send('Forbidden');
    }
  }

  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  async receiveWebhook(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

    // Verify or refuse — the same rule the WhatsApp webhook follows. This previously waved a
    // request through whenever the signature header or the app secret was absent, which meant
    // anyone who found the URL could post lead payloads straight into the pipeline, and an
    // unconfigured integration was the easiest way to be wide open. An endpoint nobody has
    // configured has no business writing into the clinic's records.
    if (!this.facebookService.verifySignature(rawBody, signature)) {
      throw new UnauthorizedException('Invalid Facebook webhook signature');
    }

    await this.facebookService.handleLeadGenEvent(body);
    return 'EVENT_RECEIVED';
  }
}
