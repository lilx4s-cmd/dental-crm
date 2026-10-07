import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, RawBodyRequest, Req } from '@nestjs/common';
import { Request } from 'express';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ALL_STAFF, JwtPayload } from '@dental-crm/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Permission } from '../common/decorators/permission.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CALL_ROLES } from './calling.policy';
import { CallingService } from './calling.service';
import { TelnyxProvider } from './telnyx.provider';
class StartCallDto {
  @IsUUID() id: string;
  @IsUUID() leadId: string;
}
class SaveCallDto {
  @IsIn(['ANSWERED', 'MISSED', 'VOICEMAIL', 'BUSY', 'FAILED']) @IsOptional() outcome?: 'ANSWERED' | 'MISSED' | 'VOICEMAIL' | 'BUSY' | 'FAILED';
  @IsString() @MaxLength(2000) @IsOptional() notes?: string;
  @IsDateString() @IsOptional() followUpAt?: string;
}
@Controller('calling')
@Roles(...CALL_ROLES)
export class CallingController {
  constructor(private readonly service: CallingService) {}
  @Get('status') @Permission('calls.read') status(@CurrentUser() user: JwtPayload) { return this.service.status(user); }
  @Get('queue') @Permission('calls.read') queue(@Query('search') search: string, @CurrentUser() user: JwtPayload) { return this.service.queue(user, search); }
  @Get('history') @Permission('calls.read') history(@CurrentUser() user: JwtPayload) { return this.service.history(user); }
  @Post('session') @Permission('calls.place') @Roles('SALES_CONSULTANT', 'RECEPTION') session(@CurrentUser() user: JwtPayload) { return this.service.session(user); }
  @Post('attempts') @Permission('calls.place') @Roles('SALES_CONSULTANT', 'RECEPTION') start(@Body() dto: StartCallDto, @CurrentUser() user: JwtPayload) { return this.service.start(dto.id, dto.leadId, user); }
  @Get('attempts/:id') @Permission('calls.read') attempt(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) { return this.service.findAttempt(id, user); }
  @Post('attempts/:id/stop') @Roles(...ALL_STAFF) stop(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) { return this.service.stop(id, user); }
  @Patch('attempts/:id') @Permission('calls.place') @Roles('SALES_CONSULTANT', 'RECEPTION') save(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveCallDto, @CurrentUser() user: JwtPayload) { return this.service.save(id, dto, user); }
}
@Controller('calling/webhook')
export class CallingWebhookController {
  constructor(private readonly provider: TelnyxProvider, private readonly service: CallingService) {}
  @Post() @Public() @HttpCode(200)
  async receive(@Req() req: RawBodyRequest<Request>, @Headers('telnyx-timestamp') timestamp: string, @Headers('telnyx-signature-ed25519') signature: string) {
    this.provider.verifyWebhook(req.rawBody, timestamp, signature);
    await this.service.webhook(req.body);
    return { received: true };
  }
}
