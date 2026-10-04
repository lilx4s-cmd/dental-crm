import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission } from '@dental-crm/shared';
import { PATH_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSION_KEY } from '../decorators/permission.decorator';
import { Role } from '@dental-crm/shared';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtPayload } from '@dental-crm/shared';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]) === true) return true;
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<{ user: JwtPayload; method?: string }>();
    const fallback = !requiredRoles?.length || requiredRoles.includes(request.user?.role);
    const permission = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    if (typeof permission === 'string') return hasPermission(request.user, permission, fallback);
    const path = this.reflector.get<string>(PATH_METADATA, context.getClass());
    if (path === 'whatsapp') return fallback && hasPermission(request.user, 'conversations.supervise', true);
    const resources: Record<string, string> = {
      leads: 'leads', conversations: 'conversations', patients: 'patients',
      appointments: 'appointments', 'treatment-plans': 'plans', warranties: 'plans',
      'lab-orders': 'plans', invoices: 'finance', payments: 'finance', reports: 'reports',
      dashboard: 'reports', campaigns: 'campaigns', settings: 'settings', tags: 'leads', 'message-templates': 'conversations',
    };
    // Owner-only maintenance endpoints keep their explicit restriction. Delegated actions opt in.
    if (requiredRoles?.length === 1 && requiredRoles[0] === Role.SUPER_ADMIN) return fallback;
    let resource = resources[path];
    if (['patients', 'plans'].includes(resource) && requiredRoles?.length === 2 && requiredRoles.includes(Role.SUPER_ADMIN) && requiredRoles.includes(Role.CLINIC_MANAGER)) resource = 'finance';
    if (!resource) return fallback;
    const action = request.method === 'GET' || request.method === 'HEAD' ? 'read' : 'write';
    return hasPermission(request.user, `${resource}.${action}`, fallback);
  }
}
