import { ForbiddenException } from '@nestjs/common';
import { JwtPayload, hasPermission } from '@dental-crm/shared';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
export const CALL_ROLES = ['SUPER_ADMIN', 'CLINIC_MANAGER', 'SALES_CONSULTANT', 'RECEPTION'] as const;
export function canPlaceCalls(user: JwtPayload): boolean {
  return ['SALES_CONSULTANT', 'RECEPTION'].includes(user.role)
    && hasPermission(user, 'calls.place', true)
    && hasPermission(user, 'calls.read', true)
    && hasPermission(user, 'leads.read', true);
}
export function assertPlaceCalls(user: JwtPayload) {
  if (!canPlaceCalls(user)) throw new ForbiddenException('Your profile cannot place patient calls.');
}
// +1 alone also covers Caribbean destinations. Country validation keeps this US/Canada only.
export function callableNumber(value: string | null, country?: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/^00/, '+');
  const region = country?.toUpperCase();
  const number = parsePhoneNumberFromString(normalized, region === 'US' || region === 'CA' ? region : undefined);
  if (!number?.isValid() || !['US', 'CA'].includes(number.country ?? '')) return null;
  if (number.nationalNumber.startsWith('900') || number.nationalNumber.slice(3, 6) === '976') return null;
  return number.number;
}
export const TERMINAL = ['ENDED', 'FAILED', 'CANCELLED'];
