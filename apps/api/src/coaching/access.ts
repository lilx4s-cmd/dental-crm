import { JwtPayload, Role, canSeeAllLeads, canSupervise, hasPermission } from '@dental-crm/shared';
import { Prisma } from '@prisma/client';
export const mayManage = (user: JwtPayload) => hasPermission(user, 'supervision.manage', canSupervise(user) || user.role === Role.CLINIC_MANAGER);
export const mayViewTeam = (user: JwtPayload) => hasPermission(user, 'issues.view_team', mayManage(user));
export const mayEditRules = (user: JwtPayload) => hasPermission(user, 'sales_rules.edit', user.role === Role.SUPER_ADMIN);
export function leadScope(user: JwtPayload): Prisma.LeadWhereInput {
  if (!hasPermission(user,'leads.read',['SUPER_ADMIN','CLINIC_MANAGER','SALES_CONSULTANT','RECEPTION'].includes(user.role))) return {id:'__no_access__'};
  if (canSeeAllLeads(user)) return {};
  return { OR: [{ assignedToId: user.sub }, ...(mayViewTeam(user) ? [{ supervisorId: user.sub }] : [])] };
}
export function teamLeadScope(user: JwtPayload): Prisma.LeadWhereInput {
  return canSeeAllLeads(user) ? {} : { supervisorId: user.sub };
}
export function issueScope(user: JwtPayload): Prisma.CoachingIssueWhereInput {
  const own = hasPermission(user, 'issues.view_own', true);
  return { OR: [...(own ? [{ assignedUserId: user.sub }] : []), ...(mayViewTeam(user) ? [{ lead: teamLeadScope(user) }] : [])] };
}
