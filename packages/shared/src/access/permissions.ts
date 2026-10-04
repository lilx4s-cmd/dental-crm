import { JwtPayload } from '../types/user.types';
import { Role } from '../enums';

export const ACCESS_MODULES = [
  ['leads', 'Deals and follow-ups'],
  ['conversations', 'Conversations'],
  ['patients', 'Patient records'],
  ['appointments', 'Appointments'],
  ['plans', 'Treatment plans'],
  ['finance', 'Finance'],
  ['reports', 'Reports'],
  ['campaigns', 'Campaigns'],
  ['settings', 'Clinic settings'],
] as const;
export const SPECIAL_PERMISSIONS = [
  ['leads.all', 'See all salespeople’s leads'],
  ['leads.assign', 'Reassign leads'],
  ['leads.review', 'Supervise leads and review corrections'],
  ['conversations.all', 'See all work-account conversations'],
  ['conversations.supervise', 'Inspect and disconnect team WhatsApp sessions'],
  ['conversations.send', 'Send and retry WhatsApp messages'],
] as const;
export const PERMISSION_KEYS = [
  ...ACCESS_MODULES.flatMap(([key]) => [`${key}.read`, `${key}.write`]),
  ...SPECIAL_PERMISSIONS.map(([key]) => key),
];
export function hasPermission(
  user: Pick<JwtPayload, 'role' | 'permissions'> | null | undefined,
  key: string,
  fallback = false,
): boolean {
  if (!user) return false;
  const override = user.permissions?.[key];
  return typeof override === 'boolean' ? override : fallback;
}
export function canSupervise(
  user: Pick<JwtPayload, 'role' | 'permissions'> | null | undefined,
): boolean {
  return hasPermission(user, 'leads.review', user?.role === Role.SUPER_ADMIN);
}
export function canSeeAllLeads(
  user: Pick<JwtPayload, 'role' | 'permissions'> | null | undefined,
): boolean {
  return hasPermission(user, 'leads.all', user?.role === Role.SUPER_ADMIN);
}
export const ROUTE_PERMISSIONS: Record<string, string> = {
  '/team': 'leads.assign',
  '/dashboard': 'reports.read',
  '/pipeline': 'leads.read',
  '/my-day': 'leads.read',
  '/patients': 'patients.read',
  '/inbox': 'conversations.read',
  '/whatsapp': 'conversations.read',
  '/appointments': 'appointments.read',
  '/finance': 'finance.read',
  '/reports': 'reports.read',
  '/campaigns': 'campaigns.read',
  '/settings': 'settings.read',
  '/supervision': 'leads.read',
};
