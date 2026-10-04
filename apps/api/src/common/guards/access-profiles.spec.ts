import { Controller, Get, Post } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { Public } from '../decorators/public.decorator';
import { Permission } from '../decorators/permission.decorator';
import { JwtPayload } from '@dental-crm/shared';
@Controller('leads')
class LeadRoutes {
  @Get() @Roles('SUPER_ADMIN', 'SALES_CONSULTANT') read() {}
  @Post() @Roles('SUPER_ADMIN', 'SALES_CONSULTANT') write() {}
  @Post('cleanup') @Roles('SUPER_ADMIN') cleanup() {}
  @Post('transfer') @Roles('SUPER_ADMIN') @Permission('leads.assign') transfer() {}
  @Get('public') @Public() publicRoute() {}
}
@Controller('patients')
class PatientRoutes {
  @Get('economics') @Roles('SUPER_ADMIN', 'CLINIC_MANAGER') economics() {}
}
function context(
  user: JwtPayload | undefined,
  handler: () => void,
  method = 'GET',
  controller: new () => object = LeadRoutes,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user, method }) }),
  } as unknown as ExecutionContext;
}
const staff: JwtPayload = { sub: 'staff', email: 's@test.com', role: 'SALES_CONSULTANT' };
const guard = new RolesGuard(new Reflector());
describe('Access profile enforcement', () => {
  it('denies a direct write even when the base role usually allows it', () => {
    expect(
      guard.canActivate(
        context(
          { ...staff, permissions: { 'leads.read': true, 'leads.write': false } },
          LeadRoutes.prototype.write,
          'POST',
        ),
      ),
    ).toBe(false);
  });
  it('keeps read-only access usable', () => {
    expect(
      guard.canActivate(
        context(
          { ...staff, permissions: { 'leads.read': true, 'leads.write': false } },
          LeadRoutes.prototype.read,
        ),
      ),
    ).toBe(true);
  });
  it('allows a specifically delegated transfer but not owner-only database cleanup', () => {
    const user = { ...staff, permissions: { 'leads.assign': true, 'leads.write': true } };
    expect(guard.canActivate(context(user, LeadRoutes.prototype.transfer, 'POST'))).toBe(true);
    expect(guard.canActivate(context(user, LeadRoutes.prototype.cleanup, 'POST'))).toBe(false);
  });
  it('does not let patient access bypass a finance restriction', () => {
    expect(
      guard.canActivate(
        context(
          { ...staff, permissions: { 'patients.read': true, 'finance.read': false } },
          PatientRoutes.prototype.economics,
          'GET',
          PatientRoutes,
        ),
      ),
    ).toBe(false);
  });
  it('preserves intentionally public routes', () => {
    expect(guard.canActivate(context(undefined, LeadRoutes.prototype.publicRoute))).toBe(true);
  });
});
