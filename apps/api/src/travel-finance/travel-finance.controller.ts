import { TicketExtractionService } from './ticket-extraction.service';
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { JwtPayload, Role } from '@dental-crm/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Permission } from '../common/decorators/permission.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ALL_STAFF } from '../common/access-policy';
import { TravelFinanceService } from './travel-finance.service';
import { GoogleCalendarService } from './google-calendar.service';
@Controller('travel')
@Roles(...ALL_STAFF)
export class TravelController {
  constructor(
    private service: TravelFinanceService,
    private google: GoogleCalendarService,
    private extraction: TicketExtractionService,
  ) {}
  @Get() @Permission('leads.read') monthly(
    @Query() q: Record<string, string>,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.service.monthly(q, u);
  }
  @Get('case/:leadId') @Permission('leads.read') caseContext(
    @Param('leadId') id: string,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.service.caseContext(id, u);
  }
  @Post('bookings') @Permission('leads.write') save(
    @Body() body: unknown,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.service.saveBooking(body, u);
  }
  @Get('bookings/:id') @Permission('leads.read') booking(
    @Param('id') id: string,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.service.booking(id, u);
  }
  @Post('bookings/:id/attachments') @Permission('leads.write') attachment(
    @Param('id') id: string,
    @Body('fileId') fileId: string,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.service.attach(id, fileId, u);
  }
  @Post('bookings/:id/retry') @Permission('leads.write') retry(
    @Param('id') id: string,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.service.retry(id, u);
  }
  @Post('bookings/:id/extraction') @Permission('leads.write') async extract(
    @Param('id') id: string,
    @Body('fileId') fileId: string,
    @CurrentUser() u: JwtPayload,
  ) {
    await this.service.booking(id, u);
    return this.extraction.queue(id, fileId, u);
  }
  @Get('bookings/:id/extraction') @Permission('leads.read') async suggestions(
    @Param('id') id: string,
    @CurrentUser() u: JwtPayload,
  ) {
    await this.service.booking(id, u);
    return this.extraction.status(id);
  }
  @Get('catalog') @Permission('leads.read') catalog(@CurrentUser() u: JwtPayload) {
    return this.service.catalog(u);
  }
  @Get('earnings') earnings(
    @Query('month') month: string,
    @Query('staffId') staffId: string,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.service.earnings(month, u, staffId);
  }
}
@Controller('operations-finance')
@Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER)
export class OperationsFinanceController {
  constructor(
    private service: TravelFinanceService,
    private google: GoogleCalendarService,
  ) {}
  @Get('overview') @Permission('finance.read') overview(
    @Query('month') month: string,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.service.overview(month, u);
  }
  @Get('catalog') @Permission('finance.read') history(@CurrentUser() u: JwtPayload) {
    return this.service.catalogHistory(u);
  }
  @Post('catalog') @Permission('finance.write') catalog(
    @Body() body: unknown,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.service.setCatalog(body, u);
  }
  @Get('costs/:leadId') @Permission('finance.read') costs(
    @Param('leadId') id: string,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.service.costs(id, u);
  }
  @Get('summary/:leadId') @Permission('finance.read') summary(
    @Param('leadId') id: string,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.service.caseSummary(id, u);
  }
  @Post('costs') @Permission('finance.write') saveCosts(
    @Body() body: unknown,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.service.saveCosts(body, u);
  }
  @Get('compensation') @Permission('finance.read') compensation(@CurrentUser() u: JwtPayload) {
    return this.service.compensation(u);
  }
  @Post('compensation') @Permission('finance.write') rule(
    @Body() body: unknown,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.service.rule(body, u);
  }
  @Post('salary') @Permission('finance.write') salary(
    @Body('month') month: string,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.service.salary(month, u);
  }
  @Patch('commissions/:id') @Permission('finance.write') action(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.service.commissionAction(id, body, u);
  }
  @Post('expenses') @Permission('finance.write') expense(
    @Body() body: unknown,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.service.expense(body, u);
  }
  @Get('expenses') @Permission('finance.read') expenses(
    @Query('month') month: string,
    @Query('page') page: string,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.service.expenses(
      month,
      u,
      Math.max(1, Math.min(10000, Math.floor(Number(page) || 1))),
    );
  }
  @Patch('expenses/:id') @Permission('finance.write') expenseStatus(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.service.expenseStatus(id, body, u);
  }
  @Post('commissions/:id/adjustments') @Permission('finance.write') adjustment(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.service.commissionAdjustment(id, body, u);
  }
  @Get('commissions') @Permission('finance.read') commissions(
    @Query('month') month: string,
    @Query('page') page: string,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.service.commissions(
      month,
      u,
      Math.max(1, Math.min(10000, Math.floor(Number(page) || 1))),
    );
  }
  @Post('commissions/shared') @Permission('finance.write') shared(
    @Body() body: unknown,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.service.sharedCommission(body, u);
  }
  @Get('audit') @Permission('finance.read') audit(@CurrentUser() u: JwtPayload) {
    return this.service.audit(u);
  }
  @Get('google') @Permission('settings.read') googleStatus() {
    return this.google.status();
  }
  @Post('google/connect') @Permission('settings.write') connect(@CurrentUser() u: JwtPayload) {
    return this.google.connect(u.sub);
  }
  @Get('google/calendars') @Permission('settings.read') calendars() {
    return this.google.calendars();
  }
  @Post('google/calendar') @Permission('settings.write') calendar(@Body('calendarId') id: string) {
    return this.google.selectCalendar(id);
  }
  @Post('google/disconnect') @Permission('settings.write') disconnect() {
    return this.google.disconnect();
  }
  @Get('google/callback') @Public() callback(
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    return this.google.callback(code, state);
  }
}
