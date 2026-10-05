import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Role, JwtPayload } from '@dental-crm/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permission } from '../common/decorators/permission.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { StaffAlertsService } from './staff-alerts.service';
@Controller('staff-alerts')
export class StaffAlertsController {
  constructor(private readonly alerts: StaffAlertsService) {}
  @Post('leads/:id/contact') @Permission('leads.write') contact(
    @Param('id') id: string,
    @CurrentUser() u: JwtPayload,
    @Body() body: unknown,
  ) {
    return this.alerts.recordContact(id, body, u);
  }
  @Get('me') me(@CurrentUser() u: JwtPayload) {
    return this.alerts.status(u.sub);
  }
  @Patch('me') preferences(
    @CurrentUser() u: JwtPayload,
    @Body('phone') phone: unknown,
    @Body('preferences') preferences: unknown,
  ) {
    return this.alerts.preferences(u.sub, phone, preferences);
  }
  @Post('devices') subscribe(@CurrentUser() u: JwtPayload, @Body() body: unknown) {
    return this.alerts.subscribe(u.sub, body);
  }
  @Post('devices/check') check(@CurrentUser() u: JwtPayload, @Body('endpoint') endpoint: string) {
    return this.alerts.deviceCheck(u.sub, endpoint);
  }
  @Delete('devices') unsubscribe(@CurrentUser() u: JwtPayload, @Body('endpoint') endpoint: string) {
    return this.alerts.unsubscribe(u.sub, endpoint);
  }
  @Post('test-push') pushTest(@CurrentUser() u: JwtPayload) {
    return this.alerts.test(u.sub, 'PUSH');
  }
  @Get('admin') @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER) admin() {
    return this.alerts.admin();
  }
  @Patch('settings') @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER) settings(@Body() body: unknown) {
    return this.alerts.updateSettings(body);
  }
  @Patch('staff/:id') @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER) staff(
    @Param('id') id: string,
    @Body('phone') phone: unknown,
    @Body('preferences') preferences: unknown,
  ) {
    return this.alerts.preferences(id, phone, preferences);
  }
  @Post('staff/:id/test') @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER) test(
    @Param('id') id: string,
  ) {
    return this.alerts.test(id, 'WHATSAPP');
  }
}
